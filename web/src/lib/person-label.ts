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
