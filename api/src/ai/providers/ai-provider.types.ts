/** Provider-independent AI request/response types. No vendor SDKs. */

export type AiProviderId = 'groq' | 'gemini' | 'openrouter' | 'stub';

export type AiChatRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * JSON-compatible values only. Tool arguments must never be evaluated as code.
 * Adapters parse vendor JSON into this shape; invalid JSON is handled in adapters
 * (not in this contract layer).
 */
export type AiJsonPrimitive = string | number | boolean | null;
export type AiJsonValue =
  | AiJsonPrimitive
  | AiJsonValue[]
  | AiJsonObject;
/** Structured JSON object (string keys → nested `AiJsonValue`). */
export type AiJsonObject = { [key: string]: AiJsonValue };
/**
 * JSON Schema document rooted at an object (provider-independent).
 * Same structural shape as `AiJsonObject`; alias clarifies intent on tool defs.
 */
export type AiJsonSchemaObject = AiJsonObject;

/**
 * Normalized tool definition sent to providers via adapters.
 * Must not include provider-specific fields (e.g. OpenAI `type: "function"` wrappers).
 * Adapters map this into vendor payloads. NestJS alone executes tools — never the provider.
 */
export type AiToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema object describing tool parameters. */
  parameters: AiJsonSchemaObject;
};

/**
 * Normalized tool call requested by a model turn.
 * `arguments` must be a JSON object (not a bare array/primitive) after adapter parsing.
 * Execution is performed only by NestJS tool handlers after server-side validation.
 */
export type AiToolCall = {
  id: string;
  name: string;
  arguments: AiJsonObject;
};

/**
 * Tool selection hint for the provider.
 * - `auto` — model may call zero or more tools
 * - `none` — disable tool calls for this request
 * - `{ name }` — request a specific tool when the vendor supports forced choice
 */
export type AiToolChoice = 'auto' | 'none' | { name: string };

/** System or user text turn (no tool fields). */
export type AiSystemOrUserMessageInput = {
  role: 'system' | 'user';
  content: string;
  name?: string;
};

/** Assistant turn — may request tools via `toolCalls`. */
export type AiAssistantMessageInput = {
  role: 'assistant';
  content: string;
  name?: string;
  toolCalls?: AiToolCall[];
};

/**
 * Tool result turn — must reference the originating `AiToolCall.id`.
 * `content` is the serialized tool result text for the provider.
 */
export type AiToolResultMessageInput = {
  role: 'tool';
  content: string;
  toolCallId: string;
  name?: string;
};

/**
 * Conversation turn for provider adapters (discriminated by `role`).
 *
 * Compatibility:
 * - `{ role: 'user' | 'system', content }` — unchanged text-only messages
 * - `{ role: 'assistant', content }` — text-only assistant; optional `toolCalls`
 * - `{ role: 'tool', content, toolCallId }` — tool results require `toolCallId`
 *
 * Persisted Prisma chat rows are unchanged in this step; orchestration maps
 * stored messages into this shape when history is loaded (tool rows without a
 * stored call id should not be replayed as `role: 'tool'` until that exists).
 */
export type AiChatMessageInput =
  | AiSystemOrUserMessageInput
  | AiAssistantMessageInput
  | AiToolResultMessageInput;

export type AiGenerateTextRequest = {
  model?: string;
  messages: AiChatMessageInput[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Cancel local wait; abort does not prove the provider did not process the request. */
  signal?: AbortSignal;
  /** Per-request timeout override (ms). Providers apply their configured default when omitted. */
  timeoutMs?: number;
  /**
   * Stable key for vendors that honor Idempotency-Key (e.g. orgId:clientRequestId).
   * Does not imply exactly-once across providers.
   */
  idempotencyKey?: string;
  /**
   * Optional tool definitions for this generation.
   * Omitted or empty → text-only behavior (current adapters ignore until wired).
   * Definitions are untrusted capability descriptors; they do not grant DB access.
   */
  tools?: AiToolDefinition[];
  /**
   * Optional tool selection policy. Defaults to provider/adapter behavior when omitted
   * (typically equivalent to `auto` once tools are supported).
   */
  toolChoice?: AiToolChoice;
};

export type AiUsageMetadata = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  raw?: Record<string, unknown>;
};

/**
 * Known normalized finish reasons (closed set — not widened with `| string`).
 * Prefer `stop` for ordinary text completion and `tool_calls` when the model requests tools.
 * Unmapped vendor strings belong in `AiGenerateTextResult.rawFinishReason`.
 */
export type AiFinishReason =
  | 'stop'
  | 'tool_calls'
  | 'length'
  | 'content_filter';

export type AiGenerateTextResult = {
  provider: AiProviderId;
  model: string;
  /**
   * Assistant text for this generation.
   * May be empty when the model returns only tool calls (adapters that do not yet
   * support tools continue to return ordinary non-empty text as today).
   */
  content: string;
  usage: AiUsageMetadata;
  /** Normalized finish reason when it maps to `AiFinishReason`; otherwise null. */
  finishReason: AiFinishReason | null;
  /**
   * Original vendor finish-reason string when it differs from / cannot map to
   * `finishReason`. Omit or null when unused. Does not replace `finishReason` for
   * orchestration decisions that understand only the closed set.
   */
  rawFinishReason?: string | null;
  /**
   * Normalized tool calls for this generation, when the model requests them.
   * Omitted or empty for ordinary text completions.
   * Presence of tool calls does **not** mean tools were executed — NestJS must
   * validate arguments and run handlers under the existing AI usage reservation.
   */
  toolCalls?: AiToolCall[];
};

/**
 * Map a vendor finish-reason string into the closed `AiFinishReason` set.
 * Unknown values yield `finishReason: null` and preserve the raw string.
 */
export function normalizeAiFinishReason(
  raw: string | null | undefined,
): {
  finishReason: AiFinishReason | null;
  rawFinishReason: string | null;
} {
  if (raw == null) {
    return { finishReason: null, rawFinishReason: null };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { finishReason: null, rawFinishReason: null };
  }
  const key = trimmed.toLowerCase();
  const mapped: Record<string, AiFinishReason> = {
    stop: 'stop',
    end_turn: 'stop',
    stop_sequence: 'stop',
    tool_calls: 'tool_calls',
    function_call: 'tool_calls',
    length: 'length',
    max_tokens: 'length',
    content_filter: 'content_filter',
    safety: 'content_filter',
  };
  const finishReason = mapped[key] ?? null;
  if (finishReason) {
    return {
      finishReason,
      // Keep vendor spelling/casing when it differs from the normalized literal.
      rawFinishReason: trimmed === finishReason ? null : trimmed,
    };
  }
  return { finishReason: null, rawFinishReason: trimmed };
}

/**
 * Failure classes aligned with docs/ai-provider-failover.md and AiService.classifyChainError:
 * - DEFINITIVE_REJECTION: continue only when fallbackEligible is true (e.g. 429).
 * - PRE_TRANSMISSION_FAILURE: continue only when fallbackEligible is true.
 * - INVALID_CONFIGURATION: skip this provider and try the next configured one.
 * - INVALID_RESPONSE: always FAILED; never fallback (malformed/empty HTTP 200).
 * - AMBIGUOUS_OUTCOME: always INTERRUPTED; stop the chain (timeout / lost response).
 */
export type AiProviderFailureClass =
  | 'DEFINITIVE_REJECTION'
  | 'PRE_TRANSMISSION_FAILURE'
  | 'AMBIGUOUS_OUTCOME'
  | 'INVALID_CONFIGURATION'
  | 'INVALID_RESPONSE';

/**
 * How certain FieldKeel is that the provider began / rejected / completed work.
 * Used for failover decisions — never claim exactly-once across vendors.
 * `invalid_response` must not be treated as generic `ambiguous` in orchestration.
 */
export type AiTransmissionCertainty =
  | 'not_transmitted'
  | 'rejected'
  | 'ambiguous'
  | 'invalid_configuration'
  | 'invalid_response';

/** Legacy / coarse codes retained for logging and soft checks. */
export type AiProviderErrorCode =
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'AUTH'
  | 'INVALID_REQUEST'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  readonly provider: AiProviderId;
  readonly failureClass: AiProviderFailureClass;
  readonly transmissionCertainty: AiTransmissionCertainty;
  /**
   * True when the router may try the next provider under the same reservation.
   * Default: DEFINITIVE_REJECTION or PRE_TRANSMISSION_FAILURE.
   * INVALID_CONFIGURATION is also continued by orchestration (skip provider).
   * INVALID_RESPONSE and AMBIGUOUS_OUTCOME must never set this to enable fallback.
   */
  readonly fallbackEligible: boolean;
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(input: {
    code: AiProviderErrorCode;
    provider: AiProviderId;
    message: string;
    failureClass: AiProviderFailureClass;
    transmissionCertainty: AiTransmissionCertainty;
    fallbackEligible?: boolean;
    retryable?: boolean;
    status?: number | null;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = 'AiProviderError';
    this.code = input.code;
    this.provider = input.provider;
    this.failureClass = input.failureClass;
    this.transmissionCertainty = input.transmissionCertainty;
    this.fallbackEligible =
      input.fallbackEligible ??
      (input.failureClass === 'DEFINITIVE_REJECTION' ||
        input.failureClass === 'PRE_TRANSMISSION_FAILURE');
    this.retryable =
      input.retryable ??
      (input.code === 'RATE_LIMITED' ||
        input.failureClass === 'PRE_TRANSMISSION_FAILURE');
    this.status = input.status ?? null;
  }
}

export function isRateLimitError(error: unknown): boolean {
  return error instanceof AiProviderError && error.code === 'RATE_LIMITED';
}

export function isFallbackEligibleError(error: unknown): boolean {
  return error instanceof AiProviderError && error.fallbackEligible;
}
