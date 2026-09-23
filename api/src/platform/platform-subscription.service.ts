import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_SUBSCRIPTION_ACTIVATED,
  AUDIT_SUBSCRIPTION_CANCELLED,
  AUDIT_SUBSCRIPTION_REACTIVATED,
  AUDIT_SUBSCRIPTION_SUSPENDED,
  AUDIT_TRIAL_EXTENDED,
  TRIAL_GRACE_DAYS,
} from '../common/constants.js';
import { PlanStatus, SubscriptionStatus } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, addUtcDays, type Clock } from '../subscription/clock.js';
import type { ActivateSubscriptionDto } from '../subscription/dto/activate-subscription.dto.js';
import type { ExtendTrialDto } from '../subscription/dto/extend-trial.dto.js';
import { toSubscriptionDto } from '../subscription/entitlement.js';
import { SubscriptionAccessService } from '../subscription/subscription-access.service.js';

@Injectable()
export class PlatformSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SubscriptionAccessService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async activate(
    organizationId: string,
    actorUserId: string,
    dto: ActivateSubscriptionDto,
  ) {
    const subscription = await this.requireSubscription(organizationId);
    const plan = await this.resolvePlan(dto.planId, dto.planCode);
    const currentPeriodStart = new Date(dto.currentPeriodStart);
    const currentPeriodEnd = new Date(dto.currentPeriodEnd);
    if (currentPeriodEnd.getTime() <= currentPeriodStart.getTime()) {
      throw new BadRequestException('currentPeriodEnd must be after currentPeriodStart');
    }

    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          planId: plan.id,
          currentPeriodStart,
          currentPeriodEnd,
          activatedAt: now,
          activatedByUserId: actorUserId,
          cancelAtPeriodEnd: false,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_SUBSCRIPTION_ACTIVATED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: {
            status: subscription.status,
            planId: subscription.planId,
          },
          newValues: {
            status: SubscriptionStatus.ACTIVE,
            planId: plan.id,
            currentPeriodStart: currentPeriodStart.toISOString(),
            currentPeriodEnd: currentPeriodEnd.toISOString(),
          },
        },
        tx,
      );
    });

    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  async extendTrial(
    organizationId: string,
    actorUserId: string,
    dto: ExtendTrialDto,
  ) {
    const subscription = await this.requireSubscription(organizationId);
    const days = dto.days ?? 14;
    const now = this.clock.now();
    const base =
      subscription.trialEndsAt && subscription.trialEndsAt.getTime() > now.getTime()
        ? subscription.trialEndsAt
        : now;
    const trialEndsAt = addUtcDays(base, days);
    const graceEndsAt = addUtcDays(trialEndsAt, TRIAL_GRACE_DAYS);
    const trialStartedAt = subscription.trialStartedAt ?? now;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.TRIALING,
          trialStartedAt,
          trialEndsAt,
          graceEndsAt,
          cancelAtPeriodEnd: false,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_TRIAL_EXTENDED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: {
            trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
            graceEndsAt: subscription.graceEndsAt?.toISOString() ?? null,
          },
          newValues: {
            days,
            trialEndsAt: trialEndsAt.toISOString(),
            graceEndsAt: graceEndsAt.toISOString(),
          },
        },
        tx,
      );
    });

    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  async suspend(organizationId: string, actorUserId: string) {
    const subscription = await this.requireSubscription(organizationId);
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.SUSPENDED },
      });
      await this.audit.record(
        {
          action: AUDIT_SUBSCRIPTION_SUSPENDED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: { status: subscription.status },
          newValues: { status: SubscriptionStatus.SUSPENDED },
        },
        tx,
      );
    });
    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  async reactivate(organizationId: string, actorUserId: string) {
    const subscription = await this.requireSubscription(organizationId);
    const now = this.clock.now();
    const nextStatus = subscription.activatedAt
      ? SubscriptionStatus.ACTIVE
      : SubscriptionStatus.TRIALING;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: nextStatus,
          cancelAtPeriodEnd: false,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_SUBSCRIPTION_REACTIVATED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: { status: subscription.status },
          newValues: { status: nextStatus },
        },
        tx,
      );
    });

    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  async cancel(organizationId: string, actorUserId: string) {
    const subscription = await this.requireSubscription(organizationId);
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelAtPeriodEnd: true,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_SUBSCRIPTION_CANCELLED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: { status: subscription.status },
          newValues: { status: SubscriptionStatus.CANCELLED },
        },
        tx,
      );
    });
    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  private async requireSubscription(organizationId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { organizationId },
    });
    if (!subscription) {
      throw new NotFoundException();
    }
    return subscription;
  }

  private async resolvePlan(planId?: string, planCode?: string) {
    if (!planId && !planCode) {
      throw new BadRequestException('planId or planCode is required');
    }
    const plan = planId
      ? await this.prisma.plan.findFirst({
          where: { id: planId, status: PlanStatus.ACTIVE },
        })
      : await this.prisma.plan.findFirst({
          where: { code: planCode, status: PlanStatus.ACTIVE },
        });
    if (!plan) {
      throw new BadRequestException('Plan is not available');
    }
    return plan;
  }
}
