import type { AiJsonObject, AiToolCall } from '../providers/ai-provider.types.js';

/**
 * Provider-neutral tool-call / round persistence invariants (Step 4.3.7.2).
 * Used by AiService orchestration only — adapters still normalize vendor payloads.
 */

export type ToolRoundResultRow = {
  toolCallId: string;
  toolName: string;
  content: string;
  /** Orchestration round number that produced this result (1-based). */
  roundNumber: number;
};

export type ToolCallListValidationSuccess = {
  ok: true;
  calls: AiToolCall[];
};

export type ToolCallListValidationFailure = {
  ok: false;
  /** Internal reason code — never expose raw provider payloads. */
  code:
    | 'NOT_ARRAY'
    | 'EMPTY_ID'
    | 'DUPLICATE_ID'
    | 'EMPTY_NAME'
    | 'INVALID_ARGUMENTS'
    | 'INVALID_ENTRY';
  /** Safe, short message suitable for logs / reservation metadata. */
  message: string;
};

export type ToolCallListValidationResult =
  | ToolCallListValidationSuccess
  | ToolCallListValidationFailure;

export type ToolRoundPersistenceValidationSuccess = { ok: true };

export type ToolRoundPersistenceValidationFailure = {
  ok: false;
  code:
    | 'LENGTH_MISMATCH'
    | 'MISSING_RESULT'
    | 'DUPLICATE_RESULT'
    | 'UNKNOWN_RESULT'
    | 'ORDER_MISMATCH'
    | 'ROUND_MISMATCH'
    | 'EMPTY_RESULT_FIELDS';
  message: string;
};

export type ToolRoundPersistenceValidationResult =
  | ToolRoundPersistenceValidationSuccess
  | ToolRoundPersistenceValidationFailure;

function isPlainObject(value: unknown): value is AiJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate the complete tool-call list from a provider generation before any
 * handler runs. One invalid entry rejects the entire round (no partial execute).
 */
export function validateProviderToolCallList(
  raw: unknown,
): ToolCallListValidationResult {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      code: 'NOT_ARRAY',
      message: 'Tool call list is not an array.',
    };
  }

  const calls: AiToolCall[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (!isPlainObject(entry)) {
      return {
        ok: false,
        code: 'INVALID_ENTRY',
        message: `Tool call at index ${i} is not an object.`,
      };
    }

    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id) {
      return {
        ok: false,
        code: 'EMPTY_ID',
        message: `Tool call at index ${i} has an empty id.`,
      };
    }
    if (seenIds.has(id)) {
      return {
        ok: false,
        code: 'DUPLICATE_ID',
        message: `Duplicate tool call id in round (index ${i}).`,
      };
    }
    seenIds.add(id);

    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!name) {
      return {
        ok: false,
        code: 'EMPTY_NAME',
        message: `Tool call at index ${i} has an empty name.`,
      };
    }

    if (!isPlainObject(entry.arguments)) {
      return {
        ok: false,
        code: 'INVALID_ARGUMENTS',
        message: `Tool call at index ${i} arguments must be a plain JSON object.`,
      };
    }

    calls.push({
      id,
      name,
      arguments: entry.arguments,
    });
  }

  return { ok: true, calls };
}

/**
 * Validate executed (or synthetic) results before `appendToolRoundWhilePending`.
 * Ensures 1:1 id mapping, call order, and that every result belongs to this round.
 */
export function validateToolRoundForPersistence(input: {
  toolCalls: AiToolCall[];
  toolResults: ToolRoundResultRow[];
  roundNumber: number;
}): ToolRoundPersistenceValidationResult {
  const { toolCalls, toolResults, roundNumber } = input;

  if (toolResults.length !== toolCalls.length) {
    return {
      ok: false,
      code: 'LENGTH_MISMATCH',
      message: `Result count ${toolResults.length} does not match tool call count ${toolCalls.length}.`,
    };
  }

  const callIds = new Set(toolCalls.map((c) => c.id));
  const seenResultIds = new Set<string>();

  for (let i = 0; i < toolCalls.length; i++) {
    const call = toolCalls[i]!;
    const result = toolResults[i];
    if (!result) {
      return {
        ok: false,
        code: 'MISSING_RESULT',
        message: `Missing result at index ${i}.`,
      };
    }

    const resultId =
      typeof result.toolCallId === 'string' ? result.toolCallId.trim() : '';
    const resultName =
      typeof result.toolName === 'string' ? result.toolName.trim() : '';
    if (!resultId || !resultName || typeof result.content !== 'string') {
      return {
        ok: false,
        code: 'EMPTY_RESULT_FIELDS',
        message: `Result at index ${i} is missing required fields.`,
      };
    }

    if (result.roundNumber !== roundNumber) {
      return {
        ok: false,
        code: 'ROUND_MISMATCH',
        message: `Result at index ${i} does not belong to round ${roundNumber}.`,
      };
    }

    if (resultId !== call.id) {
      return {
        ok: false,
        code: 'ORDER_MISMATCH',
        message: `Result order does not match tool call order at index ${i}.`,
      };
    }

    if (!callIds.has(resultId)) {
      return {
        ok: false,
        code: 'UNKNOWN_RESULT',
        message: `Result id at index ${i} is not in the current round.`,
      };
    }

    if (seenResultIds.has(resultId)) {
      return {
        ok: false,
        code: 'DUPLICATE_RESULT',
        message: `Duplicate result id at index ${i}.`,
      };
    }
    seenResultIds.add(resultId);
  }

  if (seenResultIds.size !== callIds.size) {
    return {
      ok: false,
      code: 'MISSING_RESULT',
      message: 'Not every tool call id has exactly one result.',
    };
  }

  return { ok: true };
}
