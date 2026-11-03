import {
  AI_USER_MESSAGES,
  userFacingPostToolProviderError,
} from './ai-user-facing.js';
import type { AiChainErrorDecision } from './providers/ai-provider-chain.js';
import type {
  AiProviderError,
  AiTransmissionCertainty,
} from './providers/ai-provider.types.js';

/** Post-tool: no safe alternate attempt (ambiguous / ineligible / policy block). */
export const POST_TOOL_FALLBACK_BLOCKED = 'blocked_after_tools' as const;
/** @deprecated Use POST_TOOL_FALLBACK_BLOCKED — retained for existing log greps. */
export const POST_TOOL_FALLBACK_DECISION = POST_TOOL_FALLBACK_BLOCKED;

/** Post-tool: definitive non-execution; alternate provider may continue generation only. */
export const POST_TOOL_FALLBACK_ELIGIBLE = 'post_tool_failover_eligible' as const;

/** Post-tool: eligible alternates were tried and none produced a final generation. */
export const POST_TOOL_FALLBACK_EXHAUSTED = 'post_tool_failover_exhausted' as const;

export type PostToolFallbackDecision =
  | typeof POST_TOOL_FALLBACK_BLOCKED
  | typeof POST_TOOL_FALLBACK_ELIGIBLE
  | typeof POST_TOOL_FALLBACK_EXHAUSTED;

const SAFE_POST_TOOL_CERTAINTY: ReadonlySet<AiTransmissionCertainty> = new Set([
  'rejected',
  'not_transmitted',
  'invalid_configuration',
]);

export type PostToolFailureLogInput = {
  provider: string;
  model: string;
  toolRounds: number;
  httpStatus: number | null | undefined;
  failureClass: string;
  code: string;
  fallbackDecision: PostToolFallbackDecision;
  /** True when the router has at least one other live provider besides the locked one. */
  otherProviderConfigured?: boolean;
  phase?: 'post_tool' | 'post_tool_failover';
  retryAfterSeconds?: number | null;
};

/**
 * Safe structured log line for post-tool provider failures (Step 4.9).
 * Never include keys, prompts, tool payloads, or execution tokens.
 */
export function formatPostToolProviderFailureLog(
  input: PostToolFailureLogInput,
): string {
  const status =
    typeof input.httpStatus === 'number' ? String(input.httpStatus) : 'n/a';
  const other =
    input.otherProviderConfigured === undefined
      ? ''
      : ` otherProviderConfigured=${input.otherProviderConfigured}`;
  const retry =
    typeof input.retryAfterSeconds === 'number'
      ? ` retryAfterSeconds=${input.retryAfterSeconds}`
      : '';
  const phase = input.phase ?? 'post_tool';
  return (
    `AI phase=${phase} provider=${input.provider} model=${input.model} ` +
    `toolRounds=${input.toolRounds} status=${status} ` +
    `class=${input.failureClass} code=${input.code} ` +
    `fallbackDecision=${input.fallbackDecision}${other}${retry}`
  );
}

export type PostToolFailureResolution = {
  fallbackDecision: PostToolFallbackDecision;
  execution: 'FAILED' | 'INTERRUPTED';
  userMessage: string;
  failureClass?: string;
  code?: string;
  httpStatus: number | null;
  providerError: AiProviderError | null;
  metadataReason: string;
  /** When true, orchestration may try later providers for generation only (no tools). */
  mayFailover: boolean;
};

/**
 * True when the original provider definitively did not execute the follow-up
 * generation and the error is marked fallback-eligible (e.g. HTTP 429 rejected).
 * Ambiguous timeouts / lost responses never qualify.
 */
export function isPostToolFailoverEligible(
  decision: AiChainErrorDecision,
): boolean {
  if (decision.kind !== 'continue') return false;
  const error = decision.error;
  if (!error.fallbackEligible) return false;
  return SAFE_POST_TOOL_CERTAINTY.has(error.transmissionCertainty);
}

/**
 * Classify a post-tool provider error into failover-eligible vs terminal.
 * Failover never re-executes tools; callers must only re-prompt later providers
 * with the reconstructed transcript under the same reservation.
 */
export function evaluatePostToolProviderFailure(
  decision: AiChainErrorDecision,
): PostToolFailureResolution {
  if (decision.kind === 'unexpected') {
    return {
      fallbackDecision: POST_TOOL_FALLBACK_BLOCKED,
      execution: 'INTERRUPTED',
      userMessage: AI_USER_MESSAGES.UNEXPECTED,
      httpStatus: null,
      providerError: null,
      metadataReason: 'unexpected_error_after_tools',
      mayFailover: false,
    };
  }

  if (decision.kind === 'ambiguous') {
    return {
      fallbackDecision: POST_TOOL_FALLBACK_BLOCKED,
      execution: 'INTERRUPTED',
      userMessage: userFacingPostToolProviderError(decision.error),
      failureClass: decision.error.failureClass,
      code: decision.error.code,
      httpStatus: decision.error.status,
      providerError: decision.error,
      metadataReason: 'ambiguous_after_tools',
      mayFailover: false,
    };
  }

  const error = decision.error;

  if (isPostToolFailoverEligible(decision)) {
    return {
      fallbackDecision: POST_TOOL_FALLBACK_ELIGIBLE,
      execution: 'FAILED',
      userMessage: userFacingPostToolProviderError(error),
      failureClass: error.failureClass,
      code: error.code,
      httpStatus: error.status,
      providerError: error,
      metadataReason: error.failureClass,
      mayFailover: true,
    };
  }

  // Ineligible continue/fail — block failover (e.g. INVALID_RESPONSE).
  return {
    fallbackDecision: POST_TOOL_FALLBACK_BLOCKED,
    execution: 'FAILED',
    userMessage: userFacingPostToolProviderError(error),
    failureClass: error.failureClass,
    code: error.code,
    httpStatus: error.status,
    providerError: error,
    metadataReason: error.failureClass,
    mayFailover: false,
  };
}

/**
 * Terminal resolution after post-tool failover candidates are exhausted.
 */
export function resolvePostToolFailoverExhausted(
  lastError: AiProviderError | null,
): PostToolFailureResolution {
  if (!lastError) {
    return {
      fallbackDecision: POST_TOOL_FALLBACK_EXHAUSTED,
      execution: 'FAILED',
      userMessage: AI_USER_MESSAGES.POST_TOOL_FAILOVER_EXHAUSTED,
      httpStatus: null,
      providerError: null,
      metadataReason: 'post_tool_failover_exhausted',
      mayFailover: false,
    };
  }
  return {
    fallbackDecision: POST_TOOL_FALLBACK_EXHAUSTED,
    execution: 'FAILED',
    userMessage: userFacingPostToolProviderError(lastError, {
      failoverExhausted: true,
    }),
    failureClass: lastError.failureClass,
    code: lastError.code,
    httpStatus: lastError.status,
    providerError: lastError,
    metadataReason: 'post_tool_failover_exhausted',
    mayFailover: false,
  };
}

/**
 * @deprecated Prefer evaluatePostToolProviderFailure — kept for call sites that
 * only need a terminal resolution (always blocked / no mayFailover path).
 */
export function resolvePostToolProviderFailure(
  decision: AiChainErrorDecision,
): PostToolFailureResolution {
  const evaluated = evaluatePostToolProviderFailure(decision);
  if (evaluated.mayFailover) {
    // Legacy helper always terminalized continue decisions.
    return {
      ...evaluated,
      fallbackDecision: POST_TOOL_FALLBACK_BLOCKED,
      mayFailover: false,
    };
  }
  return evaluated;
}
