import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.js';
import { MembershipStatus, OrganizationRole, Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import type { MailPayload } from '../mail/mail-transport.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { resolveEffectiveStatus } from './entitlement.js';
import { daysRemaining } from './clock.js';

type DeliveryPayload = { mail: MailPayload; ownerUserId?: string; attemptedProvider?: string };
const RETRY_MS = 5 * 60_000;
// Resend retains idempotency keys for 24 hours. Stop before that protection expires.
const SAFE_RETRY_MS = 23 * 60 * 60_000;

@Injectable()
export class SubscriptionDeliveryService {
  private readonly logger = new Logger(SubscriptionDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async enqueue(tx: Prisma.TransactionClient, input: {
    organizationId: string; kind: string; periodKey: string;
    to: string; subject: string; text: string;
    ctaLabel?: string; ctaUrl?: string; ownerUserId?: string;
  }) {
    const payload: DeliveryPayload = {
      mail: this.mail.prepareText(input),
      ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
    };
    // Atomic insert before any network request; independent ledger row per recipient.
    await tx.subscriptionNotification.createMany({
      data: [{
        organizationId: input.organizationId, kind: input.kind, periodKey: input.periodKey,
        sentAt: null, deliveryState: 'QUEUED',
        payload: payload as unknown as Prisma.InputJsonValue,
      }],
      skipDuplicates: true,
    });
  }

  async drain() {
    const now = new Date();
    const rows = await this.prisma.subscriptionNotification.findMany({
      where: {
        nextAttemptAt: { lte: now },
        OR: [
          { deliveryState: 'QUEUED' },
          { deliveryState: 'SENDING', leaseUntil: { lte: now } },
        ],
      },
      orderBy: { nextAttemptAt: 'asc' }, take: 100,
    });
    for (const row of rows) {
      try {
        const claimedAt = new Date();
        const leaseUntil = new Date(claimedAt.getTime() + RETRY_MS);
        const claimed = await this.prisma.subscriptionNotification.updateMany({
          where: {
            id: row.id, nextAttemptAt: { lte: claimedAt },
            OR: [
              { deliveryState: 'QUEUED' },
              { deliveryState: 'SENDING', leaseUntil: { lte: claimedAt } },
            ],
          },
          data: { deliveryState: 'SENDING', leaseUntil },
        });
        if (!claimed.count) continue;
        // Re-read after claiming: another worker may have attempted this row since the scan.
        const current = await this.prisma.subscriptionNotification.findUniqueOrThrow({ where: { id: row.id } });
        const payload = current.payload as unknown as DeliveryPayload | null;
        if (!payload?.mail?.to) {
          await this.finish(row.id, leaseUntil, 'REVIEW', 'Missing delivery payload');
          continue;
        }
        const organization = await this.prisma.organization.findFirst({
          where: { id: row.organizationId, deletedAt: null }, include: { subscription: true },
        });
        const owner = payload.ownerUserId ? await this.prisma.organizationMember.findFirst({
          where: {
            organizationId: row.organizationId, userId: payload.ownerUserId,
            role: OrganizationRole.OWNER, status: MembershipStatus.ACTIVE,
            user: { email: payload.mail.to },
          }, select: { id: true },
        }) : true;
        if (!organization || !owner) {
          await this.finish(row.id, leaseUntil, 'CANCELLED', 'Workspace deleted or recipient no longer an active Owner at this address');
          continue;
        }
        // Do not send a queued reminder after renewal, activation, or a date extension superseded it.
        const subscription = organization.subscription;
        const kind = row.kind.replace(/^PLATFORM_/, '');
        if (!current.firstAttemptAt && subscription && /^(TRIAL_REMINDER_|RENEWAL_)\d+$/.test(kind)) {
          const trial = kind.startsWith('TRIAL_REMINDER_');
          const status = resolveEffectiveStatus({ ...subscription, storedStatus: subscription.status }, claimedAt);
          const end = trial ? subscription.trialEndsAt : subscription.currentPeriodEnd;
          const milestone = Number(kind.match(/(\d+)$/)?.[1]);
          const stillDue = end && (milestone === 0
            ? claimedAt.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)
            : daysRemaining(claimedAt, end) === milestone);
          if (!stillDue || status !== (trial ? 'TRIALING' : 'ACTIVE') ||
            end?.toISOString() !== row.periodKey.split(':owner:')[0]) {
            await this.finish(row.id, leaseUntil, 'CANCELLED', 'Reminder superseded by the current subscription');
            continue;
          }
        }
        const provider = this.config.get('EMAIL_PROVIDER', { infer: true })?.toLowerCase() ?? 'smtp';
        if (current.firstAttemptAt && (provider !== 'resend' || payload.attemptedProvider !== provider ||
          claimedAt.getTime() - current.firstAttemptAt.getTime() >= SAFE_RETRY_MS)) {
          await this.finish(row.id, leaseUntil, 'REVIEW', 'Delivery outcome uncertain; inspect provider history before retrying');
          this.logger.error(`Subscription email ${row.id} requires delivery review (organization ${row.organizationId})`);
          continue;
        }
        const attempt = await this.prisma.subscriptionNotification.updateMany({
          where: { id: row.id, deliveryState: 'SENDING', leaseUntil },
          data: {
            firstAttemptAt: current.firstAttemptAt ?? claimedAt,
            payload: { ...payload, attemptedProvider: provider } as unknown as Prisma.InputJsonValue,
          },
        });
        if (!attempt.count) continue;
        let result: 'sent' | 'skipped' | 'failed';
        try {
          result = await this.mail.sendPrepared({ ...payload.mail, idempotencyKey: `subscription/${row.id}` });
        } catch {
          result = 'failed';
        }
        await this.prisma.subscriptionNotification.updateMany({
          where: { id: row.id, deliveryState: 'SENDING', leaseUntil },
          data: {
            deliveryState: result === 'sent' ? 'SENT' : 'QUEUED',
            sentAt: result === 'sent' ? new Date() : null,
            leaseUntil: null,
            nextAttemptAt: new Date(Date.now() + RETRY_MS),
            // Skipped means no provider request; do not consume the retry window.
            ...(result === 'skipped' ? { firstAttemptAt: current.firstAttemptAt } : {}),
            lastError: result === 'sent' ? null : `Provider result: ${result}`,
          },
        });
        if (result !== 'sent') this.logger.warn(`Subscription email ${row.id}: ${result} (organization ${row.organizationId})`);
      } catch {
        // The committed subscription is independent of delivery. An expired lease is recoverable.
        this.logger.error(`Subscription email ${row.id} could not be processed (organization ${row.organizationId})`);
      }
    }
  }

  private finish(id: string, leaseUntil: Date, deliveryState: string, lastError: string) {
    return this.prisma.subscriptionNotification.updateMany({
      where: { id, deliveryState: 'SENDING', leaseUntil },
      data: { deliveryState, leaseUntil: null, lastError },
    });
  }
}
