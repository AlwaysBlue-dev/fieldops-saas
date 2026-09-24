import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SALES_EMAIL,
  TRIAL_DAYS,
  TRIAL_GRACE_DAYS,
  TRIAL_PLAN_CODE,
} from '../common/constants.js';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.js';
import { PlanStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { planSnapshot } from './entitlement.js';
import {
  formatStorageBytes,
  publicHighlights,
} from './plan-catalog.js';
import {
  planApprovalsEnabled,
  planBadge,
  planPositioning,
  resolvePlanFeatures,
} from './plan-features.js';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async publicCatalog() {
    const rows = await this.prisma.plan.findMany({
      where: { status: PlanStatus.ACTIVE, publiclyVisible: true },
      orderBy: { sortOrder: 'asc' },
    });
    const salesEmail =
      this.config.get('PLATFORM_SALES_EMAIL', { infer: true }) ??
      DEFAULT_SALES_EMAIL;

    return {
      trialDays: TRIAL_DAYS,
      trialGraceDays: TRIAL_GRACE_DAYS,
      trialRequiresCard: false,
      trialPlanCode: TRIAL_PLAN_CODE,
      supportEmail: salesEmail,
      plans: rows.map((row) => {
        const plan = planSnapshot(row);
        const highlights = publicHighlights(plan.features);
        const featureFlags = resolvePlanFeatures(plan.features);
        return {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          priceLabel: plan.priceLabel,
          contactSales: plan.contactSales,
          billingInterval: plan.billingInterval,
          currency: plan.currency,
          annualPriceCents: plan.annualPriceCents,
          monthlyPriceCents: plan.monthlyPriceCents,
          maxUsers: plan.maxUsers,
          maxStorageBytes: plan.maxStorageBytes,
          includedUsers: plan.maxUsers,
          includedStorage: formatStorageBytes(plan.maxStorageBytes),
          positioning: planPositioning(plan.features),
          badge: planBadge(plan.features),
          highlights,
          inclusions: highlights,
          featureFlags: {
            ...featureFlags,
            APPROVALS: planApprovalsEnabled(plan.features),
          },
        };
      }),
    };
  }

  async listActivePlans() {
    const rows = await this.prisma.plan.findMany({
      where: { status: PlanStatus.ACTIVE },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((row) => planSnapshot(row));
  }
}
