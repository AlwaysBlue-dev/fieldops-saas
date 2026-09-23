import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TRIAL_PLAN_CODE } from '../common/constants.js';
import { PlanStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from './clock.js';
import {
  planSnapshot,
  resolveEntitlement,
  type Entitlement,
  type PlanSnapshot,
} from './entitlement.js';
import {
  featureCatalog,
  resolvePlanFeatures,
  type PlanFeature,
  type PlanFeatureFlags,
} from './plan-features.js';

@Injectable()
export class EntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async evaluate(
    organizationId: string,
    now = this.clock.now(),
  ): Promise<Entitlement> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { organizationId },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException();
    }

    const trialPlanRow = await this.prisma.plan.findFirst({
      where: { code: TRIAL_PLAN_CODE, status: PlanStatus.ACTIVE },
    });
    const trialPlan = planSnapshot(trialPlanRow ?? subscription.plan);

    return resolveEntitlement({
      storedStatus: subscription.status,
      trialStartedAt: subscription.trialStartedAt,
      trialEndsAt: subscription.trialEndsAt,
      graceEndsAt: subscription.graceEndsAt,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      activatedAt: subscription.activatedAt,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      assignedPlan: planSnapshot(subscription.plan),
      trialPlan,
      now,
    });
  }

  async getPlan(organizationId: string): Promise<PlanSnapshot> {
    const entitlement = await this.evaluate(organizationId);
    return entitlement.plan;
  }

  async getLimits(organizationId: string) {
    const plan = await this.getPlan(organizationId);
    return {
      maxUsers: plan.maxUsers,
      maxStorageBytes: plan.maxStorageBytes,
      planCode: plan.code,
      planName: plan.name,
      features: this.featuresForPlan(plan),
    };
  }

  featuresForPlan(plan: PlanSnapshot): PlanFeatureFlags {
    return resolvePlanFeatures(plan.features);
  }

  async hasFeature(
    organizationId: string,
    feature: PlanFeature,
  ): Promise<boolean> {
    const plan = await this.getPlan(organizationId);
    return this.featuresForPlan(plan)[feature];
  }

  featureList(plan: PlanSnapshot) {
    return featureCatalog(this.featuresForPlan(plan));
  }

  accessUntil(entitlement: Entitlement): string | null {
    if (
      entitlement.effectiveStatus === 'TRIALING' ||
      entitlement.effectiveStatus === 'GRACE'
    ) {
      return (
        entitlement.graceEndsAt?.toISOString() ??
        entitlement.trialEndsAt?.toISOString() ??
        null
      );
    }
    if (
      entitlement.effectiveStatus === 'ACTIVE' ||
      entitlement.effectiveStatus === 'PAID_GRACE'
    ) {
      return (
        entitlement.paidGraceEndsAt?.toISOString() ??
        entitlement.currentPeriodEnd?.toISOString() ??
        null
      );
    }
    return (
      entitlement.currentPeriodEnd?.toISOString() ??
      entitlement.graceEndsAt?.toISOString() ??
      entitlement.trialEndsAt?.toISOString() ??
      null
    );
  }
}
