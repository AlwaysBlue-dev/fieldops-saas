"use client";

import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { PageHeader } from "@/components/fieldops/page-header";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { canManageSubscription, resolveCurrentMembership } from "@/lib/current-org";
import { formatNotificationTime } from "@/lib/notifications";
import {
  listOwnerInbox,
  markAllOwnerInboxRead,
  markOwnerInboxRead,
  markOwnerInboxUnread,
  ownerMessageCategoryLabel,
  ownerMessageHref,
  type OwnerInboxMessage,
} from "@/lib/owner-inbox";
import { cn } from "@/lib/utils";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function OwnerInboxWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [allowed, setAllowed] = useState(false);
  const [items, setItems] = useState<OwnerInboxMessage[]>([]);
  const [selected, setSelected] = useState<OwnerInboxMessage | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    const list = await listOwnerInbox(organizationId, { take: 80 });
    setItems(list.items);
    setLoadState("ready");
    setError(null);
    setSelected((current) =>
      current
        ? (list.items.find((row) => row.id === current.id) ?? null)
        : null,
    );
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(params.orgSlug)
      .then((membership) => {
        if (cancelled) return;
        if (!membership || !canManageSubscription(membership)) {
          setError("Only the organization owner can open Inbox.");
          setLoadState("error");
          setAllowed(false);
          return;
        }
        setAllowed(true);
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
    if (!organizationId || !allowed) return;
    refresh().catch((caught: unknown) => {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to load inbox",
      );
      setLoadState("error");
    });
  }, [organizationId, allowed, refresh]);

  if (loadState === "loading") return <SkeletonBlock className="h-72" />;
  if (loadState === "error" && items.length === 0) {
    return (
      <ErrorState
        title="Inbox"
        description={error ?? "Unable to load inbox."}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <PageHeader
        title="Inbox"
        description="Messages from FieldKeel about your account, billing, and service updates. Available even when this workspace is read-only."
        actions={
          <Button
            type="button"
            variant="outline"
            className="h-11 md:h-8"
            onClick={async () => {
              if (!organizationId) return;
              await markAllOwnerInboxRead(organizationId);
              await refresh();
            }}
          >
            Mark all read
          </Button>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Inbox is clear"
          description="When FieldKeel sends an account or billing update, it will appear here."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {items.map((item) => {
              const category = ownerMessageCategoryLabel(
                item.category ??
                  (typeof item.payload?.category === "string"
                    ? item.payload.category
                    : null),
              );
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col gap-1 px-4 py-3.5 text-left hover:bg-muted/50",
                      item.status === "UNREAD" && "bg-primary/5",
                      selected?.id === item.id && "bg-muted/70",
                    )}
                    onClick={async () => {
                      setSelected(item);
                      if (!organizationId) return;
                      if (item.status === "UNREAD") {
                        const updated = await markOwnerInboxRead(
                          organizationId,
                          item.id,
                        ).catch(() => null);
                        if (updated) {
                          setItems((rows) =>
                            rows.map((row) =>
                              row.id === updated.id ? updated : row,
                            ),
                          );
                          setSelected(updated);
                        }
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="shrink-0 text-[11px] text-muted-foreground">
                        {formatNotificationTime(item.createdAt, timezone)}
                      </p>
                    </div>
                    {category ? (
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {category}
                      </p>
                    ) : null}
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {item.message}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="rounded-lg border border-border bg-card p-4">
            {selected ? (
              <div className="space-y-4">
                <div>
                  <p className="text-base font-semibold">{selected.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatNotificationTime(selected.createdAt, timezone)}
                    {ownerMessageCategoryLabel(
                      selected.category ??
                        (typeof selected.payload?.category === "string"
                          ? selected.payload.category
                          : null),
                    )
                      ? ` · ${ownerMessageCategoryLabel(
                          selected.category ??
                            (typeof selected.payload?.category === "string"
                              ? selected.payload.category
                              : null),
                        )}`
                      : ""}
                  </p>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {selected.message}
                </p>
                <div className="flex flex-wrap gap-2">
                  {ownerMessageHref(params.orgSlug, selected) ? (
                    <Button
                      type="button"
                      className="h-11 md:h-8"
                      onClick={() => {
                        const href = ownerMessageHref(params.orgSlug, selected);
                        if (href) router.push(href);
                      }}
                    >
                      {selected.ctaLabel ||
                        (typeof selected.payload?.ctaLabel === "string"
                          ? selected.payload.ctaLabel
                          : null) ||
                        "Open"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 md:h-8"
                    onClick={async () => {
                      if (!organizationId) return;
                      const updated =
                        selected.status === "UNREAD"
                          ? await markOwnerInboxRead(
                              organizationId,
                              selected.id,
                            )
                          : await markOwnerInboxUnread(
                              organizationId,
                              selected.id,
                            );
                      setItems((rows) =>
                        rows.map((row) =>
                          row.id === updated.id ? updated : row,
                        ),
                      );
                      setSelected(updated);
                    }}
                  >
                    {selected.status === "UNREAD"
                      ? "Mark read"
                      : "Mark unread"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a message to read it.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
