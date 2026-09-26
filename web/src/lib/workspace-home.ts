import type { OrganizationMembership } from "@/lib/auth";

/** UI preference only — never used as authorization. */
export const LAST_ORG_SLUG_KEY = "fieldops.last-org-slug";

/** Role-aware home inside an organization workspace. */
export function workspaceHomePath(
  orgSlug: string,
  role?: OrganizationMembership["role"] | string | null,
): string {
  if (role === "TECHNICIAN") {
    return `/app/${orgSlug}/my-day`;
  }
  return `/app/${orgSlug}/overview`;
}

export function readPreferredOrgSlug(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(LAST_ORG_SLUG_KEY)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

export function rememberPreferredOrgSlug(slug: string) {
  if (typeof window === "undefined") return;
  const trimmed = slug.trim();
  if (!trimmed) return;
  try {
    window.localStorage.setItem(LAST_ORG_SLUG_KEY, trimmed);
  } catch {
    // Ignore quota / private mode.
  }
}

/**
 * Pick the membership to open after session load.
 * Preferred slug is a chrome preference; membership list from the API is authoritative.
 */
export function resolveActiveMembership(
  memberships: OrganizationMembership[],
  preferredSlug?: string | null,
): OrganizationMembership | null {
  if (memberships.length === 0) return null;

  const active = memberships.filter(
    (item) => item.organization.status === "ACTIVE",
  );
  const pool = active.length > 0 ? active : memberships;

  const preferred = preferredSlug?.trim();
  if (preferred) {
    const match = pool.find((item) => item.organization.slug === preferred);
    if (match) return match;
  }

  return pool[0] ?? null;
}
