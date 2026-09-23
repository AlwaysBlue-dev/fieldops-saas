import { apiRequest } from "./api";

export type SubscriptionPlan = {
  id: string;
  code: string;
  name: string;
  maxUsers: number;
  maxStorageBytes: string;
  features: Record<string, unknown>;
  currency: string;
  billingInterval: "MONTHLY" | "ANNUAL" | "CUSTOM";
  displayPrice: string | null;
  annualPriceCents: number | null;
  monthlyPriceCents: number | null;
  contactSales: boolean;
  priceLabel: string;
};

export type EffectiveSubscriptionStatus =
  | "TRIALING"
  | "GRACE"
  | "ACTIVE"
  | "PAID_GRACE"
  | "TRIAL_EXPIRED"
  | "EXPIRED"
  | "SUSPENDED"
  | "CANCELLED";

export type OrganizationSubscription = {
  status: string;
  effectiveStatus: EffectiveSubscriptionStatus;
  graceKind: "trial" | "paid" | null;
  plan: SubscriptionPlan;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  paidGraceEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  activatedAt: string | null;
  cancelAtPeriodEnd: boolean;
  trialDaysRemaining: number;
  graceDaysRemaining: number;
  daysUntilExpiration: number;
  readOnly: boolean;
  canMutate: boolean;
  features: Record<string, unknown>;
  usage: {
    users: { used: number; included: number };
    storage: { usedBytes: string; includedBytes: string };
  } | null;
  availableActions: {
    requestActivation: boolean;
    requestRenewal: boolean;
    requestPlanChange: boolean;
    contactSupport: boolean;
  };
  openRequests: Array<{
    id: string;
    requestType: string;
    status: string;
    createdAt: string;
  }>;
  supportEmail: string | null;
};

export type CommercialRequest = {
  id: string;
  organizationId: string;
  requestType: "ACTIVATION" | "RENEWAL" | "PLAN_CHANGE";
  status: "OPEN" | "CONTACTED" | "COMPLETED" | "CLOSED";
  message: string | null;
  createdAt: string;
};

export const ACTIVATION_UNAVAILABLE_MESSAGE =
  "Available after account activation.";

export function getOrganizationSubscription(organizationId: string) {
  return apiRequest<OrganizationSubscription>(
    `/organizations/${organizationId}/subscription`,
  );
}

export function requestActivation(organizationId: string, message?: string) {
  return apiRequest<CommercialRequest>(
    `/organizations/${organizationId}/activation-requests`,
    {
      method: "POST",
      body: message ? { message } : {},
    },
  );
}

export function requestRenewal(organizationId: string, message?: string) {
  return apiRequest<CommercialRequest>(
    `/organizations/${organizationId}/renewal-requests`,
    {
      method: "POST",
      body: message ? { message } : {},
    },
  );
}

export function requestPlanChange(organizationId: string, message?: string) {
  return apiRequest<CommercialRequest>(
    `/organizations/${organizationId}/plan-change-requests`,
    {
      method: "POST",
      body: message ? { message } : {},
    },
  );
}

export type OrganizationUsage = {
  plan: {
    code: string;
    name: string;
    priceLabel: string;
    contactSales: boolean;
  };
  subscription: {
    status: string;
    effectiveStatus: EffectiveSubscriptionStatus;
    accessUntil: string | null;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    canMutate: boolean;
    readOnly: boolean;
  };
  members: {
    used: number;
    pendingInvites: number;
    limit: number;
  };
  storage: {
    usedBytes: string;
    limitBytes: string;
  };
  jobsThisMonth: number;
  features: Array<{
    key: string;
    label: string;
    enabled: boolean;
  }>;
};

export function getOrganizationUsage(organizationId: string) {
  return apiRequest<OrganizationUsage>(`/organizations/${organizationId}/usage`);
}

export function isTrialEndingSoon(subscription: OrganizationSubscription) {
  return (
    subscription.effectiveStatus === "TRIALING" &&
    subscription.trialDaysRemaining > 0 &&
    subscription.trialDaysRemaining <= 3
  );
}

export function isNearExpiry(subscription: OrganizationSubscription) {
  return (
    subscription.effectiveStatus === "ACTIVE" &&
    subscription.daysUntilExpiration > 0 &&
    subscription.daysUntilExpiration <= 30
  );
}

export function formatStorageBytes(bytes: string) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value === 0) return "0 B";
  const gb = value / (1024 * 1024 * 1024);
  if (gb >= 1) return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  const mb = value / (1024 * 1024);
  if (mb >= 1) return `${Math.max(1, Math.round(mb))} MB`;
  return `${value} B`;
}
