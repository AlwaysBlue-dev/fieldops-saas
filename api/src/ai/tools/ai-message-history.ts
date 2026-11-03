import { AiMessageRole } from '../../generated/prisma/client.js';
import type {
  AiChatMessageInput,
  AiJsonObject,
  AiToolCall,
} from '../providers/ai-provider.types.js';

/**
 * Minimal stored-row shape for provider-neutral history reconstruction.
 * Does not depend on Prisma client regeneration for field names beyond role/content.
 */
export type AiStoredChatMessageRow = {
  role: AiMessageRole;
  content: string;
  toolCalls?: unknown;
  toolCallId?: string | null;
  toolName?: string | null;
};

/** Usage statuses that must never be sent to providers as completed turns. */
const UNSUCCESSFUL_USAGE_STATUSES = new Set(['FAILED', 'INTERRUPTED']);

/**
 * Optional per-row sequence within a turn (metadata.historySequence).
 * Used when createdAt ties so assistant toolCalls precede TOOL results.
 */
export function extractHistorySequence(
  metadata: unknown,
): number | null {
  if (
    metadata === null ||
    metadata === undefined ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata)
  ) {
    return null;
  }
  const value = (metadata as Record<string, unknown>).historySequence;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Stable chronological compare for chat rows. Prefer createdAt, then
 * historySequence, then id — never rely on random UUID alone when times tie.
 */
export function compareChatMessageOrder(
  a: {
    id?: string | null;
    createdAt?: Date | string | number | null;
    metadata?: unknown;
  },
  b: {
    id?: string | null;
    createdAt?: Date | string | number | null;
    metadata?: unknown;
  },
): number {
  const ta = a.createdAt != null ? new Date(a.createdAt).getTime() : 0;
  const tb = b.createdAt != null ? new Date(b.createdAt).getTime() : 0;
  if (ta !== tb) return ta - tb;
  const sa = extractHistorySequence(a.metadata) ?? 0;
  const sb = extractHistorySequence(b.metadata) ?? 0;
  if (sa !== sb) return sa - sb;
  const ia = a.id ?? '';
  const ib = b.id ?? '';
  return ia.localeCompare(ib);
}

/**
 * Read `usageEventId` from message metadata when present and well-formed.
 * Does not invent associations for legacy rows.
 */
export function extractUsageEventIdFromMetadata(
  metadata: unknown,
): string | null {
  if (
    metadata === null ||
    metadata === undefined ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata)
  ) {
    return null;
  }
  const value = (metadata as Record<string, unknown>).usageEventId;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Fail-closed eligibility for provider history.
 *
 * - Legacy rows with no `usageEventId` remain eligible (unless explicitly marked).
 * - Rows with `usageEventId` require a known SUCCEEDED, SKIPPED, or PENDING event.
 * - Missing usage events and FAILED / INTERRUPTED are excluded.
 * - SKIPPED (non-billable stub success) remains eligible for continuity.
 * - `excludeFromModelHistory` is an optimization only when there is no
 *   authoritative usageEventId to verify.
 * Never returns usage IDs or accounting metadata for provider payloads.
 */
export function shouldIncludeMessageInModelHistory(input: {
  metadata: unknown;
  usageStatusById: ReadonlyMap<string, string>;
}): boolean {
  const usageEventId = extractUsageEventIdFromMetadata(input.metadata);
  if (usageEventId) {
    const status = input.usageStatusById.get(usageEventId);
    if (status == null) return false;
    if (UNSUCCESSFUL_USAGE_STATUSES.has(status)) return false;
    return true;
  }

  if (
    input.metadata &&
    typeof input.metadata === 'object' &&
    !Array.isArray(input.metadata) &&
    (input.metadata as Record<string, unknown>).excludeFromModelHistory === true
  ) {
    return false;
  }

  return true;
}

/**
 * Collect distinct usageEventIds from message metadata for a batched status lookup.
 */
export function collectUsageEventIdsFromMessages(
  rows: ReadonlyArray<{ metadata?: unknown }>,
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = extractUsageEventIdFromMetadata(row.metadata);
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Parse persisted assistant `toolCalls` JSON into normalized `AiToolCall[]`.
 * Returns null when missing or malformed (treat as ordinary text assistant).
 */
export function parseStoredToolCalls(raw: unknown): AiToolCall[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const calls: AiToolCall[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id.trim()) return null;
    if (typeof row.name !== 'string' || !row.name.trim()) return null;
    if (
      row.arguments === null ||
      typeof row.arguments !== 'object' ||
      Array.isArray(row.arguments)
    ) {
      return null;
    }
    calls.push({
      id: row.id,
      name: row.name,
      arguments: row.arguments as AiJsonObject,
    });
  }
  return calls;
}

/**
 * Map persisted chat rows into `AiChatMessageInput` for provider adapters.
 *
 * Rules:
 * - USER / SYSTEM → text turns
 * - ASSISTANT without toolCalls → ordinary text
 * - ASSISTANT with toolCalls → emit only when every call id has a following TOOL row
 * - TOOL results emit in the assistant's toolCalls order
 * - Orphan TOOL rows are skipped
 * - Incomplete tool-call groups (mid-history or trailing) are skipped;
 *   later valid USER/ASSISTANT rows still map
 * - Legacy rows without tool metadata remain compatible
 */
export function mapStoredMessagesToProviderInput(
  rows: AiStoredChatMessageRow[],
  options?: {
    /** Called when an incomplete tool-call group is skipped (no message bodies). */
    onIncompleteToolGroup?: (info: {
      assistantIndex: number;
      expectedCalls: number;
      foundResults: number;
    }) => void;
  },
): AiChatMessageInput[] {
  const out: AiChatMessageInput[] = [];
  let i = 0;

  while (i < rows.length) {
    const row = rows[i]!;

    if (row.role === AiMessageRole.USER) {
      out.push({ role: 'user', content: row.content });
      i += 1;
      continue;
    }

    if (row.role === AiMessageRole.SYSTEM) {
      out.push({ role: 'system', content: row.content });
      i += 1;
      continue;
    }

    if (row.role === AiMessageRole.ASSISTANT) {
      const toolCalls = parseStoredToolCalls(row.toolCalls ?? null);
      if (!toolCalls) {
        out.push({ role: 'assistant', content: row.content });
        i += 1;
        continue;
      }

      const needed = new Set(toolCalls.map((c) => c.id));
      const results = new Map<string, AiStoredChatMessageRow>();
      let j = i + 1;
      while (j < rows.length && results.size < needed.size) {
        const next = rows[j]!;
        if (next.role !== AiMessageRole.TOOL) break;
        const callId = next.toolCallId?.trim() || '';
        if (!callId || !needed.has(callId)) break;
        if (!results.has(callId)) {
          results.set(callId, next);
        }
        j += 1;
      }

      if (results.size !== needed.size) {
        // Skip this incomplete group only — continue with later messages.
        options?.onIncompleteToolGroup?.({
          assistantIndex: i,
          expectedCalls: needed.size,
          foundResults: results.size,
        });
        i = j;
        continue;
      }

      out.push({
        role: 'assistant',
        content: row.content ?? '',
        toolCalls,
      });
      for (const call of toolCalls) {
        const toolRow = results.get(call.id)!;
        out.push({
          role: 'tool',
          content: toolRow.content,
          toolCallId: call.id,
          name: toolRow.toolName?.trim() || call.name,
        });
      }
      i = j;
      continue;
    }

    if (row.role === AiMessageRole.TOOL) {
      // Orphan tool result (no preceding complete assistant toolCalls group).
      i += 1;
      continue;
    }

    i += 1;
  }

  return out;
}

/** Serialize a tool execution outcome for model-facing tool-result content. */
export function serializeToolResultContent(input: {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  maxBytes: number;
}): string {
  const payload = input.ok
    ? { ok: true as const, data: input.data ?? null }
    : {
        ok: false as const,
        error: input.error ?? {
          code: 'EXECUTION_FAILED',
          message: 'Tool failed during execution.',
        },
      };

  let text: string;
  try {
    text = JSON.stringify(payload);
  } catch {
    text = JSON.stringify({
      ok: false,
      error: {
        code: 'EXECUTION_FAILED',
        message: 'Tool result could not be serialized.',
      },
    });
  }

  if (Buffer.byteLength(text, 'utf8') <= input.maxBytes) {
    return text;
  }

  const truncated = JSON.stringify({
    ok: false,
    error: {
      code: 'RESULT_TOO_LARGE',
      message:
        'Tool result exceeded the persistence size limit and was truncated for history.',
    },
    truncated: true,
  });
  return truncated;
}
