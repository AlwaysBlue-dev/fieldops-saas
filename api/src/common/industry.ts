/**
 * Shared industry helpers for API validation (mirrors web/src/lib/industry.ts).
 * Organization.industry remains a free-text String — no Prisma enum.
 */

export const STANDARD_INDUSTRIES = [
  'Electrical',
  'Plumbing',
  'HVAC',
  'Fire & Security',
  'Construction',
  'Facilities Management',
  'General Field Service',
  'Maintenance',
] as const;

export const INDUSTRY_MIN_LENGTH = 2;
export const INDUSTRY_MAX_LENGTH = 100;

export function normalizeIndustryLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Normalize and validate an industry string for storage.
 * Accepts standard labels or custom free text (from Other).
 */
export function normalizeIndustryForStorage(
  value: string | undefined | null,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = normalizeIndustryLabel(value);
  if (!normalized) return undefined;
  if (normalized.toLowerCase() === 'other') {
    throw new Error('Please specify your business type.');
  }
  if (normalized.length < INDUSTRY_MIN_LENGTH) {
    throw new Error('Please specify your business type.');
  }
  if (normalized.length > INDUSTRY_MAX_LENGTH) {
    throw new Error(
      `Business type must be ${INDUSTRY_MAX_LENGTH} characters or fewer.`,
    );
  }
  if (normalized === 'Facilities') {
    return 'Facilities Management';
  }
  return normalized;
}
