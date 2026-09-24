import { apiRequest } from "./api";

export type AppNotification = {
  id: string;
  organizationId: string | null;
  recipientUserId: string;
  type: string;
  title: string;
  message: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  payload: Record<string, unknown> | null;
  status: "UNREAD" | "READ";
  readAt: string | null;
  createdAt: string;
};

export function listNotifications(
  organizationId: string,
  query: {
    unreadOnly?: boolean;
    take?: number;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const params = new URLSearchParams();
  if (query.unreadOnly) params.set("unreadOnly", "true");
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  else if (query.take) params.set("pageSize", String(query.take));
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<{
    items: AppNotification[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>(`/organizations/${organizationId}/notifications${suffix}`);
}

export function unreadNotificationCount(organizationId: string) {
  return apiRequest<{ count: number }>(
    `/organizations/${organizationId}/notifications/unread-count`,
  );
}

export function markNotificationRead(
  organizationId: string,
  notificationId: string,
) {
  return apiRequest<AppNotification>(
    `/organizations/${organizationId}/notifications/${notificationId}/read`,
    { method: "PATCH" },
  );
}

export function markAllNotificationsRead(organizationId: string) {
  return apiRequest<{ updated: number }>(
    `/organizations/${organizationId}/notifications/read-all`,
    { method: "PATCH" },
  );
}

export function notificationHref(
  orgSlug: string,
  item: AppNotification,
): string | null {
  const payload = item.payload ?? {};
  const jobId =
    item.relatedEntityType === "Job"
      ? item.relatedEntityId
      : typeof payload.jobId === "string"
        ? payload.jobId
        : null;
  switch (item.type) {
    case "JOB_ASSIGNED":
    case "JOB_RESCHEDULED":
    case "JOB_APPROVED":
    case "JOB_RETURNED":
    case "JOB_APPROVAL_REQUESTED":
      return jobId
        ? `/app/${orgSlug}/jobs/${jobId}`
        : `/app/${orgSlug}/jobs`;
    case "TIMESHEET_SUBMITTED":
    case "TIMESHEET_APPROVED":
    case "TIMESHEET_RETURNED":
    case "OVERTIME_REQUESTED":
    case "OVERTIME_APPROVED":
    case "OVERTIME_REJECTED":
      return item.type.startsWith("OVERTIME") ||
        item.type === "TIMESHEET_SUBMITTED"
        ? `/app/${orgSlug}/approvals`
        : `/app/${orgSlug}/time`;
    case "INVITATION":
      return `/app/${orgSlug}/settings/members`;
    case "TRIAL_EXPIRING":
    case "TRIAL_GRACE":
    case "TRIAL_EXPIRED":
    case "ACTIVATION_REQUEST_ACK":
    case "ACTIVATION_REQUESTED":
    case "WORKSPACE_READ_ONLY":
    case "SUBSCRIPTION_ACTIVATED":
    case "SUBSCRIPTION_RENEWED":
      return `/app/${orgSlug}/settings/billing`;
    default:
      return null;
  }
}

export function formatNotificationTime(
  iso: string,
  timeZone: string,
): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}
