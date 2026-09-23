import { JobStatus } from '../generated/prisma/client.js';
import {
  CLOCKABLE_STATUSES,
  FIELD_CAPTURE_STATUSES,
  SIGN_OFF_STATUSES,
} from './job-workflow.service.js';

export type MyDayJobActions = {
  canClockIn: boolean;
  canClockOut: boolean;
  canOpen: boolean;
  canAddWorkUpdate: boolean;
  canAddPhoto: boolean;
  canAddMaterial: boolean;
  canSignOff: boolean;
};

export function myDayJobActions(input: {
  jobId: string;
  status: JobStatus;
  assigned: boolean;
  clockedIn: boolean;
  clockJobId: string | null;
  hasSignature: boolean;
  requireClientSignOff: boolean;
}): MyDayJobActions {
  const field = input.assigned && FIELD_CAPTURE_STATUSES.includes(input.status);
  const clockable = input.assigned && CLOCKABLE_STATUSES.includes(input.status);
  const signable =
    input.assigned &&
    input.requireClientSignOff &&
    !input.hasSignature &&
    SIGN_OFF_STATUSES.includes(input.status);
  const clockMatchesJob =
    input.clockedIn &&
    (input.clockJobId == null || input.clockJobId === input.jobId);

  return {
    canClockIn: !input.clockedIn && clockable,
    canClockOut: clockMatchesJob,
    canOpen: true,
    canAddWorkUpdate: field,
    canAddPhoto: field,
    canAddMaterial: field,
    canSignOff: signable,
  };
}

export function pickCurrentJobId(
  jobs: Array<{ id: string; status: JobStatus; scheduledStart: Date | null }>,
  clockJobId: string | null,
): string | null {
  if (clockJobId && jobs.some((job) => job.id === clockJobId)) {
    return clockJobId;
  }
  const inProgress = jobs.find((job) => job.status === JobStatus.IN_PROGRESS);
  if (inProgress) return inProgress.id;
  const dispatched = jobs
    .filter((job) => job.status === JobStatus.DISPATCHED)
    .sort(compareScheduled);
  if (dispatched[0]) return dispatched[0].id;
  return null;
}

export function compareScheduled(
  left: { scheduledStart: Date | null },
  right: { scheduledStart: Date | null },
) {
  if (!left.scheduledStart && !right.scheduledStart) return 0;
  if (!left.scheduledStart) return 1;
  if (!right.scheduledStart) return -1;
  return left.scheduledStart.getTime() - right.scheduledStart.getTime();
}

export function formatSiteAddress(site: {
  addressLine1: string | null;
  addressLine2?: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}) {
  return [
    site.addressLine1,
    site.addressLine2,
    [site.city, site.region, site.postalCode].filter(Boolean).join(', '),
    site.country,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

export function navigationUrl(input: {
  latitude: string | number | null;
  longitude: string | number | null;
  addressLabel: string;
}) {
  if (input.latitude != null && input.longitude != null) {
    return `https://maps.google.com/?q=${input.latitude},${input.longitude}`;
  }
  if (input.addressLabel) {
    return `https://maps.google.com/?q=${encodeURIComponent(input.addressLabel)}`;
  }
  return null;
}
