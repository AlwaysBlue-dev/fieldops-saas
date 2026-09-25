import {
  BillingInterval,
  PlanStatus,
  type PrismaClient,
} from '../src/generated/prisma/client.js';

const GB = 1024n * 1024n * 1024n;

/**
 * Canonical FieldKeel plan catalog.
 * Looked up by stable `code` (never by UUID).
 * Trial signup uses TRIAL_PLAN_CODE = `professional` from api/src/common/constants.ts.
 *
 * CUSTOM_BRANDING = organization logo / workspace branding.
 * ADVANCED_BRANDING = custom/advanced branding requirements (Business).
 */
export const PLAN_DEFINITIONS = [
  {
    code: 'starter',
    name: 'Starter',
    monthlyPriceCents: null as number | null,
    annualPriceCents: 29900,
    displayPrice: null as string | null,
    currency: 'USD',
    billingInterval: BillingInterval.ANNUAL,
    publiclyVisible: true,
    contactSales: false,
    sortOrder: 10,
    maxUsers: 5,
    maxStorageBytes: 5n * GB,
    features: {
      JOBS: true,
      TIMESHEETS: true,
      GPS: true,
      CLIENT_SIGNATURE: true,
      ADVANCED_REPORTS: false,
      CUSTOM_BRANDING: false,
      ADVANCED_BRANDING: false,
      gps: true,
      approvals: false,
      reports: 'basic',
      support: 'standard',
      productUpdates: true,
      positioning: 'For small field teams getting started.',
      publicHighlights: [
        'Job Management',
        'Scheduling & Dispatch',
        'Timesheets',
        'Clock In/Out',
        'GPS Evidence',
        'Client Signatures',
        'Basic Reports',
        'Standard Support',
        'Product Updates',
      ],
    },
  },
  {
    code: 'professional',
    name: 'Professional',
    monthlyPriceCents: null as number | null,
    annualPriceCents: 49900,
    displayPrice: null as string | null,
    currency: 'USD',
    billingInterval: BillingInterval.ANNUAL,
    publiclyVisible: true,
    contactSales: false,
    sortOrder: 20,
    maxUsers: 10,
    maxStorageBytes: 20n * GB,
    features: {
      JOBS: true,
      TIMESHEETS: true,
      GPS: true,
      CLIENT_SIGNATURE: true,
      ADVANCED_REPORTS: true,
      CUSTOM_BRANDING: true,
      ADVANCED_BRANDING: false,
      gps: true,
      approvals: true,
      reports: 'standard',
      support: 'standard',
      productUpdates: true,
      badge: 'Most Popular',
      positioning: 'For growing field service businesses.',
      publicHighlights: [
        'Everything in Starter',
        'Advanced Reports',
        'Approvals',
        'Safety & Job Execution',
        'Materials & Work Logs',
        'Technician Mobile Experience',
        'Standard Support',
        'Product Updates',
      ],
    },
  },
  {
    code: 'business',
    name: 'Business',
    monthlyPriceCents: null as number | null,
    annualPriceCents: null as number | null,
    displayPrice: null as string | null,
    currency: 'USD',
    billingInterval: BillingInterval.CUSTOM,
    publiclyVisible: true,
    contactSales: true,
    sortOrder: 30,
    maxUsers: 100,
    maxStorageBytes: 250n * GB,
    features: {
      JOBS: true,
      TIMESHEETS: true,
      GPS: true,
      CLIENT_SIGNATURE: true,
      ADVANCED_REPORTS: true,
      CUSTOM_BRANDING: true,
      ADVANCED_BRANDING: true,
      gps: true,
      approvals: true,
      reports: 'standard',
      support: 'standard',
      productUpdates: true,
      positioning: 'For larger field operations and organizations with higher limits or custom requirements.',
      publicHighlights: [
        'Everything in Professional',
        'Larger team limits',
        'Increased storage',
        'Advanced branding/custom requirements',
        'Commercial requirements tailored with FieldKeel',
      ],
    },
  },
] as const;

export async function upsertPlans(prisma: PrismaClient) {
  const byCode: Record<string, { id: string; code: string; name: string }> = {};

  for (const plan of PLAN_DEFINITIONS) {
    const row = await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        status: PlanStatus.ACTIVE,
        monthlyPriceCents: plan.monthlyPriceCents,
        annualPriceCents: plan.annualPriceCents,
        displayPrice: plan.displayPrice,
        currency: plan.currency,
        billingInterval: plan.billingInterval,
        publiclyVisible: plan.publiclyVisible,
        contactSales: plan.contactSales,
        sortOrder: plan.sortOrder,
        maxUsers: plan.maxUsers,
        maxStorageBytes: plan.maxStorageBytes,
        features: plan.features,
      },
      create: {
        code: plan.code,
        name: plan.name,
        status: PlanStatus.ACTIVE,
        monthlyPriceCents: plan.monthlyPriceCents,
        annualPriceCents: plan.annualPriceCents,
        displayPrice: plan.displayPrice,
        currency: plan.currency,
        billingInterval: plan.billingInterval,
        publiclyVisible: plan.publiclyVisible,
        contactSales: plan.contactSales,
        sortOrder: plan.sortOrder,
        maxUsers: plan.maxUsers,
        maxStorageBytes: plan.maxStorageBytes,
        features: plan.features,
      },
      select: { id: true, code: true, name: true },
    });
    byCode[plan.code] = row;
  }

  return byCode;
}
