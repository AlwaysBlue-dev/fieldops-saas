"use client";

import { ResponsiveDrawer } from "@/components/fieldops/responsive-drawer";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Button } from "@/components/ui/button";
import { getOfflineJob } from "@/lib/offline/db";
import {
  jobMissingAccess,
  jobMissingAccessItems,
  formatMissingAccessItems,
  priorityTone,
  statusLabel,
  statusTone,
  type JobDetail,
} from "@/lib/jobs";
import { formatDateTimeInZone } from "@/lib/timezone";
import { Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { MissingAccessBadge } from "./missing-access-badge";

/**
 * Offline-capable job details from IndexedDB.
 * Used when Next.js soft navigation cannot load a job page without the network.
 */
export function OfflineJobSheet({
  open,
  jobId,
  organizationId,
  userId,
  timeZone,
  onClose,
  onAddUpdate,
}: {
  open: boolean;
  jobId: string | null;
  organizationId: string;
  userId: string;
  timeZone: string;
  onClose: () => void;
  onAddUpdate?: () => void;
}) {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !jobId) {
      setJob(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getOfflineJob(jobId)
      .then((row) => {
        if (cancelled) return;
        if (
          !row ||
          row.organizationId !== organizationId ||
          row.userId !== userId ||
          !row.payload ||
          typeof row.payload !== "object"
        ) {
          setJob(null);
          setError(
            "This job is not prepared for offline use on this device. Reconnect and use Prepare for offline on My Day.",
          );
          return;
        }
        setJob(row.payload as JobDetail);
        setSyncedAt(row.lastSyncedAt ?? row.downloadedAt);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Could not read the offline job snapshot.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, jobId, organizationId, userId]);

  const accessNotes = job?.site.accessNotes ?? job?.site.notes ?? null;
  const contactName = job?.site.siteContactName ?? null;
  const contactPhone = job?.site.siteContactPhone ?? null;
  const missing = job ? formatMissingAccessItems(jobMissingAccessItems(job)) : "";

  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={job ? `${job.jobNumber} · ${job.title}` : "Job (offline)"}
      description={
        syncedAt
          ? `Last synced ${formatDateTimeInZone(syncedAt, timeZone)} — not live server data.`
          : undefined
      }
    >
      <div className="flex flex-col gap-4 pb-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading saved job…</p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {job ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                label={statusLabel(job.status)}
                tone={statusTone(job.status)}
              />
              <StatusPill
                label={job.priority}
                tone={priorityTone(job.priority)}
              />
              {jobMissingAccess(job) ? <MissingAccessBadge /> : null}
            </div>
            {jobMissingAccess(job) ? (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100">
                Missing access info{missing ? `: ${missing}` : ""} (last
                synced).
              </p>
            ) : null}
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Client
                </dt>
                <dd>{job.client.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Site / address
                </dt>
                <dd>
                  {job.site.name}
                  {job.addressLabel ? (
                    <>
                      <br />
                      {job.addressLabel}
                    </>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Site access notes
                </dt>
                <dd className="whitespace-pre-wrap">
                  {accessNotes?.trim()
                    ? accessNotes
                    : "No access notes in this offline snapshot."}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Site contact
                </dt>
                <dd>
                  {contactName || contactPhone ? (
                    <span className="flex flex-wrap items-center gap-2">
                      {contactName ?? "Site contact"}
                      {contactPhone ? (
                        <a
                          href={`tel:${contactPhone}`}
                          className="inline-flex items-center gap-1 text-primary"
                        >
                          <Phone className="size-3.5" />
                          {contactPhone}
                        </a>
                      ) : null}
                    </span>
                  ) : (
                    "No site contact in this offline snapshot."
                  )}
                </dd>
              </div>
              {job.clientRepName || job.clientRepPhone ? (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Customer contact on site
                  </dt>
                  <dd>
                    {job.clientRepName ?? "Contact"}
                    {job.clientRepPhone ? ` · ${job.clientRepPhone}` : ""}
                  </dd>
                </div>
              ) : null}
              {job.scope ? (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Scope
                  </dt>
                  <dd className="whitespace-pre-wrap">{job.scope}</dd>
                </div>
              ) : null}
            </dl>
            {onAddUpdate ? (
              <Button type="button" className="h-11 w-full" onClick={onAddUpdate}>
                Add work update
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </ResponsiveDrawer>
  );
}
