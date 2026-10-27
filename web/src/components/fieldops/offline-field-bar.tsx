"use client";

import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/auth";
import { resolveCurrentMembership } from "@/lib/current-org";
import {
  listOfflineJobs,
  type OfflineJobSnapshot,
  type OfflinePendingOp,
} from "@/lib/offline/db";
import { prepareAssignedJobsForOffline } from "@/lib/offline/prepare-jobs";
import {
  retryOfflineOp,
  startConnectivitySync,
  subscribeSync,
  syncNow,
  type SyncProgress,
} from "@/lib/offline/sync-engine";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function OfflineFieldBar({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const params = useParams<{ orgSlug: string }>();
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [progress, setProgress] = useState<SyncProgress>({
    pending: 0,
    failed: 0,
    conflict: 0,
    permanent: 0,
    lastResult: "idle",
    lastMessage: null,
    running: false,
    ops: [],
  });
  const [jobs, setJobs] = useState<OfflineJobSnapshot[]>([]);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    const refreshJobs = () => {
      void listOfflineJobs(organizationId, userId).then(setJobs);
    };
    refreshJobs();
    const unsub = subscribeSync(organizationId, userId, setProgress);
    const stop = startConnectivitySync(organizationId, userId);
    const onOnline = () => {
      setOnline(true);
      refreshJobs();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      unsub();
      stop();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [organizationId, userId]);

  const attentionOps = progress.ops.filter(
    (op) =>
      op.status === "failed" ||
      op.status === "conflict" ||
      op.status === "permanent",
  );

  const pendingLabel =
    progress.pending > 0
      ? `${progress.pending} waiting to sync`
      : progress.failed > 0
        ? `${progress.failed} retryable`
        : progress.conflict > 0
          ? `${progress.conflict} need resolution`
          : progress.permanent > 0
            ? `${progress.permanent} need review`
            : jobs.length > 0
              ? `${jobs.length} saved offline`
              : "No jobs prepared";

  return (
    <div
      className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
      role="status"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">
            {online
              ? progress.running
                ? "Uploading changes…"
                : "Online"
              : "You're offline"}
          </p>
          <p className="text-xs text-muted-foreground">
            {online
              ? progress.lastMessage ??
                "Prepare assigned jobs before you lose coverage."
              : "Your saved jobs are available, and new changes will sync when you're connected."}{" "}
            · {pendingLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 md:h-8"
            disabled={preparing || !online}
            onClick={async () => {
              setPreparing(true);
              try {
                const [me, membership] = await Promise.all([
                  getMe(),
                  resolveCurrentMembership(params.orgSlug),
                ]);
                if (!membership) {
                  throw new Error("Organization membership not found.");
                }
                const result = await prepareAssignedJobsForOffline(
                  organizationId,
                  userId,
                  { user: me.user, membership },
                );
                setJobs(result.jobs);
                toast.success(
                  result.downloaded > 0
                    ? `Prepared ${result.downloaded} job${result.downloaded === 1 ? "" : "s"} for offline use.`
                    : "No assigned jobs to prepare.",
                );
                if (result.failed > 0) {
                  toast.error(
                    `${result.failed} job${result.failed === 1 ? "" : "s"} could not be downloaded.`,
                  );
                }
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not prepare offline jobs.",
                );
              } finally {
                setPreparing(false);
              }
            }}
          >
            {preparing ? "Preparing…" : "Prepare for offline"}
          </Button>
          <Button
            type="button"
            className="h-11 md:h-8"
            disabled={!online || progress.running}
            onClick={() => void syncNow(organizationId, userId)}
          >
            Sync now
          </Button>
        </div>
      </div>
      {attentionOps.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {attentionOps.slice(0, 5).map((op) => (
            <li
              key={op.id}
              className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 text-xs">
                <p className="font-medium">{opLabel(op)}</p>
                <p className="text-muted-foreground">
                  {op.lastError ?? statusCopy(op.status)}
                </p>
              </div>
              {op.status !== "conflict" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 shrink-0 md:h-8"
                  disabled={!online || progress.running}
                  onClick={() =>
                    void retryOfflineOp(organizationId, userId, op.id)
                  }
                >
                  Retry
                </Button>
              ) : (
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Resolve on the job, then retry.
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function opLabel(op: OfflinePendingOp) {
  const type =
    op.type === "CLOCK_IN"
      ? "Clock-in"
      : op.type === "CLOCK_OUT"
        ? "Clock-out"
        : op.type === "WORK_LOG"
          ? "Work update"
          : op.type === "PHOTO"
            ? "Photo"
            : op.type === "SIGNATURE"
              ? "Signature"
              : op.type === "MATERIAL"
                ? "Material"
                : op.type;
  return op.jobId ? `${type} · job ${op.jobId.slice(0, 8)}…` : type;
}

function statusCopy(status: OfflinePendingOp["status"]) {
  if (status === "conflict") return "Needs conflict resolution";
  if (status === "permanent") return "Server rejected this change";
  if (status === "failed") return "Retryable sync failure";
  return status;
}
