/**
 * Shared industry / business-type helpers.
 * Stored on Organization.industry as free-text String (no enum).
 */

export const STANDARD_INDUSTRIES = [
  "Electrical",
  "Plumbing",
  "HVAC",
  "Fire & Security",
  "Construction",
  "Facilities Management",
  "General Field Service",
  "Maintenance",
] as const;

export type StandardIndustry = (typeof STANDARD_INDUSTRIES)[number];

export const OTHER_INDUSTRY = "Other";

export const INDUSTRY_MIN_LENGTH = 2;
export const INDUSTRY_MAX_LENGTH = 100;

export function normalizeIndustryLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isStandardIndustry(value: string): value is StandardIndustry {
  return (STANDARD_INDUSTRIES as readonly string[]).includes(value);
}

/** Map a stored industry string into select + optional custom text. */
export function parseIndustrySelection(stored: string | null | undefined): {
  selection: StandardIndustry | typeof OTHER_INDUSTRY | "";
  custom: string;
} {
  const value = stored?.trim() ?? "";
  if (!value) return { selection: "", custom: "" };
  if (isStandardIndustry(value)) return { selection: value, custom: "" };
  // Legacy "Facilities" → Facilities Management when exact match after rename.
  if (value === "Facilities") {
    return { selection: "Facilities Management", custom: "" };
  }
  return { selection: OTHER_INDUSTRY, custom: value };
}

export function resolveIndustryForSubmit(
  selection: string,
  custom: string,
): { ok: true; industry: string } | { ok: false; message: string } {
  if (!selection) {
    return { ok: false, message: "Please select your business type." };
  }
  if (selection === OTHER_INDUSTRY) {
    const normalized = normalizeIndustryLabel(custom);
    if (normalized.length < INDUSTRY_MIN_LENGTH) {
      return { ok: false, message: "Please specify your business type." };
    }
    if (normalized.length > INDUSTRY_MAX_LENGTH) {
      return {
        ok: false,
        message: `Business type must be ${INDUSTRY_MAX_LENGTH} characters or fewer.`,
      };
    }
    return { ok: true, industry: normalized };
  }
  if (!isStandardIndustry(selection)) {
    return { ok: false, message: "Please select your business type." };
  }
  return { ok: true, industry: selection };
}

/** Human label for review/summary (never show bare "Other"). */
export function industryDisplayLabel(stored: string | null | undefined): string {
  if (!stored?.trim()) return "—";
  if (stored.trim() === "Facilities") return "Facilities Management";
  return stored.trim();
}
