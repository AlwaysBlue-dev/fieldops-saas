import { BillingInterval } from '../generated/prisma/client.js';

export type PlanCommercialFields = {
  currency: string;
  billingInterval: BillingInterval;
  displayPrice: string | null;
  annualPriceCents: number | null;
  monthlyPriceCents: number | null;
  contactSales: boolean;
  publiclyVisible?: boolean;
  sortOrder?: number;
};

export function formatCentsUsd(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function formatStorageBytes(bytes: bigint | string | number): string {
  const value = typeof bytes === 'bigint' ? Number(bytes) : Number(bytes);
  if (!Number.isFinite(value) || value <= 0) {
    return '—';
  }
  const gb = value / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  const mb = value / (1024 * 1024);
  return `${Math.max(1, Math.round(mb))} MB`;
}

export function formatPlanPrice(plan: PlanCommercialFields): string {
  if (plan.contactSales) {
    return 'Contact sales';
  }
  if (plan.displayPrice) {
    return plan.billingInterval === BillingInterval.ANNUAL
      ? `${plan.displayPrice}/year`
      : plan.billingInterval === BillingInterval.MONTHLY
        ? `${plan.displayPrice}/month`
        : plan.displayPrice;
  }
  if (
    plan.billingInterval === BillingInterval.ANNUAL &&
    plan.annualPriceCents != null
  ) {
    return `${formatCentsUsd(plan.annualPriceCents)}/year`;
  }
  if (plan.monthlyPriceCents != null) {
    return `${formatCentsUsd(plan.monthlyPriceCents)}/month`;
  }
  if (plan.annualPriceCents != null) {
    return `${formatCentsUsd(plan.annualPriceCents)}/year`;
  }
  return 'Contact sales';
}

export function publicHighlights(features: Record<string, unknown>): string[] {
  const raw = features.publicHighlights;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === 'string' && item.length > 0);
}
