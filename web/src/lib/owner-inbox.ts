import { apiRequest } from "./api";
import type { AppNotification } from "./notifications";

export type OwnerInboxMessage = AppNotification & {
  category?: string | null;
  ctaLabel?: string | null;
  ctaPath?: string | null;
};

export const OWNER_MESSAGE_CATEGORIES = [
  "GENERAL",
  "BILLING",
  "ACCOUNT",
  "MAINTENANCE",
  "IMPORTANT",
] as const;

export type OwnerMessageCategory = (typeof OWNER_MESSAGE_CATEGORIES)[number];

export function listOwnerInbox(
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
    items: OwnerInboxMessage[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>(`/organizations/${organizationId}/owner-inbox${suffix}`);
}

export function ownerInboxUnreadCount(organizationId: string) {
  return apiRequest<{ count: number }>(
    `/organizations/${organizationId}/owner-inbox/unread-count`,
  );
}

export function markOwnerInboxRead(
  organizationId: string,
  notificationId: string,
) {
  return apiRequest<OwnerInboxMessage>(
    `/organizations/${organizationId}/owner-inbox/${notificationId}/read`,
    { method: "PATCH" },
  );
}

export function markOwnerInboxUnread(
  organizationId: string,
  notificationId: string,
) {
  return apiRequest<OwnerInboxMessage>(
    `/organizations/${organizationId}/owner-inbox/${notificationId}/unread`,
    { method: "PATCH" },
  );
}

export function markAllOwnerInboxRead(organizationId: string) {
  return apiRequest<{ updated: number }>(
    `/organizations/${organizationId}/owner-inbox/read-all`,
    { method: "PATCH" },
  );
}

export function ownerMessageHref(
  orgSlug: string,
  item: OwnerInboxMessage,
): string | null {
  const path =
    item.ctaPath ??
    (typeof item.payload?.ctaPath === "string"
      ? item.payload.ctaPath
      : null);
  if (!path || typeof path !== "string") return null;
  if (path.startsWith(`/app/${orgSlug}`)) return path;
  if (path.startsWith("/app/")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `/app/${orgSlug}${normalized}`;
}

export function ownerMessageCategoryLabel(category: string | null | undefined) {
  if (!category) return null;
  return category
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
