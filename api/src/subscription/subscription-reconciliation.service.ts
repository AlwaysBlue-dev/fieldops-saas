import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AUDIT_SUBSCRIPTION_EXPIRED,
} from '../common/constants.js';
import { SubscriptionStatus } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { EffectiveSubscriptionStatus } from './entitlement.js';
import { SubscriptionAccessService } from './subscription-access.service.js';
import { SubscriptionNotificationService } from './subscription-notification.service.js';

const PERSISTABLE: Partial<Record<EffectiveSubscriptionStatus, SubscriptionStatus>> = {
  TRIALING: SubscriptionStatus.TRIALING,
  GRACE: SubscriptionStatus.GRACE,
  ACTIVE: SubscriptionStatus.ACTIVE,
  PAID_GRACE: SubscriptionStatus.PAID_GRACE,
  TRIAL_EXPIRED: SubscriptionStatus.TRIAL_EXPIRED,
  EXPIRED: SubscriptionStatus.EXPIRED,
};

@Injectable()
export class SubscriptionReconciliationService {
  private readonly logger = new Logger(SubscriptionReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SubscriptionAccessService,
    private readonly notifications: SubscriptionNotificationService,
    private readonly audit: AuditService,
  ) {}

  @Cron('15 6 * * *', { name: 'subscription-reconciliation', timeZone: 'UTC' })
  async handleDaily() {
    await this.reconcileAll();
  }

  async reconcileAll() {
    const subscriptions = await this.prisma.subscription.findMany({
      select: {
        id: true,
        organizationId: true,
        status: true,
        organization: { select: { name: true, slug: true } },
      },
    });
    let notified = 0;
    for (const row of subscriptions) {
      try {
        const didNotify = await this.reconcileOne(
          row.id,
          row.organizationId,
          row.organization.name,
          row.organization.slug,
          row.status,
        );
        if (didNotify) {
          notified += 1;
        }
      } catch (error) {
        this.logger.error(
          `Failed to reconcile subscription ${row.organizationId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return { scanned: subscriptions.length, notified };
  }

  async reconcileOne(
    subscriptionId: string,
    organizationId: string,
    organizationName: string,
    organizationSlug: string,
    storedStatus: SubscriptionStatus,
  ) {
    const entitlement = await this.access.evaluate(organizationId);
    const nextStatus = PERSISTABLE[entitlement.effectiveStatus];
    if (
      nextStatus &&
      nextStatus !== storedStatus &&
      storedStatus !== SubscriptionStatus.SUSPENDED &&
      storedStatus !== SubscriptionStatus.CANCELLED &&
      storedStatus !== SubscriptionStatus.CANCELED
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: { status: nextStatus },
        });
        if (
          nextStatus === SubscriptionStatus.EXPIRED ||
          nextStatus === SubscriptionStatus.TRIAL_EXPIRED
        ) {
          await this.audit.record(
            {
              action: AUDIT_SUBSCRIPTION_EXPIRED,
              entityType: 'Subscription',
              entityId: subscriptionId,
              organizationId,
              oldValues: { status: storedStatus },
              newValues: { status: nextStatus },
            },
            tx,
          );
        }
      });
    }

    await this.notifications.reconcileEntitlement(
      organizationId,
      organizationName,
      organizationSlug,
      entitlement,
    );
    return true;
  }
}
