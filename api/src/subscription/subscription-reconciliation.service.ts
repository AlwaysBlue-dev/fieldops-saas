import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CLOCK, type Clock } from './clock.js';
import { SubscriptionDeliveryService } from './subscription-delivery.service.js';
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
    private readonly delivery: SubscriptionDeliveryService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Cron('*/5 * * * *', { name: 'subscription-email-delivery', timeZone: 'UTC' })
  async deliverPending() {
    await this.delivery.drain();
  }

  @Cron('15 6 * * *', { name: 'subscription-reconciliation', timeZone: 'UTC' })
  async handleDaily() {
    await this.reconcileAll();
  }

  async reconcileAll() {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { organization: { deletedAt: null } },
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
    _subscriptionId: string,
    organizationId: string,
    organizationName: string,
    organizationSlug: string,
    _storedStatus: SubscriptionStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.notifications.lockSubscription(tx, organizationId);
      const now = this.clock.now();
      const entitlement = await this.access.evaluate(organizationId, now, tx);
      const nextStatus = PERSISTABLE[entitlement.effectiveStatus];
      const transitioned = Boolean(nextStatus && nextStatus !== current.status &&
        current.status !== SubscriptionStatus.SUSPENDED &&
        current.status !== SubscriptionStatus.CANCELLED &&
        current.status !== SubscriptionStatus.CANCELED);
      if (transitioned && nextStatus) {
        await tx.subscription.update({ where: { id: current.id }, data: { status: nextStatus } });
        if (nextStatus === SubscriptionStatus.EXPIRED || nextStatus === SubscriptionStatus.TRIAL_EXPIRED) {
          await this.audit.record({
            action: AUDIT_SUBSCRIPTION_EXPIRED, entityType: 'Subscription', entityId: current.id,
            organizationId, oldValues: { status: current.status }, newValues: { status: nextStatus },
          }, tx);
        }
      }
      await this.notifications.reconcileEntitlement(
        organizationId, organizationName, organizationSlug, entitlement, tx, transitioned, now,
      );
      return true;
    });
  }
}
