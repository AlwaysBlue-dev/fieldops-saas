import { SubscriptionStatus } from '../generated/prisma/client.js';
import { addUtcDays } from './clock.js';
import { resolveEntitlement, type PlanSnapshot } from './entitlement.js';

const professional: PlanSnapshot = {
  id: 'plan-pro',
  code: 'professional',
  name: 'Professional',
  maxUsers: 25,
  maxStorageBytes: '53687091200',
  features: { gps: true, approvals: true, reports: 'standard' },
};

const starter: PlanSnapshot = {
  id: 'plan-starter',
  code: 'starter',
  name: 'Starter',
  maxUsers: 8,
  maxStorageBytes: '5368709120',
  features: { gps: true, approvals: false, reports: 'basic' },
};

function entitlement(
  storedStatus: SubscriptionStatus,
  now: Date,
  extras: Partial<{
    trialStartedAt: Date;
    trialEndsAt: Date;
    graceEndsAt: Date;
    assignedPlan: PlanSnapshot;
  }> = {},
) {
  const trialStartedAt = extras.trialStartedAt ?? addUtcDays(now, -1);
  const trialEndsAt = extras.trialEndsAt ?? addUtcDays(trialStartedAt, 14);
  const graceEndsAt = extras.graceEndsAt ?? addUtcDays(trialEndsAt, 3);
  return resolveEntitlement({
    storedStatus,
    trialStartedAt,
    trialEndsAt,
    graceEndsAt,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    activatedAt: null,
    cancelAtPeriodEnd: false,
    assignedPlan: extras.assignedPlan ?? starter,
    trialPlan: professional,
    now,
  });
}

describe('resolveEntitlement', () => {
  const now = new Date('2026-09-23T12:00:00.000Z');

  it('gives a fresh organization 14 trial days and Professional features', () => {
    const trialStartedAt = now;
    const result = entitlement(SubscriptionStatus.TRIALING, now, {
      trialStartedAt,
      trialEndsAt: addUtcDays(trialStartedAt, 14),
      graceEndsAt: addUtcDays(trialStartedAt, 17),
    });
    expect(result.effectiveStatus).toBe('TRIALING');
    expect(result.canMutate).toBe(true);
    expect(result.readOnly).toBe(false);
    expect(result.trialDaysRemaining).toBe(14);
    expect(result.graceDaysRemaining).toBe(0);
    expect(result.plan.code).toBe('professional');
    expect(result.features.approvals).toBe(true);
  });

  it('keeps mutations available during grace and reports remaining grace days', () => {
    const trialEndsAt = addUtcDays(now, -1);
    const result = entitlement(SubscriptionStatus.TRIALING, now, {
      trialStartedAt: addUtcDays(trialEndsAt, -14),
      trialEndsAt,
      graceEndsAt: addUtcDays(now, 3),
    });
    expect(result.effectiveStatus).toBe('GRACE');
    expect(result.canMutate).toBe(true);
    expect(result.trialDaysRemaining).toBe(0);
    expect(result.graceDaysRemaining).toBe(3);
    expect(result.plan.code).toBe('professional');
  });

  it('computes TRIAL_EXPIRED from dates even when stored status is still TRIALING', () => {
    const trialEndsAt = addUtcDays(now, -5);
    const result = entitlement(SubscriptionStatus.TRIALING, now, {
      trialStartedAt: addUtcDays(trialEndsAt, -14),
      trialEndsAt,
      graceEndsAt: addUtcDays(trialEndsAt, 3),
    });
    expect(result.effectiveStatus).toBe('TRIAL_EXPIRED');
    expect(result.canMutate).toBe(false);
    expect(result.readOnly).toBe(true);
    expect(result.trialDaysRemaining).toBe(0);
    expect(result.graceDaysRemaining).toBe(0);
  });

  it('lets ACTIVE organizations mutate regardless of elapsed trial dates', () => {
    const result = resolveEntitlement({
      storedStatus: SubscriptionStatus.ACTIVE,
      trialStartedAt: addUtcDays(now, -40),
      trialEndsAt: addUtcDays(now, -26),
      graceEndsAt: addUtcDays(now, -23),
      currentPeriodStart: now,
      currentPeriodEnd: addUtcDays(now, 365),
      activatedAt: now,
      cancelAtPeriodEnd: false,
      assignedPlan: starter,
      trialPlan: professional,
      now,
    });
    expect(result.effectiveStatus).toBe('ACTIVE');
    expect(result.canMutate).toBe(true);
    expect(result.plan.code).toBe('starter');
  });

  it('blocks mutations for SUSPENDED even when trial dates are still open', () => {
    const result = entitlement(SubscriptionStatus.SUSPENDED, now, {
      trialStartedAt: now,
      trialEndsAt: addUtcDays(now, 14),
      graceEndsAt: addUtcDays(now, 17),
    });
    expect(result.effectiveStatus).toBe('SUSPENDED');
    expect(result.canMutate).toBe(false);
  });

  it('treats CANCELED as CANCELLED and read-only', () => {
    const result = entitlement(SubscriptionStatus.CANCELED, now);
    expect(result.effectiveStatus).toBe('CANCELLED');
    expect(result.canMutate).toBe(false);
  });
});
