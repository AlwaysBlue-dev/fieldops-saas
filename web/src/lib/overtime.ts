import { apiRequest } from "./api";
import { formatHours } from "./timesheets";

export type OvertimeStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type OvertimeAuthorization = {
  id: string;
  organizationId: string;
  technician: { userId: string; fullName: string };
  job: { id: string; jobNumber: string; title: string };
  workDate: string;
  authorizedStart: string;
  authorizedEnd: string;
  maxMinutes: number;
  remainingMinutes: number;
  usedMinutes: number;
  reason: string;
  status: OvertimeStatus;
  requestedBy: { userId: string; fullName: string };
  requestedAt: string;
  decidedBy: { userId: string; fullName: string } | null;
  decidedAt: string | null;
  decisionComment: string | null;
};

export type OvertimeList = {
  items: OvertimeAuthorization[];
  total: number;
  page: number;
  pageSize: number;
  canDecide: boolean;
  canRequest: boolean;
};

export type CreateOvertimeBody = {
  jobId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  maxMinutes: number;
  reason: string;
  userId?: string;
};

export function listOvertimeAuthorizations(
  organizationId: string,
  query: { status?: OvertimeStatus; userId?: string; pageSize?: number } = {},
) {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.userId) params.set("userId", query.userId);
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<OvertimeList>(
    `/organizations/${organizationId}/overtime-authorizations${suffix}`,
  );
}

export function createOvertimeAuthorization(
  organizationId: string,
  body: CreateOvertimeBody,
) {
  return apiRequest<OvertimeAuthorization>(
    `/organizations/${organizationId}/overtime-authorizations`,
    { method: "POST", body },
  );
}

export function decideOvertimeAuthorization(
  organizationId: string,
  authorizationId: string,
  decision: "APPROVED" | "REJECTED",
  comment?: string,
) {
  return apiRequest<OvertimeAuthorization>(
    `/organizations/${organizationId}/overtime-authorizations/${authorizationId}/decide`,
    { method: "POST", body: { decision, comment } },
  );
}

export function cancelOvertimeAuthorization(
  organizationId: string,
  authorizationId: string,
) {
  return apiRequest<OvertimeAuthorization>(
    `/organizations/${organizationId}/overtime-authorizations/${authorizationId}/cancel`,
    { method: "POST" },
  );
}

export function overtimeStatusLabel(status: string) {
  switch (status) {
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Pending";
  }
}

export function overtimeStatusTone(
  status: string,
): "muted" | "amber" | "emerald" | "crimson" {
  if (status === "APPROVED") return "emerald";
  if (status === "REJECTED") return "crimson";
  if (status === "CANCELLED") return "muted";
  return "amber";
}

export function formatOvertimeWindow(
  startIso: string,
  endIso: string,
  timeZone: string,
) {
  const fmt = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  return `${fmt(startIso)}–${fmt(endIso)}`;
}

export function formatMaxDuration(minutes: number) {
  return formatHours(minutes);
}
