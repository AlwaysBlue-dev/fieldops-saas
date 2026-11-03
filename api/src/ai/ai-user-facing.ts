import {
  AiProviderError,
  type AiProviderFailureClass,
} from './providers/ai-provider.types.js';

/**
 * Safe, user-facing copy for AI Workforce (Step 4.4.4).
 * Never include API keys, tokens, stack traces, or raw provider payloads.
 */

export const AI_USER_MESSAGES = {
  DEFINITIVE_REJECTION:
    'The AI provider rejected this request. Please try again with a new message.',
  RATE_LIMITED:
    'The AI provider is temporarily rate-limited. Please wait a moment, then try again with a new message.',
  PRE_TRANSMISSION_FAILURE:
    'The AI provider could not be reached before the request was sent. Please try again with a new message.',
  AMBIGUOUS_OUTCOME:
    'The AI request timed out or returned an uncertain result after it may have been sent. Do not assume it completed. Check the conversation, then try again with a new message.',
  INVALID_CONFIGURATION:
    'AI is not correctly configured for this environment. Please contact an administrator.',
  INVALID_RESPONSE:
    'The AI provider returned an unusable response. Please try again with a new message.',
  UNEXPECTED:
    'The AI request failed unexpectedly. Please try again with a new message.',
  PROVIDER_AUTH:
    'AI provider authentication failed. Please contact an administrator.',
  NO_PROVIDERS_CONFIGURED:
    'AI is temporarily unavailable. Please try again later or contact an administrator.',
  CLIENT_REQUEST_FINISHED:
    'This request already finished. Send a new message to try again (a new request id is required).',
  OWNERSHIP_IN_PROGRESS:
    'Execution ownership could not be confirmed; the request may still be running. Retry with the same request — a new AI task will not be started.',
  OWNERSHIP_LOST_GENERIC:
    'The AI request could not be confirmed as complete. Check the conversation before trying again with a new message.',
  /**
   * Post-tool rate limit: tools may already have run; final answer generation failed.
   * Do not imply another provider will automatically continue this request.
   */
  POST_TOOL_RATE_LIMITED:
    'Operational lookups for this request may have completed, but the final AI response could not be generated because the AI provider is temporarily rate-limited. This request only partially finished. Wait a moment, then send a new message.',
  /**
   * Post-tool: eligible provider failover exhausted after tools already ran.
   */
  POST_TOOL_FAILOVER_EXHAUSTED:
    'Operational lookups for this request may have completed, but the final AI response could not be generated after trying available AI providers. This request only partially finished. Wait a moment, then send a new message.',
  /**
   * Post-tool ambiguous timeout: do not claim total failure or encourage a duplicate parallel request.
   */
  POST_TOOL_AMBIGUOUS_OUTCOME:
    'Operational lookups for this request may have completed, but the final AI response outcome is uncertain after a timeout or interrupted provider call. Do not assume the answer finished. Check the conversation, wait if needed, then send a new message rather than assuming a duplicate retry of the same in-flight request.',
  /**
   * Post-tool definitive failure that is not rate-limit (auth/rejection) after tools ran.
   */
  POST_TOOL_FINAL_GENERATION_FAILED:
    'Operational lookups for this request may have completed, but the final AI response could not be generated. This request only partially finished. Check the conversation, then send a new message.',
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
