import { apiRequest, ApiError } from "./api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ReportKpis = {
  jobsToday: number;
  activeJobs: number;
  completedJobs: number;
  pendingApproval: number;
  overdueJobs: number;
  totalLabourMinutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  completionRate: number | null;
  averageJobDurationMinutes: number;
  techniciansActiveToday: number;
  timeEntriesRequiringReview: number;
};

export type ReportSummary = {
  timezone: string;
  asOf: string;
  kpis: ReportKpis;
};

export type ReportFilters = {
  from?: string;
  to?: string;
  clientId?: string;
  siteId?: string;
  teamId?: string;
  technicianUserId?: string;
  status?: string;
  priority?: string;
  page?: number;
  pageSize?: number;
};

export type JobStatusReport = {
  timezone: string;
  from: string;
  to: string;
  counts: Record<string, number>;
  items: Array<{ status: string; count: number }>;
};

export type LabourReport = {
  timezone: string;
  from: string;
  to: string;
  totals: {
    normalMinutes: number;
    overtimeMinutes: number;
    otherMinutes: number;
    totalMinutes: number;
  };
  daily: Array<{
    date: string;
    normalMinutes: number;
    overtimeMinutes: number;
    totalMinutes: number;
  }>;
  byTechnician: Array<{ userId: string; fullName: string; minutes: number }>;
  byClient: Array<{ clientId: string; clientName: string; minutes: number }>;
  bySite: Array<{
    siteId: string;
    siteName: string;
    clientName: string;
    minutes: number;
  }>;
  byJob: Array<{ jobId: string; jobNumber: string; minutes: number }>;
};

export type JobsReportTable = {
  timezone: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    id: string;
    jobNumber: string;
    title: string;
    status: string;
    priority: string;
    client: { id: string; name: string };
    site: { id: string; name: string; city?: string | null };
    team: { id: string; name: string } | null;
    technicians: Array<{ userId: string; fullName: string }>;
    scheduledStart: string | null;
    completedAt: string | null;
    labourMinutes: number;
  }>;
};

function queryString(filters: ReportFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || value === "ALL") continue;
    params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `?${suffix}` : "";
}

export function getReportSummary(organizationId: string) {
  return apiRequest<ReportSummary>(
    `/organizations/${organizationId}/reports/summary`,
  );
}

export function getJobStatusReport(
  organizationId: string,
  filters: ReportFilters = {},
) {
  return apiRequest<JobStatusReport>(
    `/organizations/${organizationId}/reports/job-status${queryString(filters)}`,
  );
}

export function getLabourReport(
  organizationId: string,
  filters: ReportFilters = {},
) {
  return apiRequest<LabourReport>(
    `/organizations/${organizationId}/reports/labour${queryString(filters)}`,
  );
}

export function getJobsReport(
  organizationId: string,
  filters: ReportFilters = {},
) {
  return apiRequest<JobsReportTable>(
    `/organizations/${organizationId}/reports/jobs${queryString(filters)}`,
  );
}

export async function downloadReportCsv(
  organizationId: string,
  kind: "jobs" | "timesheets" | "labour",
  filters: ReportFilters = {},
) {
  const response = await fetch(
    `${API_URL}/organizations/${organizationId}/reports/exports/${kind}.csv${queryString(filters)}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ApiError(
      response.status,
      payload?.message || "Export failed",
    );
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  return { blob, filename: match?.[1] ?? `${kind}.csv` };
}

export async function downloadJobReportPdf(
  organizationId: string,
  jobId: string,
) {
  const response = await fetch(
    `${API_URL}/organizations/${organizationId}/reports/jobs/${jobId}/pdf`,
    { credentials: "include" },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ApiError(
      response.status,
      payload?.message || "PDF failed",
    );
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  return { blob, filename: match?.[1] ?? `job-${jobId}.pdf` };
}

export function formatMinutesLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function jobStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}
