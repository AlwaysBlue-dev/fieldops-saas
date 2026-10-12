"use client";

import { Button } from "@/components/ui/button";
import { listPlatformNotifications, markPlatformNotificationRead, type PlatformNotification } from "@/lib/platform";
import Link from "next/link";
import { useEffect, useState } from "react";

export function PlatformNotificationsPage() {
  const [items, setItems] = useState<PlatformNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function refresh() {
    try {
      const result = await listPlatformNotifications();
      setItems(result.items);
      setError(null);
    } catch {
      setError("Platform notifications could not be loaded.");
    }
  }
  useEffect(() => { void refresh(); }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform notifications</h1>
        <p className="mt-2 text-sm text-muted-foreground">Trial, payment, and subscription events for workspaces.</p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {items.length ? items.map((item) => {
        const payload = item.payload && typeof item.payload === "object" ? item.payload as { ctaPath?: string } : null;
        const ctaPath = payload?.ctaPath?.startsWith("/platform/") ? payload.ctaPath : null;
        return (
          <article key={item.id} className="rounded-lg border border-border bg-card px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{item.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                <p className="mt-2 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()} · {item.status.replaceAll("_", " ")}</p>
              </div>
              <div className="flex gap-2">
                {ctaPath ? <Button asChild variant="outline" className="h-9"><Link href={ctaPath}>Open record</Link></Button> : null}
                {item.status === "UNREAD" ? <Button className="h-9" onClick={async () => { await markPlatformNotificationRead(item.id); await refresh(); }}>Mark read</Button> : null}
              </div>
            </div>
          </article>
        );
      }) : !error ? <p className="rounded-lg border border-border bg-card px-4 py-5 text-sm text-muted-foreground">No platform notifications.</p> : null}
    </div>
  );
}
