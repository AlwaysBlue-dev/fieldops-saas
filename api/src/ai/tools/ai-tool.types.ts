import type { OrganizationRole } from '../../generated/prisma/client.js';
import type {
  AiJsonObject,
  AiJsonValue,
  AiToolDefinition,
} from '../providers/ai-provider.types.js';

/**
 * Explicit access classification. MVP allows only `read`.
 * Unknown values must be rejected by the executor.
 */
export type AiToolAccess = 'read';

/**
 * Trusted server-resolved context for tool handlers.
 * Built by NestJS from membership / session — never from model arguments.
 */
export type AiToolContext = {
  organizationId: string;
  userId: string;
  membershipId: string;
  role: OrganizationRole;
  organizationName: string;
  organizationSlug: string;
  /** Organization IANA timezone (e.g. for schedule “today”). */
  timezone: string;
  /** Optional AI chat session id when invoked from a conversation turn. */
  sessionId?: string;
  /** Optional AiUsageEvent id for the enclosing reservation. */
  usageEventId?: string;
};

/**
 * Cooperative execution controls for a single tool invocation.
 * Separate from trusted `AiToolContext` and from model-generated arguments.
 *
 * `signal` is aborted when the executor times out or the parent cancels.
 * Handlers should check `signal.aborted` / listen for `abort` and stop cooperative
 * work. Abort does **not** guarantee Prisma/DB query cancellation.
 */
export type AiToolExecutionOptions = {
  signal: AbortSignal;
};

/**
 * Handler invoked after registry resolution, access checks, and argument validation.
 * Receives model args separately from trusted organization/user context.
 */
export type AiToolHandler = (
  args: AiJsonObject,
  context: AiToolContext,
  execution: AiToolExecutionOptions,
) => Promise<AiJsonValue> | AiJsonValue;

/**
 * A tool approved for registration. Operational handlers are added in later steps.
 */
export type AiRegisteredTool = {
  definition: AiToolDefinition;
  access: AiToolAccess;
  enabled: boolean;
  handler: AiToolHandler;
  /** Optional override; clamped to AI_TOOL_MAX_TIMEOUT_MS. */
  timeoutMs?: number;
};

export type AiToolErrorCode =
  | 'UNKNOWN_TOOL'
  | 'DISABLED'
  | 'NOT_READ_ONLY'
  | 'INVALID_ARGUMENTS'
  | 'TIMEOUT'
  | 'RESULT_TOO_LARGE'
  | 'CANCELLED'
  | 'EXECUTION_FAILED';

export type AiToolError = {
  code: AiToolErrorCode;
  /** Safe, user/model-facing message — no stacks or secrets. */
  message: string;
};

export type AiToolExecutionSuccess = {
  ok: true;
  toolName: string;
  data: AiJsonValue;
  durationMs: number;
};

export type AiToolExecutionFailure = {
  ok: false;
  toolName: string;
  error: AiToolError;
  durationMs: number;
};

export type AiToolExecutionResult =
  | AiToolExecutionSuccess
  | AiToolExecutionFailure;

export type AiToolExecuteInput = {
  toolName: string;
  /** Untrusted model-produced arguments (must be a JSON object). */
  arguments: unknown;
  context: AiToolContext;
  /**
   * Optional parent cancellation (e.g. enclosing AI turn aborted).
   * Combined with the per-execution timeout AbortController.
   */
  signal?: AbortSignal;
};
