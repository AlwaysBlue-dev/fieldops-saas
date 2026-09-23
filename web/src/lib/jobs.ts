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

export const MATERIAL_UNITS = [
  "ea",
  "pcs",
  "set",
  "m",
  "ft",
  "kg",
  "L",
  "box",
  "other",
] as const;

export type MaterialUnit = (typeof MATERIAL_UNITS)[number];

export type JobOutcome =
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FOLLOW_UP_REQUIRED"
  | "UNABLE_TO_COMPLETE";

export type SafetyControlStatus = "NOT_REQUIRED" | "PENDING" | "CONFIRMED";

export type JobSafetyControl = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  status: SafetyControlStatus;
  confirmedBy: JobPerson | null;
  confirmedAt: string | null;
  note: string | null;
};

export type JobDetail = JobSummary & {
  scope: string | null;
  internalNotes: string | null;
  clientRepName: string | null;
  clientRepTitle: string | null;
  clientRepPhone: string | null;
  clientRepEmail: string | null;
  representativeName?: string | null;
  representativeRole?: string | null;
  representativePhone?: string | null;
  representativeEmail?: string | null;
  workPerformed: string | null;
  completionNotes: string | null;
  outcome: JobOutcome | null;
  outcomeReason: string | null;
  requireRiskAssessment: boolean;
  requirePermit: boolean;
  requireLoto: boolean;
  requireClientSignOff: boolean;
  clientAccepted?: boolean;
  clientComments?: string | null;
  signedAt?: string | null;
  cancelReason: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  addressLabel?: string | null;
  navigationUrl?: string | null;
  client: JobSummary["client"] & {
    clientCode?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  site: JobSummary["site"] & {
    stateRegion?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    postalCode?: string | null;
    country?: string | null;
    latitude?: string | null;
    longitude?: string | null;
  };
  allowedTransitions: JobStatus[];
  permissions: {
    canEdit: boolean;
    canDispatch: boolean;
    canCancel: boolean;
    canApprove: boolean;
    canFieldAdvance: boolean;
    canExecute?: boolean;
    canSubmit?: boolean;
    canEditExecutionRecords?: boolean;
  };
  execution?: {
    recordsLocked: boolean;
    safetySatisfied: boolean;
    clockedInOnThisJob: boolean;
  };
  safetyControls: JobSafetyControl[];
  workLogs: Array<{
    id: string;
    text?: string;
    body: string;
    createdAt?: string;
    loggedAt: string;
    author: JobPerson;
  }>;
  materials: Array<{
    id: string;
    itemName?: string;
    name: string;
    partNumber?: string | null;
    quantity: string;
    unit: string;
    notes: string | null;
    createdAt?: string;
    addedBy?: JobPerson;
  }>;
  files: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: string;
    type: string;
    category?: string;
    caption?: string | null;
    capturedAt?: string | null;
    uploadedById?: string;
    createdAt: string;
  }>;
  signatures: Array<{
    id: string;
    signerName: string;
    signerTitle: string | null;
    representativeName?: string;
    representativeRole?: string | null;
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
    workDate?: string;
    startedAt: string;
    endedAt: string | null;
    durationMinutes: number | null;
    type?: string;
    source: string;
    status: string;
    description?: string | null;
    user: JobPerson;
  }>;
  activity: Array<{
    id: string;
    action: string;
    actorName: string | null;
    createdAt: string;
  }>;
  returnReason?: string | null;
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

export function confirmSafetyControl(
  organizationId: string,
  jobId: string,
  code: string,
  note?: string,
) {
  return apiRequest<JobSafetyControl>(
    `/organizations/${organizationId}/jobs/${jobId}/safety/${code}/confirm`,
    { method: "POST", body: { note } },
  );
}

export function updateJobClientContact(
  organizationId: string,
  jobId: string,
  body: {
    representativeName?: string;
    representativeRole?: string;
    representativePhone?: string;
    representativeEmail?: string;
  },
) {
  return apiRequest<JobDetail>(
    `/organizations/${organizationId}/jobs/${jobId}/client-contact`,
    { method: "PATCH", body },
  );
}

export function updateJobCompletion(
  organizationId: string,
  jobId: string,
  body: {
    workPerformed: string;
    completionNotes?: string;
    outcome: JobOutcome;
    outcomeReason?: string;
  },
) {
  return apiRequest<JobDetail>(
    `/organizations/${organizationId}/jobs/${jobId}/completion`,
    { method: "PATCH", body },
  );
}

export function addJobWorkLog(organizationId: string, jobId: string, text: string) {
  return apiRequest(`/organizations/${organizationId}/jobs/${jobId}/work-logs`, {
    method: "POST",
    body: { text },
  });
}

export function updateJobWorkLog(
  organizationId: string,
  jobId: string,
  workLogId: string,
  text: string,
) {
  return apiRequest(
    `/organizations/${organizationId}/jobs/${jobId}/work-logs/${workLogId}`,
    { method: "PATCH", body: { text } },
  );
}

export function addJobMaterialRecord(
  organizationId: string,
  jobId: string,
  body: {
    itemName: string;
    partNumber?: string;
    quantity: number;
    unit: MaterialUnit;
    notes?: string;
  },
) {
  return apiRequest(`/organizations/${organizationId}/jobs/${jobId}/materials`, {
    method: "POST",
    body,
  });
}

export function updateJobMaterialRecord(
  organizationId: string,
  jobId: string,
  materialId: string,
  body: {
    itemName?: string;
    partNumber?: string;
    quantity?: number;
    unit?: MaterialUnit;
    notes?: string;
  },
) {
  return apiRequest(
    `/organizations/${organizationId}/jobs/${jobId}/materials/${materialId}`,
    { method: "PATCH", body },
  );
}

export function removeJobMaterialRecord(
  organizationId: string,
  jobId: string,
  materialId: string,
) {
  return apiRequest(
    `/organizations/${organizationId}/jobs/${jobId}/materials/${materialId}`,
    { method: "DELETE" },
  );
}

export function getJobActivity(organizationId: string, jobId: string) {
  return apiRequest<JobDetail["activity"]>(
    `/organizations/${organizationId}/jobs/${jobId}/activity`,
  );
}

export function jobTypeLabel(type: string) {
  return type.replaceAll("_", " ");
}

export function outcomeLabel(outcome: JobOutcome) {
  switch (outcome) {
    case "COMPLETED":
      return "Completed";
    case "PARTIALLY_COMPLETED":
      return "Partially completed";
    case "FOLLOW_UP_REQUIRED":
      return "Follow-up required";
    case "UNABLE_TO_COMPLETE":
      return "Unable to complete";
  }
}

export function safetyStatusLabel(status: SafetyControlStatus) {
  switch (status) {
    case "NOT_REQUIRED":
      return "Not required";
    case "PENDING":
      return "Pending";
    case "CONFIRMED":
      return "Confirmed";
  }
}

export function activityLabel(action: string) {
  const labels: Record<string, string> = {
    JOB_CREATED: "Job created",
    JOB_SCHEDULED: "Job scheduled",
    JOB_ASSIGNED: "Crew assigned",
    JOB_DISPATCHED: "Job dispatched",
    JOB_STARTED: "Work started",
    CLOCK_IN: "Clocked in",
    CLOCK_OUT: "Clocked out",
    SAFETY_CONFIRMED: "Safety confirmed",
    SAFETY_CONTROL_CONFIRMED: "Safety confirmed",
    JOB_WORK_LOG: "Work log added",
    WORK_LOG_ADDED: "Work log added",
    WORK_LOG_UPDATED: "Work log updated",
    MATERIAL_ADDED: "Material added",
    MATERIAL_UPDATED: "Material updated",
    MATERIAL_REMOVED: "Material removed",
    COMPLETION_SUMMARY_UPDATED: "Completion summary updated",
    JOB_SUBMITTED: "Submitted for approval",
    JOB_RETURNED: "Returned for rework",
    JOB_APPROVED: "Job approved",
    JOB_COMPLETED: "Job approved",
    JOB_CANCELLED: "Job cancelled",
  };
  return labels[action] ?? action.replaceAll("_", " ").toLowerCase();
}
