import {
  DEFAULT_WORKING_WEEK,
  WORK_WEEK_DAYS,
  type WorkWeekDay,
} from '../common/constants.js';
import type { Organization, OrganizationSettings } from '../generated/prisma/client.js';

export function serializeSettings(settings: OrganizationSettings) {
  return {
    organizationId: settings.organizationId,
    jobNumberPrefix: settings.jobNumberPrefix,
    timezone: settings.timezone,
    workingWeek: normalizeWorkingWeek(settings.workingWeek),
    requireClientSignature: settings.requireClientSignature,
    requireGps: settings.requireGps,
    gpsReviewDistanceMeters: settings.gpsReviewDistanceMeters,
    allowManualTime: settings.allowManualTime,
    allowOvertimeRequests: settings.allowOvertimeRequests,
    requireRiskAssessment: settings.requireRiskAssessment,
    defaultDailyHoursLimit: Number(settings.defaultDailyHoursLimit),
    defaultWeeklyHoursLimit: Number(settings.defaultWeeklyHoursLimit),
  };
}

export function serializeOrganization(
  organization: Organization,
  settings?: OrganizationSettings | null,
) {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    email: organization.email,
    phone: organization.phone,
    industry: organization.industry,
    timezone: organization.timezone,
    status: organization.status,
    onboardingStep: organization.onboardingStep,
    onboardingCompletedAt: organization.onboardingCompletedAt,
    settings: settings ? serializeSettings(settings) : undefined,
  };
}

export function normalizeWorkingWeek(value: unknown): WorkWeekDay[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_WORKING_WEEK];
  }
  const days = value
    .map((day) => String(day).toUpperCase())
    .filter((day): day is WorkWeekDay =>
      (WORK_WEEK_DAYS as readonly string[]).includes(day),
    );
  return days.length > 0 ? [...new Set(days)] : [...DEFAULT_WORKING_WEEK];
}
