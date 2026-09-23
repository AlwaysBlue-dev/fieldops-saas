import { SubscriptionStatus } from '../generated/prisma/client.js';
import { daysRemaining } from './clock.js';

export const EFFECTIVE_SUBSCRIPTION_STATUSES = [
  'TRIALING',
  'GRACE',
  'ACTIVE',
  'TRIAL_EXPIRED',
  'SUSPENDED',
  'CANCELLED',
] as const;

export type EffectiveSubscriptionStatus =
  (typeof EFFECTIVE_SUBSCRIPTION_STATUSES)[number];

export type PlanSnapshot = {
  id: string;
  code: string;
  name: string;
  maxUsers: number;
  maxStorageBytes: string;
  features: Record<string, unknown>;
};

export type Entitlement = {
  status: SubscriptionStatus;
  effectiveStatus: EffectiveSubscriptionStatus;
  plan: PlanSnapshot;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  activatedAt: Date | null;
  cancelAtPeriodEnd: boolean;
  trialDaysRemaining: number;
  graceDaysRemaining: number;
  readOnly: boolean;
  canMutate: boolean;
  features: Record<string, unknown>;
};

const MUTABLE_STATUSES: ReadonlySet<EffectiveSubscriptionStatus> = new Set([
  'TRIALING',
  'GRACE',
  'ACTIVE',
]);

export function isCancelledStatus(status: SubscriptionStatus): boolean {
  return (
    status === SubscriptionStatus.CANCELLED ||
    status === SubscriptionStatus.CANCELED
  );
}

export function planSnapshot(plan: {
  id: string;
  code: string;
  name: string;
  maxUsers: number;
  maxStorageBytes: bigint;
  features: unknown;
}): PlanSnapshot {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    maxUsers: plan.maxUsers,
    maxStorageBytes: plan.maxStorageBytes.toString(),
    features:
      plan.features && typeof plan.features === 'object' && !Array.isArray(plan.features)
        ? (plan.features as Record<string, unknown>)
        : {},
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
  const effectiveStatus = resolveEffectiveStatus(
    input.storedStatus,
    input.trialEndsAt,
    input.graceEndsAt,
    input.now,
  );
  const canMutate = MUTABLE_STATUSES.has(effectiveStatus);
  const evaluationPlan =
    effectiveStatus === 'TRIALING' || effectiveStatus === 'GRACE'
      ? input.trialPlan
      : input.assignedPlan;

  return {
    status: input.storedStatus,
    effectiveStatus,
    plan: evaluationPlan,
    trialStartedAt: input.trialStartedAt,
    trialEndsAt: input.trialEndsAt,
    graceEndsAt: input.graceEndsAt,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    activatedAt: input.activatedAt,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    trialDaysRemaining: daysRemaining(input.now, input.trialEndsAt),
    graceDaysRemaining:
      input.now.getTime() > (input.trialEndsAt?.getTime() ?? 0)
        ? daysRemaining(input.now, input.graceEndsAt)
        : 0,
    readOnly: !canMutate,
    canMutate,
    features: evaluationPlan.features,
  };
}

export function resolveEffectiveStatus(
  storedStatus: SubscriptionStatus,
  trialEndsAt: Date | null,
  graceEndsAt: Date | null,
  now: Date,
): EffectiveSubscriptionStatus {
  if (storedStatus === SubscriptionStatus.SUSPENDED) {
    return 'SUSPENDED';
  }
  if (isCancelledStatus(storedStatus)) {
    return 'CANCELLED';
  }
  if (storedStatus === SubscriptionStatus.ACTIVE) {
    return 'ACTIVE';
  }

  if (trialEndsAt && now.getTime() <= trialEndsAt.getTime()) {
    return 'TRIALING';
  }
  if (graceEndsAt && now.getTime() <= graceEndsAt.getTime()) {
    return 'GRACE';
  }
  if (trialEndsAt || graceEndsAt) {
    return 'TRIAL_EXPIRED';
  }
  if (storedStatus === SubscriptionStatus.PAST_DUE) {
    return 'TRIAL_EXPIRED';
  }
  return 'TRIAL_EXPIRED';
}

export function readOnlyMessage(status: EffectiveSubscriptionStatus): string {
  if (status === 'SUSPENDED') {
    return 'This workspace is suspended and read-only.';
  }
  if (status === 'CANCELLED') {
    return 'This workspace subscription is cancelled and read-only.';
  }
  return 'Your trial has ended. This workspace is read-only until it is activated.';
}

export function toSubscriptionDto(entitlement: Entitlement) {
  return {
    status: entitlement.status,
    effectiveStatus: entitlement.effectiveStatus,
    plan: entitlement.plan,
    trialStartedAt: entitlement.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: entitlement.trialEndsAt?.toISOString() ?? null,
    graceEndsAt: entitlement.graceEndsAt?.toISOString() ?? null,
    currentPeriodStart: entitlement.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: entitlement.currentPeriodEnd?.toISOString() ?? null,
    activatedAt: entitlement.activatedAt?.toISOString() ?? null,
    cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
    trialDaysRemaining: entitlement.trialDaysRemaining,
    graceDaysRemaining: entitlement.graceDaysRemaining,
    readOnly: entitlement.readOnly,
    canMutate: entitlement.canMutate,
    features: entitlement.features,
  };
}
