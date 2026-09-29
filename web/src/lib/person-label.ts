/** Format only a role supplied by the current organization membership. */
export function organizationRoleLabel(role?: string | null): string | null {
  if (!role) return null;
  return role.toLowerCase().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/** Native select options and compact assignment summaries cannot contain badges. */
export function personOptionLabel(input: {
  fullName?: string | null;
  email?: string | null;
  role?: string | null;
}): string {
  const role = organizationRoleLabel(input.role);
  return `${personDisplayName(input)}${role ? ` · ${role}` : ""}`;
}

/** Display label for people in selectors and lists. Never invent "Existing User". */
export function personDisplayName(input: {
  fullName?: string | null;
  email?: string | null;
}): string {
  const name = input.fullName?.trim();
  if (name) return name;
  const email = input.email?.trim();
  if (email) return email;
  return "Unnamed member";
}

export function personSecondaryLine(input: {
  fullName?: string | null;
  email?: string | null;
}): string | null {
  const name = input.fullName?.trim();
  const email = input.email?.trim();
  if (name && email) return email;
  return null;
}

export function organizationInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
