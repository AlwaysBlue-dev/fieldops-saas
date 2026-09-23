import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SALES_EMAIL,
  TRIAL_DAYS,
  TRIAL_GRACE_DAYS,
} from '../common/constants.js';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.js';
import { PlanStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { planSnapshot } from './entitlement.js';
import { formatStorageBytes, publicHighlights } from './plan-catalog.js';

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
      supportEmail: salesEmail,
      plans: rows.map((row) => {
        const plan = planSnapshot(row);
        const highlights = publicHighlights(plan.features);
        return {
          ...plan,
          includedUsers: plan.maxUsers,
          includedStorage: formatStorageBytes(plan.maxStorageBytes),
          inclusions: plan.contactSales
            ? [
                'For teams that need more users or storage',
                'Larger operational deployments',
                'Commercial and custom requirements',
                ...highlights,
              ]
            : [
                `${TRIAL_DAYS}-day free trial`,
                'No credit card required',
                `Up to ${plan.maxUsers} users`,
                `${formatStorageBytes(plan.maxStorageBytes)} storage`,
                ...highlights,
              ],
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
