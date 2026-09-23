import { apiRequest, ApiError } from "./api";

export type JobStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "DISPATCHED"
  | "IN_PROGRESS"
  | "PENDING_APPROVAL"
  | "COMPLETED"
  | "RETURNED"
  | "CANCELLED";

export type JobPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type ScheduleJob = {
  id: string;
  organizationId: string;
  jobNumber: string;
  title: string;
  status: JobStatus;
  priority: JobPriority;
  scheduledStart: string | null;
  expectedFinish: string | null;
  client: { id: string; name: string; clientCode?: string | null };
  site: {
    id: string;
    name: string;
    city?: string | null;
    stateRegion?: string | null;
    addressLine1?: string | null;
  };
  team: { id: string; name: string } | null;
  supervisor: { userId: string; fullName: string } | null;
  technicians: Array<{ userId: string; fullName: string }>;
  scope?: string | null;
  jobType?: string;
  updatedAt?: string;
};

export type ScheduleLane = {
  id: string;
  kind: "TECHNICIAN" | "TEAM";
  label: string;
  userId: string | null;
  teamId: string | null;
  jobs: ScheduleJob[];
};

export type ScheduleBoard = {
  timezone: string;
  date: string;
  range: "day" | "week";
  from: string;
  to: string;
  hours: { start: number; end: number };
  defaultWindowMinutes: number;
  canMutate: boolean;
  lanes: ScheduleLane[];
  unassigned: ScheduleJob[];
};

export type ScheduleConflict = {
  jobId: string;
  jobNumber: string;
  userId: string;
  fullName: string;
  scheduledStart: string;
  expectedFinish: string | null;
};

export type ScheduleWriteBody = {
  scheduledStart?: string | null;
  expectedFinish?: string | null;
  teamId?: string | null;
  supervisorUserId?: string | null;
  technicianUserIds?: string[];
  confirmOverlap?: boolean;
};

export function getSchedule(
  organizationId: string,
  query: {
    date?: string;
    range?: "day" | "week";
    teamId?: string;
    technicianId?: string;
    clientId?: string;
    status?: JobStatus | "";
    priority?: JobPriority | "";
  } = {},
) {
  const params = new URLSearchParams();
  if (query.date) params.set("date", query.date);
  if (query.range) params.set("range", query.range);
  if (query.teamId) params.set("teamId", query.teamId);
  if (query.technicianId) params.set("technicianId", query.technicianId);
  if (query.clientId) params.set("clientId", query.clientId);
  if (query.status) params.set("status", query.status);
  if (query.priority) params.set("priority", query.priority);
  const suffix = params.toString();
  return apiRequest<ScheduleBoard>(
    `/organizations/${organizationId}/schedule${suffix ? `?${suffix}` : ""}`,
  );
}

export function getJob(organizationId: string, jobId: string) {
  return apiRequest<ScheduleJob>(`/organizations/${organizationId}/jobs/${jobId}`);
}

export function scheduleJob(
  organizationId: string,
  jobId: string,
  body: ScheduleWriteBody,
) {
  return apiRequest<ScheduleJob>(
    `/organizations/${organizationId}/jobs/${jobId}/schedule`,
    { method: "POST", body },
  );
}

export function isScheduleConflict(error: unknown): error is ApiError & {
  error: "SCHEDULE_CONFLICT";
  conflicts: ScheduleConflict[];
} {
  return (
    error instanceof ApiError &&
    error.error === "SCHEDULE_CONFLICT" &&
    Array.isArray(error.conflicts)
  );
}

export function priorityTone(priority: JobPriority) {
  if (priority === "URGENT") return "crimson" as const;
  if (priority === "HIGH") return "amber" as const;
  if (priority === "LOW") return "muted" as const;
  return "cobalt" as const;
}

export function statusTone(status: JobStatus) {
  if (status === "IN_PROGRESS" || status === "DISPATCHED") return "teal" as const;
  if (status === "COMPLETED") return "emerald" as const;
  if (status === "CANCELLED" || status === "RETURNED") return "crimson" as const;
  if (status === "PENDING_APPROVAL") return "amber" as const;
  return "muted" as const;
}

export function statusLabel(status: JobStatus) {
  return status.replaceAll("_", " ");
}

export function jobDurationMs(job: ScheduleJob, fallbackMinutes = 120) {
  if (job.scheduledStart && job.expectedFinish) {
    return Math.max(
      15 * 60_000,
      new Date(job.expectedFinish).getTime() - new Date(job.scheduledStart).getTime(),
    );
  }
  return fallbackMinutes * 60_000;
}
