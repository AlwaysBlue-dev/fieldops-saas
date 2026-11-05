import { apiRequest, ApiError } from "./api";

/** Matches backend listSessions take: 50 */
export const AI_SESSION_LIST_LIMIT = 50;
/** Matches backend getSession messages take: 200 */
export const AI_SESSION_MESSAGE_LIMIT = 200;

/** Session row from GET/POST …/ai/sessions */
export type AiSessionSummary = {
  id: string;
  title: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

/** Full session from GET …/ai/sessions/:id (includes org/user fields from Prisma). */
export type AiSessionDetail = AiSessionSummary & {
  organizationId?: string;
  userId?: string;
  messages: AiChatMessageRecord[];
  /** True when older visible messages exist beyond the newest window. */
  messagesTruncated?: boolean;
};

export type AiMessageRole = "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";

export type AiChatMessageRecord = {
  id: string;
  role: AiMessageRole;
  content: string;
  provider: string | null;
  model: string | null;
  createdAt: string;
};

export type AiUsageSummary = {
  enabled: boolean;
  used: number;
  limit: number;
  remaining: number;
  planCode: string;
  planName: string;
  /** ISO timestamp of the next UTC calendar-month reset for AI tasks. */
  periodResetsAt?: string;
};

export type AiExecutionStatus =
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "INTERRUPTED";

export type AiSendMessageResponse = {
  sessionId: string;
  execution: AiExecutionStatus;
  usageEvent: {
    id: string;
    clientRequestId: string | null;
    status: string;
  };
  providerStatus?: string;
  message?: string;
  failureClass?: string;
  fallbackEligible?: boolean;
  result?: {
    sessionId?: string;
    userMessageId?: string;
    assistantMessageId?: string;
    assistantContent?: string;
    provider?: string;
    model?: string;
    stub?: boolean;
  } | null;
  userMessage?: AiChatMessageRecord;
  assistantMessage?: AiChatMessageRecord;
};

/** Minimal pending-request recovery payload (sessionStorage only). */
export type AiPendingRequestRecord = {
  organizationId: string;
  sessionId: string;
  clientRequestId: string;
  content: string;
  createdAt: number;
};

const PENDING_STORAGE_PREFIX = "fieldops.ai.pending.";
/** Drop unrecovered pending records after 24h. */
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function aiBase(organizationId: string) {
  return `/organizations/${organizationId}/ai`;
}

/** Org + session scoped key (one pending slot per conversation). */
export function pendingAiStorageKey(
  organizationId: string,
  sessionId: string,
) {
  return `${PENDING_STORAGE_PREFIX}${organizationId}.${sessionId}`;
}

/** Pre–Step 4.5.2 key (one slot per org). Migrated on read. */
export function pendingAiLegacyStorageKey(organizationId: string) {
  return `${PENDING_STORAGE_PREFIX}${organizationId}`;
}

function parsePendingRecord(
  raw: string,
  organizationId: string,
  expectedSessionId?: string,
): AiPendingRequestRecord | null {
  let parsed: Partial<AiPendingRequestRecord>;
  try {
    parsed = JSON.parse(raw) as Partial<AiPendingRequestRecord>;
  } catch {
    return null;
  }
  if (
    typeof parsed.organizationId !== "string" ||
    typeof parsed.sessionId !== "string" ||
    typeof parsed.clientRequestId !== "string" ||
    typeof parsed.content !== "string" ||
    typeof parsed.createdAt !== "number" ||
    parsed.organizationId !== organizationId ||
    !parsed.sessionId ||
    !parsed.clientRequestId ||
    !parsed.content.trim()
  ) {
    return null;
  }
  if (expectedSessionId && parsed.sessionId !== expectedSessionId) {
    return null;
  }
  if (Date.now() - parsed.createdAt > PENDING_MAX_AGE_MS) {
    return null;
  }
  return {
    organizationId: parsed.organizationId,
    sessionId: parsed.sessionId,
    clientRequestId: parsed.clientRequestId,
    content: parsed.content,
    createdAt: parsed.createdAt,
  };
}

/** Collect matching keys first — never mutate sessionStorage during key(i) iteration. */
function listPendingStorageKeys(organizationId: string): string[] {
  if (typeof sessionStorage === "undefined") return [];
  const prefix = `${PENDING_STORAGE_PREFIX}${organizationId}.`;
  const keys: string[] = [];
  try {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
  } catch {
    return keys;
  }
  return keys;
}

function migrateLegacyPending(
  organizationId: string,
): AiPendingRequestRecord | null {
  if (typeof sessionStorage === "undefined") return null;
  const legacyKey = pendingAiLegacyStorageKey(organizationId);
  try {
    const raw = sessionStorage.getItem(legacyKey);
    if (!raw) return null;
    const record = parsePendingRecord(raw, organizationId);
    sessionStorage.removeItem(legacyKey);
    if (!record) return null;
    writePendingAiRequest(record);
    return record;
  } catch {
    try {
      sessionStorage.removeItem(legacyKey);
    } catch {
      // ignore
    }
    return null;
  }
}

export function readPendingAiRequest(
  organizationId: string,
  sessionId: string,
): AiPendingRequestRecord | null {
  if (typeof sessionStorage === "undefined") return null;
  const key = pendingAiStorageKey(organizationId, sessionId);
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const record = parsePendingRecord(raw, organizationId, sessionId);
      if (!record) {
        sessionStorage.removeItem(key);
        return null;
      }
      return record;
    }
    const legacy = migrateLegacyPending(organizationId);
    if (legacy && legacy.sessionId === sessionId) return legacy;
    return null;
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    return null;
  }
}

/**
 * Newest recoverable pending request for an organization across sessions.
 * Used on boot when the active session is not yet known.
 * Malformed keys are removed independently and cannot abort the scan.
 */
export function findNewestPendingAiRequest(
  organizationId: string,
): AiPendingRequestRecord | null {
  if (typeof sessionStorage === "undefined") return null;
  migrateLegacyPending(organizationId);

  const keys = listPendingStorageKeys(organizationId);
  let newest: AiPendingRequestRecord | null = null;
  const staleKeys: string[] = [];

  for (const key of keys) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) {
        staleKeys.push(key);
        continue;
      }
      const record = parsePendingRecord(raw, organizationId);
      if (!record) {
        staleKeys.push(key);
        continue;
      }
      if (!newest || record.createdAt > newest.createdAt) {
        newest = record;
      }
    } catch {
      staleKeys.push(key);
    }
  }

  for (const key of staleKeys) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  return newest;
}

export function writePendingAiRequest(record: AiPendingRequestRecord) {
  if (typeof sessionStorage === "undefined") return;
  try {
    // Drop legacy org-only slot so it cannot overwrite session-scoped recovery.
    sessionStorage.removeItem(pendingAiLegacyStorageKey(record.organizationId));
    sessionStorage.setItem(
      pendingAiStorageKey(record.organizationId, record.sessionId),
      JSON.stringify(record),
    );
  } catch {
    // Quota / private mode — recovery is best-effort.
  }
}

export function clearPendingAiRequest(
  organizationId: string,
  sessionId: string,
) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(
      pendingAiStorageKey(organizationId, sessionId),
    );
    // Also clear legacy key when it matches this session.
    const legacyKey = pendingAiLegacyStorageKey(organizationId);
    const raw = sessionStorage.getItem(legacyKey);
    if (raw) {
      const legacy = parsePendingRecord(raw, organizationId);
      if (!legacy || legacy.sessionId === sessionId) {
        sessionStorage.removeItem(legacyKey);
      }
    }
  } catch {
    // ignore
  }
}

export function listAiSessions(organizationId: string, signal?: AbortSignal) {
  return apiRequest<AiSessionSummary[]>(`${aiBase(organizationId)}/sessions`, {
    signal,
  });
}

export function createAiSession(
  organizationId: string,
  body?: { title?: string },
  signal?: AbortSignal,
) {
  return apiRequest<AiSessionSummary & { organizationId?: string; userId?: string }>(
    `${aiBase(organizationId)}/sessions`,
    {
      method: "POST",
      body: body?.title ? { title: body.title } : {},
      signal,
    },
  );
}

export function getAiSession(
  organizationId: string,
  sessionId: string,
  signal?: AbortSignal,
) {
  return apiRequest<AiSessionDetail>(
    `${aiBase(organizationId)}/sessions/${sessionId}`,
    { signal },
  );
}

export function renameAiSession(
  organizationId: string,
  sessionId: string,
  title: string,
  signal?: AbortSignal,
) {
  return apiRequest<AiSessionSummary>(
    `${aiBase(organizationId)}/sessions/${sessionId}`,
    {
      method: "PATCH",
      body: { title },
      signal,
    },
  );
}

export function deleteAiSession(
  organizationId: string,
  sessionId: string,
  signal?: AbortSignal,
) {
  return apiRequest<{ deleted: true; id: string }>(
    `${aiBase(organizationId)}/sessions/${sessionId}`,
    {
      method: "DELETE",
      signal,
    },
  );
}

export function sendAiMessage(
  organizationId: string,
  sessionId: string,
  body: { content: string; clientRequestId: string },
  signal?: AbortSignal,
) {
  return apiRequest<AiSendMessageResponse>(
    `${aiBase(organizationId)}/sessions/${sessionId}/messages`,
    {
      method: "POST",
      body,
      signal,
    },
  );
}

export function getAiUsage(organizationId: string, signal?: AbortSignal) {
  return apiRequest<AiUsageSummary>(`${aiBase(organizationId)}/usage`, {
    signal,
  });
}

export type AiProposalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "EXECUTED"
  | "FAILED";

export type AiProposalSummary = {
  id: string;
  actionType: string;
  status: AiProposalStatus;
  targetEntityType: string | null;
  targetEntityId: string | null;
  createdAt: string;
  expiresAt: string | null;
  decidedAt: string | null;
  decidedByUserId?: string | null;
  userId?: string;
  sessionId?: string | null;
  executedAt?: string | null;
  canDecide?: boolean;
  summary?: string;
};

export type AiProposalDetail = AiProposalSummary & {
  summary: string;
  payload: Record<string, unknown>;
  decisionComment: string | null;
  executionResult: unknown;
  updatedAt: string;
  expectedTargetUpdatedAt: string | null;
};

export function listAiProposals(
  organizationId: string,
  query: { scope?: "mine" | "review"; status?: AiProposalStatus } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (query.scope) params.set("scope", query.scope);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return apiRequest<{
    scope: "mine" | "review";
    items: AiProposalSummary[];
  }>(`${aiBase(organizationId)}/proposals${qs ? `?${qs}` : ""}`, { signal });
}

export function getAiProposal(
  organizationId: string,
  proposalId: string,
  signal?: AbortSignal,
) {
  return apiRequest<AiProposalDetail>(
    `${aiBase(organizationId)}/proposals/${proposalId}`,
    { signal },
  );
}

export function decideAiProposal(
  organizationId: string,
  proposalId: string,
  body: { decision: "APPROVE" | "REJECT"; comment?: string },
  signal?: AbortSignal,
) {
  return apiRequest<AiProposalDetail>(
    `${aiBase(organizationId)}/proposals/${proposalId}/decide`,
    { method: "POST", body, signal },
  );
}

export function newAiClientRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError(0, "Request was cancelled.", "Aborted"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new ApiError(0, "Request was cancelled.", "Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Send a message and reconcile IN_PROGRESS by re-POSTing the same
 * clientRequestId (idempotent; does not start a new AI task).
 * Aborting the signal only cancels frontend waiting — not backend execution.
 */
export async function sendAiMessageWithReconcile(
  organizationId: string,
  sessionId: string,
  body: { content: string; clientRequestId: string },
  options?: {
    /** Max reconcile polls after seeing IN_PROGRESS (default 30 ≈ 90s). */
    maxPolls?: number;
    pollIntervalMs?: number;
    signal?: AbortSignal;
  },
): Promise<AiSendMessageResponse> {
  const maxPolls = options?.maxPolls ?? 30;
  const pollIntervalMs = options?.pollIntervalMs ?? 3_000;
  let polls = 0;

  for (;;) {
    if (options?.signal?.aborted) {
      throw new ApiError(0, "Request was cancelled.", "Aborted");
    }

    // apiRequest refreshes once on a real 401 — do not rotate refresh tokens
    // proactively here (concurrent refresh reuse can revoke the whole session).
    const response = await sendAiMessage(
      organizationId,
      sessionId,
      body,
      options?.signal,
    );

    if (response.execution !== "IN_PROGRESS") {
      return response;
    }

    if (polls >= maxPolls) {
      return response;
    }
    polls += 1;
    await sleep(pollIntervalMs, options?.signal);
  }
}

export function isAiAbortError(error: unknown): boolean {
  return error instanceof ApiError && error.error === "Aborted";
}

/** Plan/quota block for AI tasks. Returns boolean only — do not use `error is ApiError` (false branch would narrow an ApiError to never). */
export function isAiPlanLimitError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "PLAN_LIMIT_REACHED" ||
      error.error === "PLAN_LIMIT_REACHED" ||
      error.limitType === "AI_TASKS")
  );
}

export function aiFriendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.error === "Aborted") {
      return "Waiting stopped on this screen, but the assistant may still be working. Use Retry if shown — that continues the same request and will not start a second AI task.";
    }
    if (error.status === 0 || error.error === "NetworkError") {
      return "We could not reach FieldKeel. Your request may still be running. Wait a moment, then use Retry if shown — that continues the same request.";
    }
    if (error.status === 401 || error.code === "SESSION_EXPIRED") {
      return "Your session has expired. Please sign in again.";
    }
    if (error.status === 429) {
      return "Too many attempts just now. Please wait a moment, then try again.";
    }
    if (isAiPlanLimitError(error)) {
      return (
        error.message?.trim() ||
        "You've used this month's AI task allowance. New questions are blocked until next month (UTC) or a plan change. You can still read past conversations."
      );
    }
    if (error.status === 403) {
      return (
        error.message?.trim() ||
        "AI Workforce is not available for your role or plan in this organization."
      );
    }
    if (error.status === 404) {
      return (
        error.message?.trim() ||
        "That conversation could not be found. Refresh the page or open another chat."
      );
    }
    if (error.status === 503) {
      return "AI Workforce is temporarily unavailable. Please try again later or contact your administrator.";
    }
    if (error.status >= 500) {
      return "AI Workforce is temporarily unavailable. Please try again in a few minutes.";
    }
    if (error.message?.trim()) return error.message.trim();
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "Something went wrong sending your message. Please try again.";
}

/**
 * Banner copy for typed send-message outcomes. Prefer API message when present.
 */
export function aiExecutionBannerText(
  response: Pick<AiSendMessageResponse, "execution" | "message">,
): string {
  const fromApi = response.message?.trim() || "";

  if (response.execution === "IN_PROGRESS") {
    return (
      fromApi ||
      "This request is still running. Use Retry if shown — that continues the same work and will not start a second AI task."
    );
  }

  if (response.execution === "FAILED") {
    return (
      fromApi ||
      "The assistant could not finish this answer. Check the conversation, then send a new message to try again."
    );
  }

  if (response.execution === "INTERRUPTED") {
    return (
      fromApi ||
      "The outcome is uncertain — do not assume an answer finished. Check the conversation, then send a new message if you still need help."
    );
  }

  return fromApi;
}

/** Whether a loaded transcript appears to include this user turn. */
export function transcriptHasUserContent(
  messages: { role: string; content: string }[],
  content: string,
): boolean {
  const needle = content.trim();
  if (!needle) return false;
  return messages.some(
    (m) =>
      (m.role === "user" || m.role === "USER") && m.content.trim() === needle,
  );
}
