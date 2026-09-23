import { apiRequest } from "./api";

export type TimeEntryType = "NORMAL" | "OVERTIME" | "TRAVEL" | "STANDBY";
export type TimeEntrySource = "CLOCK" | "MANUAL";
export type TimeEntryStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "RETURNED"
  | "REJECTED";
export type TimesheetValidationStatus = "CLEAR" | "REVIEW" | "BLOCKED";

export type TimesheetCheck = {
  code: string;
  severity: "WARNING" | "ERROR";
  message: string;
};

export type TimesheetValidation = {
  status: TimesheetValidationStatus;
  checks: TimesheetCheck[];
};

export type TimeEntryRecord = {
  id: string;
  organizationId: string;
  technician: { userId: string; fullName: string };
  job: { id: string; jobNumber: string; title: string } | null;
  workDate: string;
  startAt: string;
  endAt: string | null;
  durationMinutes: number | null;
  type: TimeEntryType;
  source: TimeEntrySource;
  description: string | null;
  status: TimeEntryStatus | string;
  validation: TimesheetValidation;
  clockSessionId: string | null;
  overtimeAuthorization: {
    id: string;
    status: string;
    maxMinutes: number;
  } | null;
};

export type TimesheetDay = {
  date: string;
  weekday: string;
  weekdayLabel: string;
  totalMinutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  entries: TimeEntryRecord[];
};

export type TimesheetWeek = {
  weekStart: string;
  weekEnd: string;
  timezone: string;
  technician: { userId: string; fullName: string };
  technicians: Array<{ userId: string; fullName: string }>;
  days: TimesheetDay[];
  totals: {
    weekMinutes: number;
    normalMinutes: number;
    overtimeMinutes: number;
    travelMinutes: number;
    standbyMinutes: number;
    pendingMinutes: number;
    approvedMinutes: number;
  };
  recent: TimeEntryRecord[];
  settings: {
    allowManualTime: boolean;
    allowOvertimeRequests?: boolean;
    defaultDailyHoursLimit: number;
    defaultWeeklyHoursLimit: number;
  };
  canCreateManual: boolean;
  canRequestOvertime?: boolean;
  canApprove: boolean;
  canSelectTechnician: boolean;
  currentWeekStart: string;
  maxWeekStart: string;
};

export type CreateTimeEntryBody = {
  jobId: string;
  workDate: string;
  type: TimeEntryType;
  startTime: string;
  endTime: string;
  description: string;
  userId?: string;
};

export function getTimesheetWeek(
  organizationId: string,
  query: { weekStart?: string; userId?: string } = {},
) {
  const params = new URLSearchParams();
  if (query.weekStart) params.set("weekStart", query.weekStart);
  if (query.userId) params.set("userId", query.userId);
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<TimesheetWeek>(
    `/organizations/${organizationId}/timesheets${suffix}`,
  );
}

export function createManualTimeEntry(
  organizationId: string,
  body: CreateTimeEntryBody,
) {
  return apiRequest<TimeEntryRecord>(
    `/organizations/${organizationId}/timesheets/entries`,
    { method: "POST", body },
  );
}

export function submitTimeEntry(organizationId: string, entryId: string) {
  return apiRequest<TimeEntryRecord>(
    `/organizations/${organizationId}/timesheets/entries/${entryId}/submit`,
    { method: "POST" },
  );
}

export function decideTimeEntry(
  organizationId: string,
  entryId: string,
  decision: "APPROVED" | "RETURNED" | "REJECTED",
  comment?: string,
) {
  return apiRequest<TimeEntryRecord>(
    `/organizations/${organizationId}/timesheets/entries/${entryId}/decide`,
    { method: "POST", body: { decision, comment } },
  );
}

export function formatHours(minutes: number | null | undefined) {
  if (minutes == null) return "—";
  const hours = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(hours) ? `${hours}h` : `${hours}h`;
}

export function formatEntryTime(
  startAt: string,
  endAt: string | null,
  timeZone: string,
) {
  const start = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startAt));
  if (!endAt) return `${start}–`;
  const end = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(endAt));
  return `${start}–${end}`;
}

export function typeLabel(type: string) {
  switch (type) {
    case "OVERTIME":
      return "Overtime";
    case "TRAVEL":
      return "Travel";
    case "STANDBY":
      return "Standby";
    default:
      return "Normal";
  }
}

export function sourceLabel(source: string) {
  return source === "MANUAL" ? "Manual" : "Clock";
}

export function statusLabel(status: string) {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "PENDING":
    case "SUBMITTED":
      return "Pending";
    case "APPROVED":
      return "Approved";
    case "RETURNED":
      return "Returned";
    case "REJECTED":
      return "Rejected";
    default:
      return status;
  }
}

export function statusTone(
  status: string,
): "muted" | "amber" | "emerald" | "cobalt" | "crimson" {
  switch (status) {
    case "APPROVED":
      return "emerald";
    case "PENDING":
    case "SUBMITTED":
      return "amber";
    case "RETURNED":
      return "cobalt";
    case "REJECTED":
      return "crimson";
    default:
      return "muted";
  }
}

export function validationTone(
  status: TimesheetValidationStatus,
): "teal" | "amber" | "crimson" {
  if (status === "CLEAR") return "teal";
  if (status === "REVIEW") return "amber";
  return "crimson";
}

export function validationLabel(status: TimesheetValidationStatus) {
  if (status === "CLEAR") return "Clear";
  if (status === "REVIEW") return "Review";
  return "Blocked";
}
