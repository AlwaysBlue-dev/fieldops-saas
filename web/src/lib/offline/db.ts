/**
 * FieldKeel offline store (IndexedDB).
 * Scoped per user + organization. Not an authoritative source of truth.
 */

import type { OrganizationMembership, PublicUser } from "@/lib/auth";
import type { MyDayPayload } from "@/lib/my-day";

const DB_NAME = "fieldkeel-offline";
const DB_VERSION = 1;

export type OfflineJobSnapshot = {
  jobId: string;
  organizationId: string;
  userId: string;
  downloadedAt: string;
  lastSyncedAt: string | null;
  payload: unknown;
};

export type OfflineOpStatus =
  | "pending"
  | "syncing"
  | "failed"
  | "permanent"
  | "conflict";

export type OfflinePendingOp = {
  id: string;
  organizationId: string;
  userId: string;
  jobId: string | null;
  type:
    | "CLOCK_IN"
    | "CLOCK_OUT"
    | "WORK_LOG"
    | "MATERIAL"
    | "SAFETY"
    | "COMPLETION"
    | "PHOTO"
    | "SIGNATURE"
    | "SUBMIT";
  createdAt: string;
  status: OfflineOpStatus;
  attemptCount: number;
  lastError: string | null;
  nextRetryAt?: string | null;
  body: unknown;
  /** Local file blob key when type is PHOTO/SIGNATURE. */
  blobId?: string | null;
  /** Job updatedAt from snapshot when queued — used for conflict detection. */
  expectedJobUpdatedAt?: string | null;
};

export type OfflineBlob = {
  id: string;
  organizationId: string;
  userId: string;
  mimeType: string;
  fileName: string;
  createdAt: string;
  bytes: ArrayBuffer;
};

/** Minimal shell bootstrap so AppShell/My Day can reopen offline after prepare. */
export type OfflineShellContext = {
  key: string;
  userId: string;
  organizationId: string;
  orgSlug: string;
  timezone: string;
  role: OrganizationMembership["role"];
  user: PublicUser;
  membership: OrganizationMembership;
  savedAt: string;
};

export type OfflineMyDaySnapshot = {
  key: string;
  organizationId: string;
  userId: string;
  savedAt: string;
  payload: MyDayPayload;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("jobs")) {
        const store = db.createObjectStore("jobs", { keyPath: "jobId" });
        store.createIndex("byOrgUser", ["organizationId", "userId"], {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains("ops")) {
        const store = db.createObjectStore("ops", { keyPath: "id" });
        store.createIndex("byOrgUser", ["organizationId", "userId"], {
          unique: false,
        });
        store.createIndex("byStatus", "status", { unique: false });
      }
      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function putOfflineJob(snapshot: OfflineJobSnapshot) {
  const db = await openDb();
  const tx = db.transaction("jobs", "readwrite");
  tx.objectStore("jobs").put(snapshot);
  await txDone(tx);
}

export async function listOfflineJobs(
  organizationId: string,
  userId: string,
): Promise<OfflineJobSnapshot[]> {
  const db = await openDb();
  const tx = db.transaction("jobs", "readonly");
  const index = tx.objectStore("jobs").index("byOrgUser");
  const request = index.getAll([organizationId, userId]);
  const rows = await new Promise<OfflineJobSnapshot[]>((resolve, reject) => {
    request.onsuccess = () =>
      resolve((request.result as OfflineJobSnapshot[]) ?? []);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  return rows;
}

export async function getOfflineJob(
  jobId: string,
): Promise<OfflineJobSnapshot | null> {
  const db = await openDb();
  const tx = db.transaction("jobs", "readonly");
  const request = tx.objectStore("jobs").get(jobId);
  const row = await new Promise<OfflineJobSnapshot | null>((resolve, reject) => {
    request.onsuccess = () =>
      resolve((request.result as OfflineJobSnapshot) ?? null);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  return row;
}

export async function enqueueOp(op: OfflinePendingOp) {
  const db = await openDb();
  const tx = db.transaction("ops", "readwrite");
  tx.objectStore("ops").put(op);
  await txDone(tx);
}

export async function listPendingOps(
  organizationId: string,
  userId: string,
): Promise<OfflinePendingOp[]> {
  const db = await openDb();
  const tx = db.transaction("ops", "readonly");
  const index = tx.objectStore("ops").index("byOrgUser");
  const request = index.getAll([organizationId, userId]);
  const rows = await new Promise<OfflinePendingOp[]>((resolve, reject) => {
    request.onsuccess = () =>
      resolve((request.result as OfflinePendingOp[]) ?? []);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateOp(op: OfflinePendingOp) {
  const db = await openDb();
  const tx = db.transaction("ops", "readwrite");
  tx.objectStore("ops").put(op);
  await txDone(tx);
}

export async function deleteOp(id: string) {
  const db = await openDb();
  const tx = db.transaction("ops", "readwrite");
  tx.objectStore("ops").delete(id);
  await txDone(tx);
}

export async function putBlob(blob: OfflineBlob) {
  const db = await openDb();
  const tx = db.transaction("blobs", "readwrite");
  tx.objectStore("blobs").put(blob);
  await txDone(tx);
}

export async function getBlob(id: string): Promise<OfflineBlob | null> {
  const db = await openDb();
  const tx = db.transaction("blobs", "readonly");
  const request = tx.objectStore("blobs").get(id);
  const row = await new Promise<OfflineBlob | null>((resolve, reject) => {
    request.onsuccess = () => resolve((request.result as OfflineBlob) ?? null);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  return row;
}

export async function deleteBlob(id: string) {
  const db = await openDb();
  const tx = db.transaction("blobs", "readwrite");
  tx.objectStore("blobs").delete(id);
  await txDone(tx);
}

function shellKey(orgSlug: string) {
  return `shell:${orgSlug}`;
}

function myDayKey(organizationId: string, userId: string) {
  return `myday:${organizationId}:${userId}`;
}

export async function putOfflineShellContext(context: OfflineShellContext) {
  const db = await openDb();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({ ...context, key: shellKey(context.orgSlug) });
  await txDone(tx);
}

export async function getOfflineShellContext(
  orgSlug: string,
): Promise<OfflineShellContext | null> {
  const db = await openDb();
  const tx = db.transaction("meta", "readonly");
  const request = tx.objectStore("meta").get(shellKey(orgSlug));
  const row = await new Promise<OfflineShellContext | null>((resolve, reject) => {
    request.onsuccess = () =>
      resolve((request.result as OfflineShellContext) ?? null);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  return row;
}

export async function putOfflineMyDay(snapshot: OfflineMyDaySnapshot) {
  const db = await openDb();
  const tx = db.transaction("meta", "readwrite");
  tx.objectStore("meta").put({
    ...snapshot,
    key: myDayKey(snapshot.organizationId, snapshot.userId),
  });
  await txDone(tx);
}

export async function getOfflineMyDay(
  organizationId: string,
  userId: string,
): Promise<OfflineMyDaySnapshot | null> {
  const db = await openDb();
  const tx = db.transaction("meta", "readonly");
  const request = tx.objectStore("meta").get(myDayKey(organizationId, userId));
  const row = await new Promise<OfflineMyDaySnapshot | null>((resolve, reject) => {
    request.onsuccess = () =>
      resolve((request.result as OfflineMyDaySnapshot) ?? null);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  return row;
}

/** Clear all offline data for a user (sign-out / account switch). */
export async function clearOfflineForUser(userId: string) {
  const db = await openDb();
  const jobTx = db.transaction("jobs", "readwrite");
  const jobs = jobTx.objectStore("jobs");
  const allJobsReq = jobs.getAll();
  const allJobs = await new Promise<OfflineJobSnapshot[]>((resolve, reject) => {
    allJobsReq.onsuccess = () =>
      resolve((allJobsReq.result as OfflineJobSnapshot[]) ?? []);
    allJobsReq.onerror = () => reject(allJobsReq.error);
  });
  for (const row of allJobs) {
    if (row.userId === userId) jobs.delete(row.jobId);
  }
  await txDone(jobTx);

  const opTx = db.transaction("ops", "readwrite");
  const ops = opTx.objectStore("ops");
  const allOpsReq = ops.getAll();
  const allOps = await new Promise<OfflinePendingOp[]>((resolve, reject) => {
    allOpsReq.onsuccess = () =>
      resolve((allOpsReq.result as OfflinePendingOp[]) ?? []);
    allOpsReq.onerror = () => reject(allOpsReq.error);
  });
  for (const row of allOps) {
    if (row.userId === userId) ops.delete(row.id);
  }
  await txDone(opTx);

  const blobTx = db.transaction("blobs", "readwrite");
  const blobs = blobTx.objectStore("blobs");
  const allBlobsReq = blobs.getAll();
  const allBlobs = await new Promise<OfflineBlob[]>((resolve, reject) => {
    allBlobsReq.onsuccess = () =>
      resolve((allBlobsReq.result as OfflineBlob[]) ?? []);
    allBlobsReq.onerror = () => reject(allBlobsReq.error);
  });
  for (const row of allBlobs) {
    if (row.userId === userId) blobs.delete(row.id);
  }
  await txDone(blobTx);

  const metaTx = db.transaction("meta", "readwrite");
  const meta = metaTx.objectStore("meta");
  const allMetaReq = meta.getAll();
  const allMeta = await new Promise<Array<{ key: string; userId?: string }>>(
    (resolve, reject) => {
      allMetaReq.onsuccess = () =>
        resolve((allMetaReq.result as Array<{ key: string; userId?: string }>) ?? []);
      allMetaReq.onerror = () => reject(allMetaReq.error);
    },
  );
  for (const row of allMeta) {
    if (row.userId === userId) meta.delete(row.key);
  }
  await txDone(metaTx);
}

/** Always a UUID — server DTOs validate clientOperationId / clientEventId as UUID. */
export function newOfflineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const nibble = (Math.random() * 16) | 0;
    const value = char === "x" ? nibble : (nibble & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function isLikelyOfflineNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (error instanceof Error && error.name === "TypeError") return true;
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status: number }).status === 0
  ) {
    return true;
  }
  return false;
}
