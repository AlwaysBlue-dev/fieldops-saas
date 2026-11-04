import {
  evaluatePostToolProviderFailure,
  formatPostToolProviderFailureLog,
  isPostToolFailoverEligible,
  POST_TOOL_FALLBACK_BLOCKED,
  POST_TOOL_FALLBACK_DECISION,
  POST_TOOL_FALLBACK_ELIGIBLE,
  POST_TOOL_FALLBACK_EXHAUSTED,
  resolvePostToolFailoverExhausted,
  resolvePostToolProviderFailure,
} from './ai-post-tool-failure.js';
import { AI_USER_MESSAGES } from './ai-user-facing.js';
import { classifyChainError } from './providers/ai-provider-chain.js';
import { AiProviderError } from './providers/ai-provider.types.js';

function rateLimited429(provider: 'groq' | 'gemini' | 'openrouter' = 'groq') {
  return new AiProviderError({
    code: 'RATE_LIMITED',
    provider,
    message: 'rate limit',
    failureClass: 'DEFINITIVE_REJECTION',
    transmissionCertainty: 'rejected',
    fallbackEligible: true,
    retryable: true,
    status: 429,
    retryAfterSeconds: 12,
  });
}

function ambiguousTimeout() {
  return new AiProviderError({
    code: 'TIMEOUT',
    provider: 'groq',
    message: 'timeout after fetch',
    failureClass: 'AMBIGUOUS_OUTCOME',
    transmissionCertainty: 'ambiguous',
    fallbackEligible: false,
  });
}

function invalidResponse() {
  return new AiProviderError({
    code: 'UNKNOWN',
    provider: 'groq',
    message: 'bad body',
    failureClass: 'INVALID_RESPONSE',
    transmissionCertainty: 'invalid_response',
    fallbackEligible: false,
  });
}

describe('post-tool provider failure (Step 4.9)', () => {
  it('formats structured post-tool 429 log without secrets or payloads', () => {
    const line = formatPostToolProviderFailureLog({
      provider: 'groq',
      model: 'qwen/qwen3.8-27b',
      toolRounds: 1,
      httpStatus: 429,
      failureClass: 'DEFINITIVE_REJECTION',
      code: 'RATE_LIMITED',
      fallbackDecision: POST_TOOL_FALLBACK_ELIGIBLE,
      otherProviderConfigured: true,
      retryAfterSeconds: 12,
    });
    expect(line).toContain('phase=post_tool');
    expect(line).toContain('provider=groq');
    expect(line).toContain('model=qwen/qwen3.8-27b');
    expect(line).toContain('toolRounds=1');
    expect(line).toContain('status=429');
    expect(line).toContain('class=DEFINITIVE_REJECTION');
    expect(line).toContain('code=RATE_LIMITED');
    expect(line).toContain(`fallbackDecision=${POST_TOOL_FALLBACK_ELIGIBLE}`);
    expect(line).toContain('otherProviderConfigured=true');
    expect(line).toContain('retryAfterSeconds=12');
    expect(line.toLowerCase()).not.toContain('authorization');
    expect(line.toLowerCase()).not.toContain('api_key');
    expect(line).not.toContain('getJobs');
  });

  it('marks definitive post-tool 429 as failover-eligible (generation only)', () => {
    const chainDecision = classifyChainError(rateLimited429());
    expect(chainDecision.kind).toBe('continue');
    expect(isPostToolFailoverEligible(chainDecision)).toBe(true);
    const resolution = evaluatePostToolProviderFailure(chainDecision);
    expect(resolution.mayFailover).toBe(true);
    expect(resolution.fallbackDecision).toBe(POST_TOOL_FALLBACK_ELIGIBLE);
    expect(resolution.execution).toBe('FAILED');
    expect(resolution.userMessage).toBe(AI_USER_MESSAGES.POST_TOOL_RATE_LIMITED);
    expect(resolution).not.toHaveProperty('reexecuteTools');
    expect(resolution).not.toHaveProperty('toolCalls');
  });

  it('never allows failover on ambiguous timeout after tools', () => {
    const chainDecision = classifyChainError(ambiguousTimeout());
    expect(chainDecision.kind).toBe('ambiguous');
    expect(isPostToolFailoverEligible(chainDecision)).toBe(false);
    const resolution = evaluatePostToolProviderFailure(chainDecision);
    expect(resolution.mayFailover).toBe(false);
    expect(resolution.fallbackDecision).toBe(POST_TOOL_FALLBACK_BLOCKED);
    expect(resolution.execution).toBe('INTERRUPTED');
    expect(resolution.userMessage).toBe(
      AI_USER_MESSAGES.POST_TOOL_AMBIGUOUS_OUTCOME,
    );
  });

  it('never allows failover on INVALID_RESPONSE after tools', () => {
    const chainDecision = classifyChainError(invalidResponse());
    expect(chainDecision.kind).toBe('fail');
    expect(isPostToolFailoverEligible(chainDecision)).toBe(false);
    const resolution = evaluatePostToolProviderFailure(chainDecision);
    expect(resolution.mayFailover).toBe(false);
    expect(resolution.fallbackDecision).toBe(POST_TOOL_FALLBACK_BLOCKED);
  });

  it('legacy resolvePostToolProviderFailure still terminalizes continue decisions', () => {
    const continueDecision = classifyChainError(rateLimited429());
    const resolution = resolvePostToolProviderFailure(continueDecision);
    expect(resolution.fallbackDecision).toBe(POST_TOOL_FALLBACK_DECISION);
    expect(resolution.mayFailover).toBe(false);
  });

  it('exhausted post-tool failover uses partial-completion copy', () => {
    const resolution = resolvePostToolFailoverExhausted(rateLimited429('gemini'));
    expect(resolution.fallbackDecision).toBe(POST_TOOL_FALLBACK_EXHAUSTED);
    expect(resolution.mayFailover).toBe(false);
    expect(resolution.userMessage).toBe(
      AI_USER_MESSAGES.POST_TOOL_FAILOVER_EXHAUSTED,
    );
    expect(resolution.userMessage).toMatch(/partially completed/i);
    expect(resolution.userMessage.toLowerCase()).not.toContain(
      'completely failed',
    );
  });

  it('keeps initial-chain 429 classify as continue (failover intact)', () => {
    expect(classifyChainError(rateLimited429()).kind).toBe('continue');
  });

  it('does not schedule duplicate tool execution on post-tool failure', () => {
    const resolution = evaluatePostToolProviderFailure(
      classifyChainError(rateLimited429()),
    );
    expect(resolution).not.toHaveProperty('toolCalls');
    expect(resolution).not.toHaveProperty('executeTools');
  });
});
