import { getMyOrganizations, type OrganizationMembership } from "./auth";

export async function resolveCurrentMembership(orgSlug: string) {
  const memberships = await getMyOrganizations();
  const match = memberships.find((item) => item.organization.slug === orgSlug);
  if (!match) {
    return null;
  }
  return match;
}

export function canManageCustomers(membership: OrganizationMembership | null) {
  return (
    membership?.role === "OWNER" ||
    membership?.role === "ADMIN" ||
    membership?.role === "OPERATIONS_MANAGER"
  );
}

export function canManageCrew(membership: OrganizationMembership | null) {
  return canManageCustomers(membership);
}

export function canInviteMembers(membership: OrganizationMembership | null) {
  return membership?.role === "OWNER" || membership?.role === "ADMIN";
}

/** Organization operational settings (working days, timezone, branding). */
export function canEditOrganizationSettings(
  membership: OrganizationMembership | null,
) {
  return canInviteMembers(membership);
}

/** Owner-only commercial subscription controls. */
export function canManageSubscription(membership: OrganizationMembership | null) {
  return membership?.role === "OWNER";
}

/** Owner-only billing / invoices / plan usage settings. */
export function canManageBilling(membership: OrganizationMembership | null) {
  return canManageSubscription(membership);
}

/** Owner-only Settings → Plan & Usage. */
export function canViewPlanUsage(membership: OrganizationMembership | null) {
  return canManageSubscription(membership);
}

export function canViewSettings(membership: OrganizationMembership | null) {
  return Boolean(membership);
}

export function canManageSchedule(membership: OrganizationMembership | null) {
  return canManageCrew(membership);
}

export function canEditSchedule(membership: OrganizationMembership | null) {
  return canManageSchedule(membership) || membership?.role === "SUPERVISOR";
}

export function canCreateJobs(membership: OrganizationMembership | null) {
  return canEditSchedule(membership);
}

export function isTechnician(membership: OrganizationMembership | null) {
  return membership?.role === "TECHNICIAN";
}

export function canApproveOvertime(membership: OrganizationMembership | null) {
  return canEditSchedule(membership);
}

export function canApproveOperations(membership: OrganizationMembership | null) {
  return canEditSchedule(membership);
}
