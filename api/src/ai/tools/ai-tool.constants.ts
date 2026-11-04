/**
 * Conservative MVP limits for AI tool execution.
 * Documented in docs/ai-tool-execution.md.
 */

/** Max UTF-8 byte length of JSON-serialized tool arguments. */
export const AI_TOOL_MAX_ARGUMENTS_BYTES = 16 * 1024; // 16 KiB

/** Max UTF-8 byte length of JSON-serialized successful tool results. */
export const AI_TOOL_MAX_RESULT_BYTES = 64 * 1024; // 64 KiB

/** Max UTF-8 bytes persisted per tool-result message content (history bound). */
export const AI_TOOL_PERSISTED_RESULT_MAX_BYTES = 24 * 1024; // 24 KiB

/** Default per-tool wall-clock timeout (ms). */
export const AI_TOOL_DEFAULT_TIMEOUT_MS = 8_000;

/** Absolute ceiling for any per-tool timeout override (ms). */
export const AI_TOOL_MAX_TIMEOUT_MS = 15_000;

/** Max provider→tools→provider rounds within one user sendMessage / reservation. */
export const AI_TOOL_MAX_ROUNDS_PER_REQUEST = 6;

/** Max individual tool invocations within one user sendMessage / reservation. */
export const AI_TOOL_MAX_INVOCATIONS_PER_REQUEST = 12;

/** Max concurrent tool executions within a single round. */
export const AI_TOOL_MAX_CONCURRENT_PER_ROUND = 2;
