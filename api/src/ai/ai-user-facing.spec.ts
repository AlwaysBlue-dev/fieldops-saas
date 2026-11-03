import {
  AI_USER_MESSAGES,
  userFacingPostToolProviderError,
  userFacingProviderError,
} from './ai-user-facing.js';
import { AiProviderError } from './providers/ai-provider.types.js';

describe('userFacingProviderError vs userFacingPostToolProviderError', () => {
  it('uses generic rate-limit copy on the initial chain', () => {
    const error = new AiProviderError({
      code: 'RATE_LIMITED',
      provider: 'groq',
      message: '429',
      failureClass: 'DEFINITIVE_REJECTION',
      transmissionCertainty: 'rejected',
      fallbackEligible: true,
      status: 429,
    });
    expect(userFacingProviderError(error)).toBe(AI_USER_MESSAGES.RATE_LIMITED);
    expect(userFacingPostToolProviderError(error)).toBe(
      AI_USER_MESSAGES.POST_TOOL_RATE_LIMITED,
    );
    expect(userFacingPostToolProviderError(error)).not.toBe(
      userFacingProviderError(error),
    );
  });

  it('uses post-tool ambiguous copy for timeouts after tools', () => {
    const error = new AiProviderError({
      code: 'TIMEOUT',
      provider: 'gemini',
      message: 'aborted',
      failureClass: 'AMBIGUOUS_OUTCOME',
      transmissionCertainty: 'ambiguous',
      fallbackEligible: false,
    });
    expect(userFacingProviderError(error)).toBe(
      AI_USER_MESSAGES.AMBIGUOUS_OUTCOME,
    );
    expect(userFacingPostToolProviderError(error)).toBe(
      AI_USER_MESSAGES.POST_TOOL_AMBIGUOUS_OUTCOME,
    );
  });

  it('uses exhausted copy when post-tool failover candidates are spent', () => {
    const error = new AiProviderError({
      code: 'RATE_LIMITED',
      provider: 'openrouter',
      message: '429',
      failureClass: 'DEFINITIVE_REJECTION',
      transmissionCertainty: 'rejected',
      fallbackEligible: true,
      status: 429,
    });
    expect(
      userFacingPostToolProviderError(error, { failoverExhausted: true }),
    ).toBe(AI_USER_MESSAGES.POST_TOOL_FAILOVER_EXHAUSTED);
  });
});
