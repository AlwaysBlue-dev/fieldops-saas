/**
 * Mirror of api/src/common/organization-name.ts — keep algorithms in sync.
 * Display names are not globally unique; same-owner duplicates use this key.
 */

const RESERVED_NORMALIZED = new Set(["fieldops", "fieldops cloud"]);

export function cleanOrganizationDisplayName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function normalizeOrganizationNameForCompare(raw: string): string {
  return cleanOrganizationDisplayName(raw).toLowerCase();
}

export function organizationNamesMatch(a: string, b: string): boolean {
  return (
    normalizeOrganizationNameForCompare(a) ===
    normalizeOrganizationNameForCompare(b)
  );
}

export function isReservedOrganizationName(raw: string): boolean {
  return RESERVED_NORMALIZED.has(normalizeOrganizationNameForCompare(raw));
}

export type OrganizationNameValidation =
  | { ok: true; displayName: string }
  | { ok: false; message: string };

export function validateOrganizationDisplayName(
  raw: string,
  options: { maxLength?: number; minLength?: number } = {},
): OrganizationNameValidation {
  const minLength = options.minLength ?? 2;
  const maxLength = options.maxLength ?? 120;
  const displayName = cleanOrganizationDisplayName(raw);

  if (!displayName) {
    return { ok: false, message: "Enter your company name." };
  }
  if (displayName.length < minLength) {
    return {
      ok: false,
      message: `Company name must be at least ${minLength} characters.`,
    };
  }
  if (displayName.length > maxLength) {
    return {
      ok: false,
      message: `Company name must be ${maxLength} characters or fewer.`,
    };
  }
  if (/[\u0000-\u001F\u007F]/.test(displayName)) {
    return { ok: false, message: "Company name contains invalid characters." };
  }
  if (isReservedOrganizationName(displayName)) {
    return {
      ok: false,
      message: "Choose a different company name for your workspace.",
    };
  }
  return { ok: true, displayName };
}
