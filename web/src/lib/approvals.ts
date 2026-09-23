import { apiRequest } from "./api";
import type { JobDetail } from "./jobs";
import type { OvertimeAuthorization } from "./overtime";
import type { TimeEntryRecord } from "./timesheets";

export type ApprovalType = "JOB_COMPLETION" | "TIMESHEET" | "OVERTIME";
export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "RETURNED"
  | "REJECTED"
  | "CANCELLED";
export type ApprovalDecision = "APPROVED" | "RETURNED" | "REJECTED";

export type ApprovalPerson = { userId: string; fullName: string };

export type JobApprovalSummary = {
  kind: "JOB_COMPLETION";
  job: {
    id: string;
    jobNumber: string;
    title: string;
    status: string;
    client: { id: string; name: string };
    site: { id: string; name: string; city?: string | null };
    team: { id: string; name: string } | null;
    technicians: ApprovalPerson[];
    workPerformed: string | null;
    outcome: string | null;
    safetySatisfied: boolean;
    hasSignature: boolean;
    hoursMinutes: number;
  };
};

export type JobApprovalDetail = {
  kind: "JOB_COMPLETION";
  job: JobDetail;
};

export type TimesheetApprovalSubject = {
  kind: "TIMESHEET";
  entry: TimeEntryRecord;
  weekStart: string;
  weekEnd: string;
};

export type OvertimeApprovalSubject = {
  kind: "OVERTIME";
  authorization: OvertimeAuthorization;
};

export type ApprovalSubject =
  | JobApprovalSummary
  | JobApprovalDetail
  | TimesheetApprovalSubject
  | OvertimeApprovalSubject;

export type ApprovalRecord = {
  id: string;
  organizationId: string;
  type: ApprovalType;
  status: ApprovalStatus;
  subjectType: string;
  subjectId: string;
  requestedBy: ApprovalPerson;
  requestedAt: string;
  assignedApprover: ApprovalPerson | null;
  assignedRole: string | null;
  decidedBy: ApprovalPerson | null;
  decidedAt: string | null;
  decision: string | null;
  comment: string | null;
  canDecide: boolean;
  subject: ApprovalSubject;
};

export type ApprovalList = {
  items: ApprovalRecord[];
  counts: {
    JOB_COMPLETION: number;
    TIMESHEET: number;
    OVERTIME: number;
  };
  canDecide: boolean;
};

export type BulkTimesheetResult = {
  results: Array<{
    approvalId: string;
    status: "APPROVED" | "SKIPPED" | "FAILED";
    message?: string;
  }>;
};

export function listApprovals(
  organizationId: string,
  query: { type?: ApprovalType; status?: ApprovalStatus } = {},
) {
  const params = new URLSearchParams();
  if (query.type) params.set("type", query.type);
  if (query.status) params.set("status", query.status);
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<ApprovalList>(
    `/organizations/${organizationId}/approvals${suffix}`,
  );
}

export function getApproval(organizationId: string, approvalId: string) {
  return apiRequest<ApprovalRecord>(
    `/organizations/${organizationId}/approvals/${approvalId}`,
  );
}

export function decideApproval(
  organizationId: string,
  approvalId: string,
  decision: ApprovalDecision,
  comment?: string,
) {
  return apiRequest<ApprovalRecord>(
    `/organizations/${organizationId}/approvals/${approvalId}/decide`,
    { method: "POST", body: { decision, comment } },
  );
}

export function bulkApproveTimesheets(
  organizationId: string,
  approvalIds: string[],
) {
  return apiRequest<BulkTimesheetResult>(
    `/organizations/${organizationId}/approvals/bulk-timesheets`,
    { method: "POST", body: { approvalIds } },
  );
}

export function approvalStatusLabel(status: string) {
  switch (status) {
    case "APPROVED":
      return "Approved";
    case "RETURNED":
      return "Returned";
    case "REJECTED":
      return "Rejected";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Pending";
  }
}

export function approvalStatusTone(
  status: string,
): "muted" | "amber" | "emerald" | "crimson" {
  if (status === "APPROVED") return "emerald";
  if (status === "RETURNED") return "amber";
  if (status === "REJECTED") return "crimson";
  if (status === "CANCELLED") return "muted";
  return "amber";
}
