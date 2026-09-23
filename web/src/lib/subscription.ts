import { apiRequest } from "./api";

export type SubscriptionPlan = {
  id: string;
  code: string;
  name: string;
  maxUsers: number;
  maxStorageBytes: string;
  features: Record<string, unknown>;
};

export type EffectiveSubscriptionStatus =
  | "TRIALING"
  | "GRACE"
  | "ACTIVE"
  | "TRIAL_EXPIRED"
  | "SUSPENDED"
  | "CANCELLED";

export type OrganizationSubscription = {
  status: string;
  effectiveStatus: EffectiveSubscriptionStatus;
  plan: SubscriptionPlan;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  activatedAt: string | null;
  cancelAtPeriodEnd: boolean;
  trialDaysRemaining: number;
  graceDaysRemaining: number;
  readOnly: boolean;
  canMutate: boolean;
  features: Record<string, unknown>;
};

export type ActivationRequest = {
  id: string;
  organizationId: string;
  status: "OPEN" | "CONTACTED" | "CLOSED";
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
  return apiRequest<ActivationRequest>(
    `/organizations/${organizationId}/activation-requests`,
    {
      method: "POST",
      body: message ? { message } : {},
    },
  );
}

export function isTrialEndingSoon(subscription: OrganizationSubscription) {
  return (
    subscription.effectiveStatus === "TRIALING" &&
    subscription.trialDaysRemaining > 0 &&
    subscription.trialDaysRemaining <= 3
  );
}
