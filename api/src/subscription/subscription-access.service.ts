import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TRIAL_PLAN_CODE } from '../common/constants.js';
import { PlanStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from './clock.js';
import {
  planSnapshot,
  resolveEntitlement,
  type Entitlement,
} from './entitlement.js';

@Injectable()
export class SubscriptionAccessService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async evaluate(organizationId: string, now = this.clock.now()): Promise<Entitlement> {
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
}
