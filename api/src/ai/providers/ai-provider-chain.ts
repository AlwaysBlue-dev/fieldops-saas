import { AiProviderError } from './ai-provider.types.js';

/**
 * Classify a provider error for the *initial* Groq → Gemini → OpenRouter chain.
 * Post-tool failures must not use `continue` — see `ai-post-tool-failure.ts`.
 */
export type AiChainErrorDecision =
  | { kind: 'continue'; error: AiProviderError }
  | { kind: 'ambiguous'; error: AiProviderError }
  | { kind: 'fail'; error: AiProviderError }
  | { kind: 'unexpected' };

export function classifyChainError(error: unknown): AiChainErrorDecision {
  if (!(error instanceof AiProviderError)) {
    return { kind: 'unexpected' };
  }

  if (
    error.failureClass === 'INVALID_RESPONSE' ||
    error.transmissionCertainty === 'invalid_response'
  ) {
    return { kind: 'fail', error };
  }

  if (
    error.failureClass === 'AMBIGUOUS_OUTCOME' ||
    error.transmissionCertainty === 'ambiguous'
  ) {
    return { kind: 'ambiguous', error };
  }

  if (
    error.failureClass === 'INVALID_CONFIGURATION' ||
    (error.fallbackEligible &&
      (error.failureClass === 'DEFINITIVE_REJECTION' ||
        error.failureClass === 'PRE_TRANSMISSION_FAILURE'))
  ) {
    return { kind: 'continue', error };
  }

  return { kind: 'fail', error };
}
