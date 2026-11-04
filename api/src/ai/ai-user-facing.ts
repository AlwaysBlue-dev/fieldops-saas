import {
  AiProviderError,
  type AiProviderFailureClass,
} from './providers/ai-provider.types.js';

/**
 * Safe, user-facing copy for AI Workforce.
 * Never include API keys, tokens, stack traces, or raw provider payloads.
 * Prefer: what happened + what to do next (plain language).
 */

export const AI_USER_MESSAGES = {
  DEFINITIVE_REJECTION:
    'The assistant could not process that question. Check the conversation, then try again with a clearer new message or a suggested prompt.',
  RATE_LIMITED:
    'The assistant is temporarily busy. Wait about a minute, then send your question again as a new message. Avoid tapping Send repeatedly.',
  PRE_TRANSMISSION_FAILURE:
    'We could not reach the assistant just now. Check your connection, wait a moment, then send a new message.',
  AMBIGUOUS_OUTCOME:
    'The assistant timed out and we cannot confirm whether an answer finished. Check this conversation first. If nothing useful appeared, wait briefly, then send a new message.',
  INVALID_CONFIGURATION:
    'AI Workforce is not set up correctly for this workspace. Please contact your administrator.',
  INVALID_RESPONSE:
    'The assistant returned an answer we could not use. Please send a new message to try again.',
  UNEXPECTED:
    'Something went wrong while getting an answer. Please wait a moment, then send a new message.',
  PROVIDER_AUTH:
    'The assistant could not authenticate with its AI service. Please contact your administrator.',
  NO_PROVIDERS_CONFIGURED:
    'AI Workforce is temporarily unavailable. Please try again later or contact your administrator.',
  CLIENT_REQUEST_FINISHED:
    'This request already finished. To ask again, send a new message in the conversation.',
  OWNERSHIP_IN_PROGRESS:
    'This request may still be running. Use Retry on the same request if shown — that continues the same work and will not start a second AI task.',
  OWNERSHIP_LOST_GENERIC:
    'We could not confirm that the assistant finished. Check the conversation before sending a new message.',
  /**
   * Post-tool rate limit: tools may already have run; final answer generation failed.
   */
  POST_TOOL_RATE_LIMITED:
    'We may have already looked up your jobs or schedule, but the final written answer did not finish because the assistant is temporarily busy. This only partially completed. Wait about a minute, then send a new message.',
  /**
   * Post-tool: eligible provider failover exhausted after tools already ran.
   */
  POST_TOOL_FAILOVER_EXHAUSTED:
    'We may have already looked up your jobs or schedule, but the final written answer still could not be generated. This only partially completed. Wait a moment, then send a new message.',
  /**
   * Post-tool ambiguous timeout.
   */
  POST_TOOL_AMBIGUOUS_OUTCOME:
    'We may have already looked up your jobs or schedule, but the final answer timed out and may be incomplete. Check the conversation, wait if needed, then send a new message — do not assume the previous answer finished.',
  /**
   * Post-tool definitive failure that is not rate-limit after tools ran.
   */
  POST_TOOL_FINAL_GENERATION_FAILED:
    'We may have already looked up your jobs or schedule, but the final written answer could not be generated. This only partially completed. Check the conversation, then send a new message.',
} as const;

const BY_FAILURE_CLASS: Record<
  AiProviderFailureClass | 'UNEXPECTED',
  string
> = {
  DEFINITIVE_REJECTION: AI_USER_MESSAGES.DEFINITIVE_REJECTION,
  PRE_TRANSMISSION_FAILURE: AI_USER_MESSAGES.PRE_TRANSMISSION_FAILURE,
  AMBIGUOUS_OUTCOME: AI_USER_MESSAGES.AMBIGUOUS_OUTCOME,
  INVALID_CONFIGURATION: AI_USER_MESSAGES.INVALID_CONFIGURATION,
  INVALID_RESPONSE: AI_USER_MESSAGES.INVALID_RESPONSE,
  UNEXPECTED: AI_USER_MESSAGES.UNEXPECTED,
};

/**
 * Map a provider error to a safe end-user message.
 * Prefer specific codes (rate limit, auth) over coarse failure-class copy.
 */
export function userFacingProviderError(error: AiProviderError): string {
  if (error.code === 'RATE_LIMITED') {
    return AI_USER_MESSAGES.RATE_LIMITED;
  }
  if (error.code === 'AUTH' || error.code === 'NOT_CONFIGURED') {
    return error.failureClass === 'INVALID_CONFIGURATION'
      ? AI_USER_MESSAGES.INVALID_CONFIGURATION
      : AI_USER_MESSAGES.PROVIDER_AUTH;
  }
  return BY_FAILURE_CLASS[error.failureClass] ?? AI_USER_MESSAGES.UNEXPECTED;
}

/**
 * User copy for failures after tools already ran.
 * Never claims the whole request failed when operational lookups may have completed.
 */
export function userFacingPostToolProviderError(
  error: AiProviderError,
  options?: { failoverExhausted?: boolean },
): string {
  if (options?.failoverExhausted) {
    return AI_USER_MESSAGES.POST_TOOL_FAILOVER_EXHAUSTED;
  }
  if (error.code === 'RATE_LIMITED') {
    return AI_USER_MESSAGES.POST_TOOL_RATE_LIMITED;
  }
  if (
    error.failureClass === 'AMBIGUOUS_OUTCOME' ||
    error.transmissionCertainty === 'ambiguous' ||
    error.code === 'TIMEOUT'
  ) {
    return AI_USER_MESSAGES.POST_TOOL_AMBIGUOUS_OUTCOME;
  }
  if (
    error.code === 'AUTH' ||
    error.code === 'NOT_CONFIGURED' ||
    error.failureClass === 'INVALID_CONFIGURATION'
  ) {
    return userFacingProviderError(error);
  }
  return AI_USER_MESSAGES.POST_TOOL_FINAL_GENERATION_FAILED;
}
