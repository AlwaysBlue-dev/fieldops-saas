"use client";

import { useRefreshLoader } from "./data-refresh-provider";

import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/fieldops/page-header";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { ApiError } from "@/lib/api";
import { resolveCurrentMembership } from "@/lib/current-org";
import {
  type AppNotification,
  formatNotificationTime,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  notificationHref,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function NotificationInbox() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    const list = await listNotifications(organizationId, { take: 80 });
    setItems(list.items);
    setLoadState("ready");
    setError(null);
  }, [organizationId]);

  useRefreshLoader(refresh);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(params.orgSlug)
      .then((membership) => {
        if (cancelled) return;
        if (!membership) {
          setError("Organization not found");
          setLoadState("error");
          return;
        }
        setOrganizationId(membership.organization.id);
        setTimezone(membership.organization.timezone);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load organization");
          setLoadState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  useEffect(() => {
    if (!organizationId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- org-scoped remote load
    refresh().catch((caught: unknown) => {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to load notifications",
      );
      setLoadState("error");
    });
  }, [organizationId, refresh]);

  if (loadState === "loading") return <SkeletonBlock className="h-72" />;
  if (loadState === "error" && items.length === 0) {
    return (
      <ErrorState
        title="Notifications"
        description={error ?? "Unable to load notifications."}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <PageHeader
        title="Notifications"
        description="Assignments, approvals, invitations, and subscription updates for this workspace."
        actions={
          <Button
            type="button"
            variant="outline"
            className="h-11 md:h-8"
            onClick={async () => {
              if (!organizationId) return;
              await markAllNotificationsRead(organizationId);
              await refresh();
            }}
          >
            Mark all read
          </Button>
        }
      />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {items.length === 0 ? (
        <EmptyState
          title="Inbox is clear"
          description="When something needs attention, it will show up here."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full flex-col gap-1 px-4 py-3.5 text-left hover:bg-muted/50",
                  item.status === "UNREAD" && "bg-primary/5",
                )}
                onClick={async () => {
                  if (!organizationId) return;
                  if (item.status === "UNREAD") {
                    try {
                      const updated = await markNotificationRead(organizationId, item.id);
                      setItems((rows) => rows.map((row) => row.id === updated.id ? updated : row));
                    } catch {
                      setError("Unable to update notification read state. Please try again.");
                    }
                  }
                  const href = notificationHref(params.orgSlug, item);
                  if (href) router.push(href);
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="shrink-0 text-[11px] text-muted-foreground">
                    {formatNotificationTime(item.createdAt, timezone)}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">{item.message}</p>
              </button>
              {item.status === "READ" ? (
                <Button type="button" variant="ghost" className="mb-2 ml-2"
                  onClick={async () => {
                    if (!organizationId) return;
                    try {
                      const updated = await markNotificationUnread(organizationId, item.id);
                      setItems((rows) => rows.map((row) => row.id === updated.id ? updated : row));
                    } catch {
                      setError("Unable to update notification read state. Please try again.");
                    }
                  }}>
                  Mark unread
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
