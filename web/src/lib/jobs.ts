import { apiRequest } from "./api";
import type { LocationEvidence } from "./location";
import {
  priorityTone,
  statusLabel,
  statusTone,
  type JobPriority,
  type JobStatus,
} from "./schedule";

export type { JobPriority, JobStatus };
export { priorityTone, statusLabel, statusTone };

export const JOB_TYPES = [
  "SERVICE_CALL",
  "INSTALLATION",
  "MAINTENANCE",
  "INSPECTION",
  "EMERGENCY",
  "OTHER",
] as const;

export type JobType = (typeof JOB_TYPES)[number];

export type JobPerson = { userId: string; fullName: string };

export type JobSummary = {
  id: string;
  organizationId: string;
  jobNumber: string;
  title: string;
  jobType: string;
  status: JobStatus;
  priority: JobPriority;
  scheduledStart: string | null;
  expectedFinish: string | null;
  workOrderNumber: string | null;
  client: { id: string; name: string };
  site: { id: string; name: string; city?: string | null };
  team: { id: string; name: string } | null;
  supervisor: JobPerson | null;
  technicians: JobPerson[];
  updatedAt: string;
};

export type JobDetail = JobSummary & {
  scope: string | null;
  internalNotes: string | null;
  clientRepName: string | null;
  clientRepTitle: string | null;
  clientRepPhone: string | null;
  clientRepEmail: string | null;
  requireRiskAssessment: boolean;
  requirePermit: boolean;
  requireLoto: boolean;
  requireClientSignOff: boolean;
  cancelReason: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  client: JobSummary["client"] & {
    clientCode?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  site: JobSummary["site"] & {
    stateRegion?: string | null;
    addressLine1?: string | null;
  };
  allowedTransitions: JobStatus[];
  permissions: {
    canEdit: boolean;
    canDispatch: boolean;
    canCancel: boolean;
    canApprove: boolean;
    canFieldAdvance: boolean;
  };
  workLogs: Array<{
    id: string;
    body: string;
    loggedAt: string;
    author: JobPerson;
  }>;
  materials: Array<{
    id: string;
    name: string;
    quantity: string;
    unit: string;
    notes: string | null;
  }>;
  files: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: string;
    type: string;
    createdAt: string;
  }>;
  signatures: Array<{
    id: string;
    signerName: string;
    signerTitle: string | null;
    signedAt: string;
  }>;
  clockSessions: Array<{
    id: string;
    status: string;
    clockInAt: string;
    clockOutAt: string | null;
    technician: JobPerson;
    clockInEvidence?: LocationEvidence | null;
    clockOutEvidence?: LocationEvidence | null;
  }>;
  timeEntries: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    durationMinutes: number | null;
    source: string;
    status: string;
    user: JobPerson;
  }>;
  activity: Array<{
    id: string;
    action: string;
    actorName: string | null;
    createdAt: string;
  }>;
};

export type JobListResponse = {
  items: JobSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type JobWriteBody = {
  title: string;
  clientId: string;
  siteId: string;
  jobType: JobType;
  priority?: JobPriority;
  scheduledStart?: string | null;
  expectedFinish?: string | null;
  teamId?: string | null;
  supervisorUserId?: string | null;
  technicianUserIds?: string[];
  workOrderNumber?: string;
  scope?: string;
  internalNotes?: string;
  clientRepName?: string;
  clientRepTitle?: string;
  clientRepPhone?: string;
  clientRepEmail?: string;
  requireRiskAssessment?: boolean;
  requirePermit?: boolean;
  requireLoto?: boolean;
  requireClientSignOff?: boolean;
};

export type JobListQuery = {
  search?: string;
  status?: JobStatus | "";
  priority?: JobPriority | "";
  teamId?: string;
  technicianId?: string;
  clientId?: string;
  date?: string;
  preset?: "open" | "today" | "unassigned" | "approval" | "";
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: "asc" | "desc";
};

export function listJobs(organizationId: string, query: JobListQuery = {}) {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.priority) params.set("priority", query.priority);
  if (query.teamId) params.set("teamId", query.teamId);
  if (query.technicianId) params.set("technicianId", query.technicianId);
  if (query.clientId) params.set("clientId", query.clientId);
  if (query.date) params.set("date", query.date);
  if (query.preset) params.set("preset", query.preset);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.sort) params.set("sort", query.sort);
  if (query.order) params.set("order", query.order);
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<JobListResponse>(`/organizations/${organizationId}/jobs${suffix}`);
}

export function getJobCard(organizationId: string, jobId: string) {
  return apiRequest<JobDetail>(`/organizations/${organizationId}/jobs/${jobId}`);
}

export function createJob(organizationId: string, body: JobWriteBody) {
  return apiRequest<JobDetail>(`/organizations/${organizationId}/jobs`, {
    method: "POST",
    body,
  });
}

export function updateJob(
  organizationId: string,
  jobId: string,
  body: Partial<JobWriteBody>,
) {
  return apiRequest<JobDetail>(`/organizations/${organizationId}/jobs/${jobId}`, {
    method: "PATCH",
    body,
  });
}

export function dispatchJob(organizationId: string, jobId: string) {
  return apiRequest<JobDetail>(`/organizations/${organizationId}/jobs/${jobId}/dispatch`, {
    method: "POST",
    body: {},
  });
}

export function startJob(organizationId: string, jobId: string) {
  return apiRequest<JobDetail>(`/organizations/${organizationId}/jobs/${jobId}/start`, {
    method: "POST",
    body: {},
  });
}

export function submitJob(organizationId: string, jobId: string) {
  return apiRequest<JobDetail>(`/organizations/${organizationId}/jobs/${jobId}/submit`, {
    method: "POST",
    body: {},
  });
}

export function completeJob(organizationId: string, jobId: string) {
  return apiRequest<JobDetail>(`/organizations/${organizationId}/jobs/${jobId}/complete`, {
    method: "POST",
    body: {},
  });
}

export function returnJob(organizationId: string, jobId: string, reason?: string) {
  return apiRequest<JobDetail>(`/organizations/${organizationId}/jobs/${jobId}/return`, {
    method: "POST",
    body: { reason },
  });
}

export function resumeJob(organizationId: string, jobId: string) {
  return apiRequest<JobDetail>(`/organizations/${organizationId}/jobs/${jobId}/resume`, {
    method: "POST",
    body: {},
  });
}

export function cancelJob(organizationId: string, jobId: string, reason?: string) {
  return apiRequest<JobDetail>(`/organizations/${organizationId}/jobs/${jobId}/cancel`, {
    method: "POST",
    body: { reason },
  });
}

export function jobTypeLabel(type: string) {
  return type.replaceAll("_", " ");
}

export function activityLabel(action: string) {
  return action.replaceAll("_", " ").toLowerCase();
}
