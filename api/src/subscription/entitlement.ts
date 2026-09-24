import { PAID_GRACE_DAYS } from '../common/constants.js';
import { BillingInterval, SubscriptionStatus } from '../generated/prisma/client.js';
import { addUtcDays, daysRemaining } from './clock.js';
import { formatPlanPrice } from './plan-catalog.js';

export const EFFECTIVE_SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'GRACE',
  'ACTIVE',
  'PAID_GRACE',
  'TRIAL_EXPIRED',
  'EXPIRED',
  'SUSPENDED',
  'CANCELLED',
] as const;

export type EffectiveSubscriptionStatus =
  (typeof EFFECTIVE_SUBSCRIPTION_STATUSES)[number];

export type GraceKind = 'trial' | 'paid' | null;

export type PlanSnapshot = {
  id: string;
  code: string;
  name: string;
  maxUsers: number;
  maxStorageBytes: string;
  features: Record<string, unknown>;
  currency: string;
  billingInterval: BillingInterval;
  displayPrice: string | null;
  annualPriceCents: number | null;
  monthlyPriceCents: number | null;
  contactSales: boolean;
  publiclyVisible: boolean;
  priceLabel: string;
};

export type Entitlement = {
  status: SubscriptionStatus;
  effectiveStatus: EffectiveSubscriptionStatus;
  graceKind: GraceKind;
  plan: PlanSnapshot;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  paidGraceEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  activatedAt: Date | null;
  cancelAtPeriodEnd: boolean;
  trialDaysRemaining: number;
  graceDaysRemaining: number;
  daysUntilExpiration: number;
  readOnly: boolean;
  canMutate: boolean;
  features: Record<string, unknown>;
};

const MUTABLE_STATUSES: ReadonlySet<EffectiveSubscriptionStatus> = new Set([
  'TRIALING',
  'GRACE',
  'ACTIVE',
  'PAID_GRACE',
]);

export function isCancelledStatus(status: SubscriptionStatus): boolean {
  return (
    status === SubscriptionStatus.CANCELLED ||
    status === SubscriptionStatus.CANCELED
  );
}

export function isPaidLifecycle(input: {
  storedStatus: SubscriptionStatus;
  activatedAt: Date | null;
  currentPeriodEnd: Date | null;
}): boolean {
  if (input.activatedAt || input.currentPeriodEnd) {
    return true;
  }
  return (
    input.storedStatus === SubscriptionStatus.ACTIVE ||
    input.storedStatus === SubscriptionStatus.PAID_GRACE ||
    input.storedStatus === SubscriptionStatus.EXPIRED ||
    input.storedStatus === SubscriptionStatus.PAST_DUE
  );
}

export function planSnapshot(plan: {
  id: string;
  code: string;
  name: string;
  maxUsers: number;
  maxStorageBytes: bigint;
  features: unknown;
  currency?: string;
  billingInterval?: BillingInterval;
  displayPrice?: string | null;
  annualPriceCents?: number | null;
  monthlyPriceCents?: number | null;
  contactSales?: boolean;
  publiclyVisible?: boolean;
}): PlanSnapshot {
  const features =
    plan.features && typeof plan.features === 'object' && !Array.isArray(plan.features)
      ? (plan.features as Record<string, unknown>)
      : {};
  const commercial = {
    currency: plan.currency ?? 'USD',
    billingInterval: plan.billingInterval ?? BillingInterval.ANNUAL,
    displayPrice: plan.displayPrice ?? null,
    annualPriceCents: plan.annualPriceCents ?? null,
    monthlyPriceCents: plan.monthlyPriceCents ?? null,
    contactSales: plan.contactSales ?? false,
  };
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    maxUsers: plan.maxUsers,
    maxStorageBytes: plan.maxStorageBytes.toString(),
    features,
    currency: commercial.currency,
    billingInterval: commercial.billingInterval,
    displayPrice: commercial.displayPrice,
    annualPriceCents: commercial.annualPriceCents,
    monthlyPriceCents: commercial.monthlyPriceCents,
    contactSales: commercial.contactSales,
    publiclyVisible: plan.publiclyVisible ?? false,
    priceLabel: formatPlanPrice(commercial),
  };
}

export function resolveEntitlement(input: {
  storedStatus: SubscriptionStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  activatedAt: Date | null;
  cancelAtPeriodEnd: boolean;
  assignedPlan: PlanSnapshot;
  trialPlan: PlanSnapshot;
  now: Date;
}): Entitlement {
  const paid = isPaidLifecycle(input);
  const paidGraceEndsAt =
    paid && input.currentPeriodEnd
      ? addUtcDays(input.currentPeriodEnd, PAID_GRACE_DAYS)
      : null;
  const effectiveStatus = resolveEffectiveStatus(input, input.now, paid);
  const canMutate = MUTABLE_STATUSES.has(effectiveStatus);
  const evaluationPlan =
    effectiveStatus === 'TRIALING' || effectiveStatus === 'GRACE'
      ? input.trialPlan
      : input.assignedPlan;
  const graceKind: GraceKind =
    effectiveStatus === 'GRACE'
      ? 'trial'
      : effectiveStatus === 'PAID_GRACE'
        ? 'paid'
        : null;
  const expirationTarget = paid
    ? input.currentPeriodEnd
    : input.trialEndsAt;

  return {
    status: input.storedStatus,
    effectiveStatus,
    graceKind,
    plan: evaluationPlan,
    trialStartedAt: input.trialStartedAt,
    trialEndsAt: input.trialEndsAt,
    graceEndsAt: input.graceEndsAt,
    paidGraceEndsAt,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    activatedAt: input.activatedAt,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    trialDaysRemaining: paid ? 0 : daysRemaining(input.now, input.trialEndsAt),
    graceDaysRemaining:
      effectiveStatus === 'PAID_GRACE'
        ? daysRemaining(input.now, paidGraceEndsAt)
        : !paid && input.now.getTime() > (input.trialEndsAt?.getTime() ?? 0)
          ? daysRemaining(input.now, input.graceEndsAt)
          : 0,
    daysUntilExpiration: daysRemaining(input.now, expirationTarget),
    readOnly: !canMutate,
    canMutate,
    features: evaluationPlan.features,
  };
}

export function resolveEffectiveStatus(
  input: {
    storedStatus: SubscriptionStatus;
    trialEndsAt: Date | null;
    graceEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    activatedAt: Date | null;
  },
  now: Date,
  paid = isPaidLifecycle(input),
): EffectiveSubscriptionStatus {
  if (input.storedStatus === SubscriptionStatus.SUSPENDED) {
    return 'SUSPENDED';
  }
  if (isCancelledStatus(input.storedStatus)) {
    return 'CANCELLED';
  }

  if (paid) {
    if (input.currentPeriodEnd && now.getTime() <= input.currentPeriodEnd.getTime()) {
      return 'ACTIVE';
    }
    if (input.currentPeriodEnd) {
      const paidGraceEndsAt = addUtcDays(input.currentPeriodEnd, PAID_GRACE_DAYS);
      if (now.getTime() <= paidGraceEndsAt.getTime()) {
        return 'PAID_GRACE';
      }
      return 'EXPIRED';
    }
    return 'ACTIVE';
  }

  if (input.trialEndsAt && now.getTime() <= input.trialEndsAt.getTime()) {
    return 'TRIALING';
  }
  if (input.graceEndsAt && now.getTime() <= input.graceEndsAt.getTime()) {
    return 'GRACE';
  }
  if (input.trialEndsAt || input.graceEndsAt) {
    return 'TRIAL_EXPIRED';
  }
  if (input.storedStatus === SubscriptionStatus.PAST_DUE) {
    return 'TRIAL_EXPIRED';
  }
  // NONE (or any non-paid row without trial dates) — awaiting activation.
  return 'TRIAL_EXPIRED';
}

export function readOnlyMessage(status: EffectiveSubscriptionStatus): string {
  if (status === 'SUSPENDED') {
    return 'This workspace is suspended and read-only.';
  }
  if (status === 'CANCELLED') {
    return 'This workspace subscription is cancelled and read-only.';
  }
  if (status === 'EXPIRED') {
    return 'Your subscription has expired. This workspace is read-only until it is renewed.';
  }
  return 'This workspace is read-only until a subscription is activated.';
}

export type ActivationProgress = {
  state:
    | 'none'
    | 'can_request'
    | 'request_sent'
    | 'invoice_preparing'
    | 'view_invoice'
    | 'pay_invoice'
    | 'awaiting_verification'
    | 'active';
  label: string;
  invoiceId: string | null;
  canPay: boolean;
  statusLabel: string | null;
};

export function toSubscriptionDto(
  entitlement: Entitlement,
  extras: {
    usage?: {
      users: { used: number; included: number };
      storage: { usedBytes: string; includedBytes: string };
    };
    availableActions?: {
      requestActivation: boolean;
      requestRenewal: boolean;
      requestPlanChange: boolean;
      contactSupport: boolean;
    };
    openRequests?: Array<{
      id: string;
      requestType: string;
      status: string;
      createdAt: string;
    }>;
    activationProgress?: ActivationProgress;
    supportEmail?: string;
  } = {},
) {
  return {
    status: entitlement.status,
    effectiveStatus: entitlement.effectiveStatus,
    graceKind: entitlement.graceKind,
    plan: entitlement.plan,
    trialStartedAt: entitlement.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: entitlement.trialEndsAt?.toISOString() ?? null,
    graceEndsAt: entitlement.graceEndsAt?.toISOString() ?? null,
    paidGraceEndsAt: entitlement.paidGraceEndsAt?.toISOString() ?? null,
    currentPeriodStart: entitlement.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: entitlement.currentPeriodEnd?.toISOString() ?? null,
    activatedAt: entitlement.activatedAt?.toISOString() ?? null,
    cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
    trialDaysRemaining: entitlement.trialDaysRemaining,
    graceDaysRemaining: entitlement.graceDaysRemaining,
    daysUntilExpiration: entitlement.daysUntilExpiration,
    readOnly: entitlement.readOnly,
    canMutate: entitlement.canMutate,
    features: entitlement.features,
    usage: extras.usage ?? null,
    availableActions: extras.availableActions ?? {
      requestActivation:
        entitlement.effectiveStatus === 'TRIALING' ||
        entitlement.effectiveStatus === 'GRACE' ||
        entitlement.effectiveStatus === 'TRIAL_EXPIRED',
      requestRenewal:
        entitlement.effectiveStatus === 'ACTIVE' ||
        entitlement.effectiveStatus === 'PAID_GRACE' ||
        entitlement.effectiveStatus === 'EXPIRED',
      requestPlanChange:
        entitlement.effectiveStatus !== 'SUSPENDED' &&
        entitlement.effectiveStatus !== 'CANCELLED',
      contactSupport: true,
    },
    openRequests: extras.openRequests ?? [],
    activationProgress: extras.activationProgress ?? {
      state: 'none' as const,
      label: '',
      invoiceId: null,
      canPay: false,
      statusLabel: null,
    },
    supportEmail: extras.supportEmail ?? null,
  };
}
