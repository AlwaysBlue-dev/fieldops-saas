import { ApiError } from "@/lib/api";
import {
  addJobMaterial,
  addJobPhoto,
  addJobSignature,
  addWorkUpdate,
  clockIn,
  clockOut,
} from "@/lib/my-day";
import {
  confirmSafetyControl,
  getJobCard,
  submitJob,
  updateJobCompletion,
} from "@/lib/jobs";
import {
  deleteBlob,
  deleteOp,
  enqueueOp,
  getBlob,
  listPendingOps,
  newOfflineId,
  updateOp,
  type OfflinePendingOp,
} from "./db";

export type SyncProgress = {
  pending: number;
  failed: number;
  conflict: number;
  permanent: number;
  lastResult: "idle" | "ok" | "partial" | "error";
  lastMessage: string | null;
  running: boolean;
  ops: OfflinePendingOp[];
};

type Listener = (state: SyncProgress) => void;

const listeners = new Set<Listener>();
let running = false;
let lastResult: SyncProgress["lastResult"] = "idle";
let lastMessage: string | null = null;

const MAX_AUTO_RETRIES = 5;

function emit(organizationId: string, userId: string) {
  void listPendingOps(organizationId, userId).then((ops) => {
    const state: SyncProgress = {
      pending: ops.filter(
        (op) => op.status === "pending" || op.status === "syncing",
      ).length,
      failed: ops.filter((op) => op.status === "failed").length,
      conflict: ops.filter((op) => op.status === "conflict").length,
      permanent: ops.filter((op) => op.status === "permanent").length,
      lastResult,
      lastMessage,
      running,
      ops,
    };
    for (const listener of listeners) listener(state);
  });
}

export function subscribeSync(
  organizationId: string,
  userId: string,
  listener: Listener,
) {
  listeners.add(listener);
  emit(organizationId, userId);
  return () => listeners.delete(listener);
}

export async function queueOfflineOp(
  input: Omit<
    OfflinePendingOp,
    "id" | "status" | "attemptCount" | "lastError" | "createdAt"
  > & { id?: string },
) {
  const op: OfflinePendingOp = {
    id: input.id ?? newOfflineId(),
    organizationId: input.organizationId,
    userId: input.userId,
    jobId: input.jobId,
    type: input.type,
    createdAt: new Date().toISOString(),
    status: "pending",
    attemptCount: 0,
    lastError: null,
    nextRetryAt: null,
    body: input.body,
    blobId: input.blobId ?? null,
    expectedJobUpdatedAt: input.expectedJobUpdatedAt ?? null,
  };
  await enqueueOp(op);
  emit(input.organizationId, input.userId);
  return op;
}

function classifyFailure(
  error: unknown,
): "failed" | "permanent" | "conflict" {
  if (!(error instanceof ApiError)) {
    return "failed";
  }
  if (error.status === 0) return "failed";
  if (error.status === 409 || error.code === "SCHEDULE_CONFLICT") {
    return "conflict";
  }
  if (
    error.status === 400 ||
    error.status === 403 ||
    error.status === 404 ||
    error.status === 422
  ) {
    return "permanent";
  }
  if (error.status === 401) {
    // Keep queued work; user must reauthenticate before sync succeeds.
    return "failed";
  }
  if (error.status >= 500) return "failed";
  return "failed";
}

function backoffMs(attemptCount: number): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.min(attemptCount, 5));
  return base + Math.floor(Math.random() * 500);
}

async function assertJobNotStale(op: OfflinePendingOp) {
  if (!op.jobId || !op.expectedJobUpdatedAt) return;
  // Only gate mutations that rewrite job-level completion/status fields.
  if (
    op.type !== "COMPLETION" &&
    op.type !== "SUBMIT" &&
    op.type !== "SAFETY"
  ) {
    return;
  }
  try {
    const job = await getJobCard(op.organizationId, op.jobId);
    if (job.updatedAt && job.updatedAt !== op.expectedJobUpdatedAt) {
      throw new ApiError(
        409,
        `Job was updated on the server since this change was saved locally (${job.updatedAt}). Your local work is kept — review the job and resolve before syncing this item.`,
        "JOB_STALE",
      );
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) throw error;
    // Network / 404 handled by caller classification.
    throw error;
  }
}

async function runOne(
  op: OfflinePendingOp,
): Promise<"ok" | "failed" | "conflict" | "permanent"> {
  const body = (op.body ?? {}) as Record<string, unknown>;
  try {
    await assertJobNotStale(op);
    switch (op.type) {
      case "CLOCK_IN":
        await clockIn(op.organizationId, {
          jobId: typeof body.jobId === "string" ? body.jobId : undefined,
          clientOccurredAt:
            typeof body.clientOccurredAt === "string"
              ? body.clientOccurredAt
              : undefined,
          clientEventId: op.id,
          latitude: typeof body.latitude === "number" ? body.latitude : undefined,
          longitude:
            typeof body.longitude === "number" ? body.longitude : undefined,
          accuracyMeters:
            typeof body.accuracyMeters === "number"
              ? body.accuracyMeters
              : undefined,
        });
        break;
      case "CLOCK_OUT":
        await clockOut(op.organizationId, {
          jobId: typeof body.jobId === "string" ? body.jobId : undefined,
          clientOccurredAt:
            typeof body.clientOccurredAt === "string"
              ? body.clientOccurredAt
              : undefined,
          clientEventId: op.id,
          latitude: typeof body.latitude === "number" ? body.latitude : undefined,
          longitude:
            typeof body.longitude === "number" ? body.longitude : undefined,
          accuracyMeters:
            typeof body.accuracyMeters === "number"
              ? body.accuracyMeters
              : undefined,
        });
        break;
      case "WORK_LOG":
        if (!op.jobId) throw new Error("Missing job for work log.");
        await addWorkUpdate(
          op.organizationId,
          op.jobId,
          String(body.text ?? body.body ?? ""),
          op.id,
        );
        break;
      case "MATERIAL":
        if (!op.jobId) throw new Error("Missing job for material.");
        await addJobMaterial(op.organizationId, op.jobId, {
          name: String(body.name ?? body.itemName ?? ""),
          quantity: Number(body.quantity ?? 1),
          unit: String(body.unit ?? "ea"),
          notes: typeof body.notes === "string" ? body.notes : undefined,
          clientOperationId: op.id,
        });
        break;
      case "SAFETY":
        if (!op.jobId || typeof body.code !== "string") {
          throw new Error("Missing safety control.");
        }
        await confirmSafetyControl(
          op.organizationId,
          op.jobId,
          body.code,
          typeof body.note === "string" ? body.note : undefined,
        );
        break;
      case "COMPLETION":
        if (!op.jobId) throw new Error("Missing job for completion.");
        await updateJobCompletion(op.organizationId, op.jobId, {
          workPerformed: String(body.workPerformed ?? ""),
          completionNotes:
            typeof body.notes === "string"
              ? body.notes
              : typeof body.completionNotes === "string"
                ? body.completionNotes
                : undefined,
          outcome: body.outcome as never,
          outcomeReason:
            typeof body.outcomeReason === "string"
              ? body.outcomeReason
              : undefined,
        });
        break;
      case "PHOTO": {
        if (!op.jobId || !op.blobId) throw new Error("Missing photo blob.");
        const blob = await getBlob(op.blobId);
        if (!blob) throw new Error("Local photo is no longer available.");
        const base64 = arrayBufferToBase64(blob.bytes);
        await addJobPhoto(op.organizationId, op.jobId, {
          fileName: blob.fileName,
          mimeType: blob.mimeType,
          contentBase64: base64,
          clientOperationId: op.id,
        });
        // Only delete local evidence after the server acknowledged the photo.
        await deleteBlob(op.blobId);
        break;
      }
      case "SIGNATURE": {
        if (!op.jobId) throw new Error("Missing job for signature.");
        await addJobSignature(op.organizationId, op.jobId, {
          signerName: String(body.signerName ?? ""),
          signerTitle:
            typeof body.signerTitle === "string" ? body.signerTitle : undefined,
          imageBase64: String(body.imageBase64 ?? ""),
          clientOperationId: op.id,
        });
        break;
      }
      case "SUBMIT":
        if (!op.jobId) throw new Error("Missing job for submit.");
        await submitJob(op.organizationId, op.jobId);
        break;
      default:
        throw new Error(`Unsupported offline operation: ${op.type}`);
    }
    await deleteOp(op.id);
    return "ok";
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Sync failed.";
    const kind = classifyFailure(error);
    const attemptCount = op.attemptCount + 1;
    const nextRetryAt =
      kind === "failed" && attemptCount < MAX_AUTO_RETRIES
        ? new Date(Date.now() + backoffMs(attemptCount)).toISOString()
        : null;
    const status =
      kind === "failed" && attemptCount >= MAX_AUTO_RETRIES
        ? "permanent"
        : kind;
    await updateOp({
      ...op,
      status,
      attemptCount,
      lastError: message,
      nextRetryAt,
    });
    return status === "permanent" ? "permanent" : kind;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function shouldAutoRun(op: OfflinePendingOp, now: number): boolean {
  if (op.status === "pending") return true;
  if (op.status !== "failed") return false;
  if (!op.nextRetryAt) return true;
  return new Date(op.nextRetryAt).getTime() <= now;
}

export async function syncNow(
  organizationId: string,
  userId: string,
  options?: { includePermanent?: boolean; onlyOpId?: string },
) {
  if (running) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    lastResult = "error";
    lastMessage = "You're offline. Connect to sync pending changes.";
    emit(organizationId, userId);
    return;
  }
  running = true;
  emit(organizationId, userId);
  const now = Date.now();
  let ops = await listPendingOps(organizationId, userId);
  if (options?.onlyOpId) {
    ops = ops.filter((op) => op.id === options.onlyOpId);
  } else {
    ops = ops.filter((op) => {
      if (op.status === "conflict") return false;
      if (op.status === "permanent") return Boolean(options?.includePermanent);
      if (op.status === "syncing") {
        // Recover interrupted sync (app closed mid-flight).
        return true;
      }
      return shouldAutoRun(op, now);
    });
  }

  let ok = 0;
  let failed = 0;
  let conflict = 0;
  let permanent = 0;
  const blockedJobs = new Set<string>();

  for (const op of ops) {
    if (op.jobId && blockedJobs.has(op.jobId)) {
      // Preserve later ops for the same job until earlier conflict/permanent is resolved.
      continue;
    }
    await updateOp({ ...op, status: "syncing", lastError: op.lastError });
    const result = await runOne(op);
    if (result === "ok") ok += 1;
    else if (result === "conflict") {
      conflict += 1;
      if (op.jobId) blockedJobs.add(op.jobId);
    } else if (result === "permanent") {
      permanent += 1;
      if (op.jobId) blockedJobs.add(op.jobId);
    } else failed += 1;
  }
  running = false;
  if (failed === 0 && conflict === 0 && permanent === 0) {
    lastResult = "ok";
    lastMessage =
      ok === 0
        ? "Everything is already synchronized."
        : `Synced ${ok} change${ok === 1 ? "" : "s"}.`;
  } else if (ok > 0) {
    lastResult = "partial";
    lastMessage = `Synced ${ok}; ${failed + conflict + permanent} still need attention.`;
  } else {
    lastResult = "error";
    lastMessage =
      conflict > 0
        ? "Sync paused on a conflict. Resolve it before remaining job changes can sync."
        : "Sync could not complete. Review pending changes.";
  }
  emit(organizationId, userId);
}

export async function retryOfflineOp(
  organizationId: string,
  userId: string,
  opId: string,
) {
  const ops = await listPendingOps(organizationId, userId);
  const op = ops.find((row) => row.id === opId);
  if (!op) return;
  await updateOp({
    ...op,
    status: "pending",
    nextRetryAt: null,
    lastError: op.lastError,
  });
  await syncNow(organizationId, userId, {
    onlyOpId: opId,
    includePermanent: true,
  });
}

let connectivityKey: string | null = null;
let connectivityStop: (() => void) | null = null;
let connectivityRefs = 0;

export function startConnectivitySync(organizationId: string, userId: string) {
  if (typeof window === "undefined") return () => undefined;
  const key = `${organizationId}:${userId}`;
  // App shell + OfflineFieldBar may both mount; ref-count a single listener.
  if (connectivityKey === key && connectivityStop) {
    connectivityRefs += 1;
    return () => {
      connectivityRefs = Math.max(0, connectivityRefs - 1);
      if (connectivityRefs === 0) connectivityStop?.();
    };
  }
  connectivityStop?.();
  connectivityKey = key;
  connectivityRefs = 1;

  let syncTimer: number | null = null;
  let lastProbedOnline: boolean | null = null;

  const scheduleSync = () => {
    if (syncTimer != null) window.clearTimeout(syncTimer);
    // Brief delay so fetch settles after DevTools reconnect.
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      void (async () => {
        const { confirmOnline } = await import("./connectivity");
        const ok = await confirmOnline();
        lastProbedOnline = ok;
        if (!ok) return;
        void syncNow(organizationId, userId);
      })();
    }, 400);
  };

  const onOnline = () => scheduleSync();
  const onVisible = () => {
    if (document.visibilityState === "visible") scheduleSync();
  };
  const onFocus = () => scheduleSync();
  const onProbe = (event: Event) => {
    const online = Boolean(
      (event as CustomEvent<{ online?: boolean }>).detail?.online,
    );
    if (online) scheduleSync();
    else lastProbedOnline = false;
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("fieldops:connectivity", onProbe);

  // Pending ops while stuck on a job page: navigator may never flip if it
  // already reported "online" — retry on an interval after a real probe.
  const poll = window.setInterval(() => {
    void (async () => {
      const ops = await listPendingOps(organizationId, userId);
      const needs =
        ops.some(
          (op) =>
            op.status === "pending" ||
            op.status === "syncing" ||
            op.status === "failed",
        );
      if (!needs) return;
      const { probeOnline } = await import("./connectivity");
      if (!(await probeOnline())) return;
      lastProbedOnline = true;
      void syncNow(organizationId, userId);
    })();
  }, 8000);

  scheduleSync();
  connectivityStop = () => {
    if (syncTimer != null) window.clearTimeout(syncTimer);
    window.clearInterval(poll);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("fieldops:connectivity", onProbe);
    if (connectivityKey === key) {
      connectivityKey = null;
      connectivityStop = null;
      connectivityRefs = 0;
    }
  };
  return () => {
    connectivityRefs = Math.max(0, connectivityRefs - 1);
    if (connectivityRefs === 0) connectivityStop?.();
  };
}
