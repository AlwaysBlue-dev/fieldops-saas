/** Conceptual product features. Prefer these over raw plan code checks. */
export const PLAN_FEATURES = {
  JOBS: 'JOBS',
  TIMESHEETS: 'TIMESHEETS',
  GPS: 'GPS',
  CLIENT_SIGNATURE: 'CLIENT_SIGNATURE',
  ADVANCED_REPORTS: 'ADVANCED_REPORTS',
  /** Organization logo / workspace branding (Professional+). */
  CUSTOM_BRANDING: 'CUSTOM_BRANDING',
  /** Advanced/custom branding requirements (Business). */
  ADVANCED_BRANDING: 'ADVANCED_BRANDING',
} as const;

export type PlanFeature = (typeof PLAN_FEATURES)[keyof typeof PLAN_FEATURES];

export type PlanFeatureFlags = Record<PlanFeature, boolean>;

/** Most field functionality is on for all plans; limits differ by maxUsers / maxStorageBytes. */
export const DEFAULT_PLAN_FEATURES: PlanFeatureFlags = {
  JOBS: true,
  TIMESHEETS: true,
  GPS: true,
  CLIENT_SIGNATURE: true,
  ADVANCED_REPORTS: false,
  CUSTOM_BRANDING: false,
  ADVANCED_BRANDING: false,
};

function readFlag(
  features: Record<string, unknown>,
  key: PlanFeature,
  aliases: string[],
  fallback: boolean,
): boolean {
  if (typeof features[key] === 'boolean') {
    return features[key] as boolean;
  }
  for (const alias of aliases) {
    if (typeof features[alias] === 'boolean') {
      return features[alias] as boolean;
    }
  }
  return fallback;
}

/**
 * Normalize Plan.features JSON into conceptual flags.
 * Does not branch on plan code strings — callers use EntitlementService.hasFeature.
 */
export function resolvePlanFeatures(
  features: Record<string, unknown> | null | undefined,
): PlanFeatureFlags {
  const raw = features ?? {};
  const reports = raw.reports;
  const advancedReports =
    typeof reports === 'string'
      ? reports === 'advanced' || reports === 'standard'
      : DEFAULT_PLAN_FEATURES.ADVANCED_REPORTS;

  return {
    JOBS: readFlag(raw, PLAN_FEATURES.JOBS, ['jobs'], DEFAULT_PLAN_FEATURES.JOBS),
    TIMESHEETS: readFlag(
      raw,
      PLAN_FEATURES.TIMESHEETS,
      ['timesheets'],
      DEFAULT_PLAN_FEATURES.TIMESHEETS,
    ),
    GPS: readFlag(raw, PLAN_FEATURES.GPS, ['gps'], DEFAULT_PLAN_FEATURES.GPS),
    CLIENT_SIGNATURE: readFlag(
      raw,
      PLAN_FEATURES.CLIENT_SIGNATURE,
      ['clientSignature', 'client_signature'],
      DEFAULT_PLAN_FEATURES.CLIENT_SIGNATURE,
    ),
    ADVANCED_REPORTS: readFlag(
      raw,
      PLAN_FEATURES.ADVANCED_REPORTS,
      ['advancedReports', 'advanced_reports'],
      advancedReports,
    ),
    CUSTOM_BRANDING: readFlag(
      raw,
      PLAN_FEATURES.CUSTOM_BRANDING,
      ['customBranding', 'custom_branding', 'organizationLogo', 'organization_logo'],
      DEFAULT_PLAN_FEATURES.CUSTOM_BRANDING,
    ),
    ADVANCED_BRANDING: readFlag(
      raw,
      PLAN_FEATURES.ADVANCED_BRANDING,
      ['advancedBranding', 'advanced_branding'],
      DEFAULT_PLAN_FEATURES.ADVANCED_BRANDING,
    ),
  };
}

export function featureCatalog(flags: PlanFeatureFlags) {
  return [
    { key: PLAN_FEATURES.JOBS, label: 'Jobs & dispatch', enabled: flags.JOBS },
    {
      key: PLAN_FEATURES.TIMESHEETS,
      label: 'Timesheets',
      enabled: flags.TIMESHEETS,
    },
    { key: PLAN_FEATURES.GPS, label: 'GPS evidence', enabled: flags.GPS },
    {
      key: PLAN_FEATURES.CLIENT_SIGNATURE,
      label: 'Client signature',
      enabled: flags.CLIENT_SIGNATURE,
    },
    {
      key: PLAN_FEATURES.ADVANCED_REPORTS,
      label: 'Advanced reports',
      enabled: flags.ADVANCED_REPORTS,
    },
    {
      key: PLAN_FEATURES.CUSTOM_BRANDING,
      label: 'Organization branding',
      enabled: flags.CUSTOM_BRANDING,
    },
    {
      key: PLAN_FEATURES.ADVANCED_BRANDING,
      label: 'Advanced branding',
      enabled: flags.ADVANCED_BRANDING,
    },
  ] as const;
}

export function planPositioning(features: Record<string, unknown>): string | null {
  const value = features.positioning;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function planBadge(features: Record<string, unknown>): string | null {
  const value = features.badge;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function planApprovalsEnabled(features: Record<string, unknown>): boolean {
  return typeof features.approvals === 'boolean' ? features.approvals : false;
}
