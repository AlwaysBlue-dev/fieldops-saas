import { classifyChainError } from './ai-provider-chain.js';
import { AiProviderError } from './ai-provider.types.js';

describe('classifyChainError (initial provider chain)', () => {
  it('continues on Groq-style HTTP 429 (RATE_LIMITED, fallbackEligible)', () => {
    const error = new AiProviderError({
      code: 'RATE_LIMITED',
      provider: 'groq',
      message: 'rate limited',
      failureClass: 'DEFINITIVE_REJECTION',
      transmissionCertainty: 'rejected',
      fallbackEligible: true,
      status: 429,
    });
    const decision = classifyChainError(error);
    expect(decision.kind).toBe('continue');
    if (decision.kind === 'continue') {
      expect(decision.error.code).toBe('RATE_LIMITED');
      expect(decision.error.fallbackEligible).toBe(true);
    }
  });

  it('continues on INVALID_CONFIGURATION so the next provider can be tried', () => {
    const error = new AiProviderError({
      code: 'AUTH',
      provider: 'groq',
      message: 'bad key',
      failureClass: 'INVALID_CONFIGURATION',
      transmissionCertainty: 'invalid_configuration',
      fallbackEligible: true,
      status: 401,
    });
    expect(classifyChainError(error).kind).toBe('continue');
  });

  it('does not continue on ambiguous timeout', () => {
    const error = new AiProviderError({
      code: 'TIMEOUT',
      provider: 'groq',
      message: 'timeout',
      failureClass: 'AMBIGUOUS_OUTCOME',
      transmissionCertainty: 'ambiguous',
      fallbackEligible: false,
    });
    expect(classifyChainError(error).kind).toBe('ambiguous');
  });

  it('does not continue on HTTP 400 definitive rejection without fallbackEligible', () => {
    const error = new AiProviderError({
      code: 'INVALID_REQUEST',
      provider: 'groq',
      message: 'rejected',
      failureClass: 'DEFINITIVE_REJECTION',
      transmissionCertainty: 'rejected',
      fallbackEligible: false,
      status: 400,
    });
    expect(classifyChainError(error).kind).toBe('fail');
  });
});
