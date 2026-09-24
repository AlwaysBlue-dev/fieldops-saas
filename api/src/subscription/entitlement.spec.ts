import { BillingInterval, SubscriptionStatus } from '../generated/prisma/client.js';
import { addUtcDays } from './clock.js';
import { resolveEntitlement, type PlanSnapshot } from './entitlement.js';

function commercialPlan(
  extras: Partial<PlanSnapshot> & Pick<PlanSnapshot, 'id' | 'code' | 'name' | 'maxUsers' | 'maxStorageBytes'>,
): PlanSnapshot {
  return {
    features: {},
    currency: 'USD',
    billingInterval: BillingInterval.ANNUAL,
    displayPrice: null,
    annualPriceCents: extras.code === 'professional' ? 49900 : null,
    monthlyPriceCents: null,
    contactSales: extras.code === 'business',
    publiclyVisible: true,
    priceLabel:
      extras.code === 'professional'
        ? '$499/year'
        : extras.code === 'business'
          ? 'Contact sales'
          : '$299/year',
    ...extras,
  };
}

const professional = commercialPlan({
  id: 'plan-pro',
  code: 'professional',
  name: 'Professional',
  maxUsers: 10,
  maxStorageBytes: '21474836480',
  features: { gps: true, approvals: true, reports: 'standard', CUSTOM_BRANDING: true },
});

const starter = commercialPlan({
  id: 'plan-starter',
  code: 'starter',
  name: 'Starter',
  maxUsers: 5,
  maxStorageBytes: '5368709120',
  annualPriceCents: 29900,
  features: { gps: true, approvals: false, reports: 'basic', CUSTOM_BRANDING: false },
});

function entitlement(
  storedStatus: SubscriptionStatus,
  now: Date,
  extras: Partial<{
    trialStartedAt: Date;
    trialEndsAt: Date;
    graceEndsAt: Date;
    assignedPlan: PlanSnapshot;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    activatedAt: Date | null;
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
    currentPeriodStart: extras.currentPeriodStart ?? null,
    currentPeriodEnd: extras.currentPeriodEnd ?? null,
    activatedAt: extras.activatedAt ?? null,
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
    expect(result.daysUntilExpiration).toBe(14);
    expect(result.plan.code).toBe('professional');
    expect(result.plan.maxUsers).toBe(10);
    expect(result.plan.maxStorageBytes).toBe('21474836480');
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
    expect(result.graceKind).toBe('trial');
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

  it('lets ACTIVE organizations mutate when the paid period is still open', () => {
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
    expect(result.daysUntilExpiration).toBe(365);
    expect(result.plan.code).toBe('starter');
  });

  it('computes 30/14/7/1 day remaining against the paid period end', () => {
    for (const days of [30, 14, 7, 1]) {
      const result = resolveEntitlement({
        storedStatus: SubscriptionStatus.ACTIVE,
        trialStartedAt: addUtcDays(now, -400),
        trialEndsAt: addUtcDays(now, -386),
        graceEndsAt: addUtcDays(now, -383),
        currentPeriodStart: addUtcDays(now, -365 + days),
        currentPeriodEnd: addUtcDays(now, days),
        activatedAt: addUtcDays(now, -365 + days),
        cancelAtPeriodEnd: false,
        assignedPlan: professional,
        trialPlan: professional,
        now,
      });
      expect(result.effectiveStatus).toBe('ACTIVE');
      expect(result.daysUntilExpiration).toBe(days);
    }
  });

  it('keeps a paid subscription operational during the 7-day renewal grace', () => {
    const currentPeriodEnd = addUtcDays(now, -2);
    const result = resolveEntitlement({
      storedStatus: SubscriptionStatus.ACTIVE,
      trialStartedAt: addUtcDays(now, -400),
      trialEndsAt: addUtcDays(now, -386),
      graceEndsAt: addUtcDays(now, -383),
      currentPeriodStart: addUtcDays(currentPeriodEnd, -365),
      currentPeriodEnd,
      activatedAt: addUtcDays(currentPeriodEnd, -365),
      cancelAtPeriodEnd: false,
      assignedPlan: professional,
      trialPlan: professional,
      now,
    });
    expect(result.effectiveStatus).toBe('PAID_GRACE');
    expect(result.graceKind).toBe('paid');
    expect(result.canMutate).toBe(true);
    expect(result.graceDaysRemaining).toBe(5);
    expect(result.daysUntilExpiration).toBe(0);
  });

  it('makes a paid subscription read-only after the 7-day renewal grace', () => {
    const currentPeriodEnd = addUtcDays(now, -8);
    const result = resolveEntitlement({
      storedStatus: SubscriptionStatus.ACTIVE,
      trialStartedAt: addUtcDays(now, -400),
      trialEndsAt: addUtcDays(now, -386),
      graceEndsAt: addUtcDays(now, -383),
      currentPeriodStart: addUtcDays(currentPeriodEnd, -365),
      currentPeriodEnd,
      activatedAt: addUtcDays(currentPeriodEnd, -365),
      cancelAtPeriodEnd: false,
      assignedPlan: professional,
      trialPlan: professional,
      now,
    });
    expect(result.effectiveStatus).toBe('EXPIRED');
    expect(result.canMutate).toBe(false);
    expect(result.readOnly).toBe(true);
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
