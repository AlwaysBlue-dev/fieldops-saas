import { JobStatus } from '../generated/prisma/client.js';

export const ACCESS_INFO_MISSING_ITEMS = ['access notes', 'site contact'] as const;
export type AccessInfoMissingItem = (typeof ACCESS_INFO_MISSING_ITEMS)[number];

export type JobAccessInfo = {
  /** True when the job is active and access notes and/or usable contact are missing. */
  missingAccessInfo: boolean;
  /** Inverse of missingAccessInfo for clear UI copy. */
  accessInfoReady: boolean;
  missingItems: AccessInfoMissingItem[];
};

export type JobAccessInfoInput = {
  status: JobStatus | string;
  siteNotes?: string | null;
  siteAccessNotes?: string | null;
  siteContactName?: string | null;
  siteContactPhone?: string | null;
  /** Optional primary SiteContact row when present. */
  primaryContactName?: string | null;
  primaryContactPhone?: string | null;
  /** Job-level “Customer contact on site” (clientRep*). */
  clientRepName?: string | null;
  clientRepPhone?: string | null;
};

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === '';
}

function resolvedAccessNotes(input: JobAccessInfoInput): string | null {
  if (!isBlank(input.siteNotes)) return input.siteNotes!.trim();
  if (!isBlank(input.siteAccessNotes)) return input.siteAccessNotes!.trim();
  return null;
}

function hasSiteContact(input: JobAccessInfoInput): boolean {
  if (!isBlank(input.siteContactName) || !isBlank(input.siteContactPhone)) {
    return true;
  }
  if (!isBlank(input.primaryContactName) || !isBlank(input.primaryContactPhone)) {
    return true;
  }
  return false;
}

function hasJobContact(input: JobAccessInfoInput): boolean {
  return !isBlank(input.clientRepName) || !isBlank(input.clientRepPhone);
}

const TERMINAL: ReadonlySet<string> = new Set([
  JobStatus.COMPLETED,
  JobStatus.CANCELLED,
]);

/**
 * Shared Missing Access Info rule for Jobs, Schedule, and Job Details.
 * Completed/cancelled jobs are never flagged.
 */
export function evaluateJobAccessInfo(input: JobAccessInfoInput): JobAccessInfo {
  if (TERMINAL.has(input.status)) {
    return {
      missingAccessInfo: false,
      accessInfoReady: true,
      missingItems: [],
    };
  }

  const missingItems: AccessInfoMissingItem[] = [];
  if (resolvedAccessNotes(input) == null) {
    missingItems.push('access notes');
  }
  if (!hasSiteContact(input) && !hasJobContact(input)) {
    missingItems.push('site contact');
  }

  const missingAccessInfo = missingItems.length > 0;
  return {
    missingAccessInfo,
    accessInfoReady: !missingAccessInfo,
    missingItems,
  };
}

export function formatMissingAccessItems(items: AccessInfoMissingItem[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/** Prisma site select used when computing access info on job lists/boards. */
export const JOB_ACCESS_SITE_SELECT = {
  id: true,
  name: true,
  city: true,
  notes: true,
  accessNotes: true,
  siteContactName: true,
  siteContactPhone: true,
  contacts: {
    where: { isPrimary: true },
    select: { name: true, phone: true },
    take: 1,
  },
} as const;

export function accessInfoFromJobRow(job: {
  status: JobStatus | string;
  clientRepName?: string | null;
  clientRepPhone?: string | null;
  site: {
    notes?: string | null;
    accessNotes?: string | null;
    siteContactName?: string | null;
    siteContactPhone?: string | null;
    contacts?: Array<{ name: string | null; phone: string | null }>;
  };
}): JobAccessInfo {
  const primary = job.site.contacts?.[0];
  return evaluateJobAccessInfo({
    status: job.status,
    siteNotes: job.site.notes,
    siteAccessNotes: job.site.accessNotes,
    siteContactName: job.site.siteContactName,
    siteContactPhone: job.site.siteContactPhone,
    primaryContactName: primary?.name,
    primaryContactPhone: primary?.phone,
    clientRepName: job.clientRepName,
    clientRepPhone: job.clientRepPhone,
  });
}
