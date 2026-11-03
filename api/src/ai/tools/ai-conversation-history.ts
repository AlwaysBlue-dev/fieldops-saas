import { AiMessageRole } from '../../generated/prisma/client.js';
import { parseStoredToolCalls } from './ai-message-history.js';
import type { AiStoredChatMessageRow } from './ai-message-history.js';

/**
 * Conversation history windowing for provider requests (Step 4.4.2).
 * Prefers the most recent complete exchanges and never starts mid tool-call group.
 */

export type ConversationHistoryWindow = {
  /** Rows oldest → newest, safe to map with `mapStoredMessagesToProviderInput`. */
  rows: AiStoredChatMessageRow[];
  /** True when older messages exist beyond this window. */
  truncated: boolean;
};

/**
 * Take the newest `maxRows` messages (input must be oldest → newest), then
 * drop a leading incomplete tool-call fragment so the window never begins
 * with orphan TOOL rows or a partial assistant+tool group.
 */
export function windowRecentConversationRows(
  rowsOldestFirst: AiStoredChatMessageRow[],
  maxRows: number,
): ConversationHistoryWindow {
  if (maxRows < 1) {
    return { rows: [], truncated: rowsOldestFirst.length > 0 };
  }

  const truncated = rowsOldestFirst.length > maxRows;
  const slice = truncated
    ? rowsOldestFirst.slice(rowsOldestFirst.length - maxRows)
    : [...rowsOldestFirst];

  const aligned = dropLeadingIncompleteToolGroup(slice);
  return { rows: aligned, truncated };
}

/**
 * If the window starts inside a tool-call group (orphan TOOL, or assistant
 * toolCalls without a complete trailing TOOL set), advance until a safe start.
 */
export function dropLeadingIncompleteToolGroup(
  rows: AiStoredChatMessageRow[],
): AiStoredChatMessageRow[] {
  let start = 0;

  while (start < rows.length) {
    const row = rows[start]!;

    if (row.role === AiMessageRole.TOOL) {
      start += 1;
      continue;
    }

    if (row.role === AiMessageRole.ASSISTANT) {
      const toolCalls = parseStoredToolCalls(row.toolCalls ?? null);
      if (!toolCalls) {
        break;
      }

      const needed = new Set(toolCalls.map((c) => c.id));
      const found = new Set<string>();
      let j = start + 1;
      while (j < rows.length && found.size < needed.size) {
        const next = rows[j]!;
        if (next.role !== AiMessageRole.TOOL) break;
        const callId = next.toolCallId?.trim() || '';
        if (!callId || !needed.has(callId)) break;
        found.add(callId);
        j += 1;
      }

      if (found.size === needed.size) {
        break;
      }
      // Incomplete group at the window head — skip assistant and any partial tools.
      start = j;
      while (
        start < rows.length &&
        rows[start]!.role === AiMessageRole.TOOL
      ) {
        start += 1;
      }
      continue;
    }

    // USER / SYSTEM / other — safe start.
    break;
  }

  return start === 0 ? rows : rows.slice(start);
}
