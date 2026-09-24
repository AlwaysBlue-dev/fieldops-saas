"use client";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  type AppNotification,
  formatNotificationTime,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationHref,
  unreadNotificationCount,
} from "@/lib/notifications";
import { cn } from "cn";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "./empty-state";
import { MutationButton } from "./mutation-control";
import { SkeletonBlock } from "./skeleton-block";

export function NotificationCenter({
  organizationId,
  orgSlug,
  timezone,
  open,
  onUnreadChange,
}: {
  organizationId: string;
  orgSlug: string;
  timezone: string;
  open: boolean;
  onUnreadChange?: (count: number) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (nextPage = 1, append = false) => {
    try {
      const [list, unread] = await Promise.all([
        listNotifications(organizationId, { page: nextPage, pageSize: 20 }),
        unreadNotificationCount(organizationId),
      ]);
      setItems((current) => (append ? [...current, ...list.items] : list.items));
      setPage(list.page);
      setTotal(list.total);
      onUnreadChange?.(unread.count);
      setError(null);
      setLoadState("ready");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to load notifications",
      );
      setLoadState("error");
    }
  }, [organizationId, onUnreadChange]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- drawer open triggers fetch
    setLoadState("loading");
    refresh(1, false).catch(() => {
      if (!cancelled) setLoadState("error");
    });
    return () => {
      cancelled = true;
    };
  }, [open, refresh]);

  async function onOpenItem(item: AppNotification) {
    if (item.status === "UNREAD") {
      try {
        await markNotificationRead(organizationId, item.id);
        setItems((current) =>
          current.map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  status: "READ",
                  readAt: new Date().toISOString(),
                }
              : row,
          ),
        );
        onUnreadChange?.(
          Math.max(
            0,
            items.filter((row) => row.status === "UNREAD" && row.id !== item.id)
              .length,
          ),
        );
      } catch {
        /* navigation still allowed */
      }
    }
    const href = notificationHref(orgSlug, item);
    if (href) router.push(href);
  }

  async function onMarkAll() {
    setBusy(true);
    try {
      await markAllNotificationsRead(organizationId);
      await refresh(1, false);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to mark notifications read",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loadState === "loading") {
    return <SkeletonBlock className="h-64" />;
  }

  return (
    <div className="flex min-h-[50vh] flex-col gap-3 sm:min-h-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Recent alerts for this organization
        </p>
        <MutationButton
          type="button"
          variant="outline"
          className="h-11 shrink-0 md:h-8"
          disabled={busy || items.every((row) => row.status === "READ")}
          onClick={() => void onMarkAll()}
        >
          Mark all read
        </MutationButton>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {items.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="Assignments, approvals, and trial updates will appear here."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((item) => {
            const href = notificationHref(orgSlug, item);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors hover:bg-muted/60",
                    item.status === "UNREAD" && "bg-primary/5",
                  )}
                  onClick={() => void onOpenItem(item)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {item.title}
                    </p>
                    {item.status === "UNREAD" ? (
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{item.message}</p>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-[11px] text-muted-foreground">
                      {formatNotificationTime(item.createdAt, timezone)}
                    </p>
                    {href ? (
                      <span className="text-[11px] font-medium text-primary">
                        Open
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length < total ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 md:h-8"
          onClick={() => void refresh(page + 1, true)}
        >
          Load more
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        className="h-11 justify-start md:h-8"
        onClick={() => router.push(`/app/${orgSlug}/notifications`)}
      >
        View all
      </Button>
    </div>
  );
}
