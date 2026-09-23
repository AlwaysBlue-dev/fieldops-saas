import { apiRequest } from "./api";
import type {
  EffectiveSubscriptionStatus,
  OrganizationSubscription,
  SubscriptionPlan,
} from "./subscription";

export type PlatformOwner = {
  id: string;
  fullName: string;
  email: string;
};

export type PlatformOrganization = {
  id: string;
  name: string;
  slug: string;
  status?: string;
  timezone?: string;
  createdAt?: string;
  email?: string;
  phone?: string | null;
  owner?: PlatformOwner | null;
  subscription: OrganizationSubscription | null;
  usage?: {
    members: number;
    jobs: number;
    storageBytes: string;
    storageIncludedBytes: string | null;
  };
};

export type PlatformDashboard = {
  totalOrganizations: number;
  trialOrganizations: number;
  graceOrganizations: number;
  activeOrganizations: number;
  expiredTrials: number;
  suspendedOrganizations: number;
  totalUsers: number;
  totalJobs: number;
  activationRequests: number;
  recentSignups: Array<{
    id: string;
    name: string;
    slug: string;
    email: string;
    createdAt: string;
    planCode: string | null;
    planName: string | null;
    effectiveStatus: EffectiveSubscriptionStatus | null;
  }>;
};

export type PlatformCommercialRequest = {
  id: string;
  organizationId: string;
  requestType: "ACTIVATION" | "RENEWAL" | "PLAN_CHANGE";
  status: "OPEN" | "CONTACTED" | "COMPLETED" | "CLOSED";
  message: string | null;
  createdAt: string;
  updatedAt: string;
  organization: { id: string; name: string; slug: string };
  requestedBy: { id: string; fullName: string; email: string };
  owner?: { id: string; fullName: string; email: string };
  email?: string;
  requestedDate?: string;
};

export type PlatformOrgListQuery = {
  search?: string;
  status?: string;
  subscriptionStatus?: string;
  planCode?: string;
  createdFrom?: string;
  createdTo?: string;
};

export function getPlatformDashboard() {
  return apiRequest<PlatformDashboard>("/platform/dashboard");
}

export function listPlatformOrganizations(query: PlatformOrgListQuery = {}) {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.subscriptionStatus) {
    params.set("subscriptionStatus", query.subscriptionStatus);
  }
  if (query.planCode) params.set("planCode", query.planCode);
  if (query.createdFrom) params.set("createdFrom", query.createdFrom);
  if (query.createdTo) params.set("createdTo", query.createdTo);
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<PlatformOrganization[]>(`/platform/organizations${suffix}`);
}

export function getPlatformOrganization(organizationId: string) {
  return apiRequest<PlatformOrganization>(
    `/platform/organizations/${organizationId}`,
  );
}

export function listPlatformPlans() {
  return apiRequest<SubscriptionPlan[]>("/platform/plans");
}

export function listCommercialRequests(query?: {
  requestType?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (query?.requestType) params.set("requestType", query.requestType);
  if (query?.status) params.set("status", query.status);
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<PlatformCommercialRequest[]>(
    `/platform/commercial-requests${suffix}`,
  );
}

export function listActivationRequests(query?: { status?: string }) {
  const params = new URLSearchParams();
  if (query?.status) params.set("status", query.status);
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<PlatformCommercialRequest[]>(
    `/platform/activation-requests${suffix}`,
  );
}

export function updateCommercialRequest(
  requestId: string,
  status: "CONTACTED" | "COMPLETED" | "CLOSED",
) {
  return apiRequest<PlatformCommercialRequest>(
    `/platform/activation-requests/${requestId}`,
    { method: "PATCH", body: { status } },
  );
}

export function platformActivate(
  organizationId: string,
  body: {
    planCode?: string;
    planId?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
  },
) {
  return apiRequest<OrganizationSubscription>(
    `/platform/organizations/${organizationId}/subscription/activate`,
    { method: "POST", body },
  );
}

export function platformRenew(
  organizationId: string,
  body: {
    planCode?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
  } = {},
) {
  return apiRequest<OrganizationSubscription>(
    `/platform/organizations/${organizationId}/subscription/renew`,
    { method: "POST", body },
  );
}

export function platformChangePlan(organizationId: string, planCode: string) {
  return apiRequest<OrganizationSubscription>(
    `/platform/organizations/${organizationId}/subscription/change-plan`,
    { method: "POST", body: { planCode } },
  );
}

export function platformSetPeriod(
  organizationId: string,
  body: { currentPeriodStart: string; currentPeriodEnd: string },
) {
  return apiRequest<OrganizationSubscription>(
    `/platform/organizations/${organizationId}/subscription/set-period`,
    { method: "POST", body },
  );
}

export function platformExtendTrial(
  organizationId: string,
  body: { days?: number; trialEndsAt?: string },
) {
  return apiRequest<OrganizationSubscription>(
    `/platform/organizations/${organizationId}/subscription/extend-trial`,
    { method: "POST", body },
  );
}

export function platformSuspend(organizationId: string, reason: string) {
  return apiRequest<OrganizationSubscription>(
    `/platform/organizations/${organizationId}/subscription/suspend`,
    { method: "POST", body: { reason } },
  );
}

export function platformReactivate(organizationId: string) {
  return apiRequest<OrganizationSubscription>(
    `/platform/organizations/${organizationId}/subscription/reactivate`,
    { method: "POST", body: {} },
  );
}

export function platformCancel(organizationId: string) {
  return apiRequest<OrganizationSubscription>(
    `/platform/organizations/${organizationId}/subscription/cancel`,
    { method: "POST", body: {} },
  );
}

export function formatBytes(value: string | number | null | undefined) {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = n;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size < 10 && i > 0 ? size.toFixed(1) : Math.round(size)} ${units[i]}`;
}
