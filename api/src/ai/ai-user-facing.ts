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
