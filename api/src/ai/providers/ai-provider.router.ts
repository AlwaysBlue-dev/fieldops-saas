import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.js';
import type { AiProvider } from './ai-provider.interface.js';
import type { AiProviderId } from './ai-provider.types.js';
import { GeminiAiProvider } from './gemini-ai.provider.js';
import { GroqAiProvider } from './groq-ai.provider.js';
import { OpenRouterAiProvider } from './openrouter-ai.provider.js';
import { StubAiProvider } from './stub-ai.provider.js';

export type AiProviderSkipReason = {
  id: AiProviderId;
  reason: 'not_configured' | 'disabled_in_production';
};

/**
 * Lightweight ordered provider router.
 * Does not create reservations, heartbeats, or quota accounting.
 * Order: Groq → Gemini → OpenRouter.
 */
@Injectable()
export class AiProviderRouter {
  private readonly logger = new Logger(AiProviderRouter.name);

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly groq: GroqAiProvider,
    private readonly gemini: GeminiAiProvider,
    private readonly openrouter: OpenRouterAiProvider,
    private readonly stub: StubAiProvider,
  ) {}

  /**
   * Providers that will be attempted for this process, in failover order.
   * Unconfigured adapters are omitted (skipped), not crashed at startup.
   */
  resolveExecutionChain(): AiProvider[] {
    const nodeEnv = this.config.get('NODE_ENV', { infer: true });
    const selected =
      this.config.get('AI_PROVIDER', { infer: true })?.trim() || 'groq';

    if (selected === 'stub') {
      if (nodeEnv === 'production') {
        this.logger.warn(
          'AI_PROVIDER=stub is not allowed in production; using live provider chain',
        );
      } else {
        return [this.stub];
      }
    }

    const chain: AiProvider[] = [];
    // Fixed commercial order — do not reorder based on AI_PROVIDER alone.
    if (this.groq.isConfigured()) {
      chain.push(this.groq);
    }
    if (this.gemini.isConfigured()) {
      chain.push(this.gemini);
    }
    if (this.openrouter.isConfigured()) {
      chain.push(this.openrouter);
    }
    return chain;
  }

  /** Live providers missing keys (for admin diagnostics). */
  listSkippedProviders(): AiProviderSkipReason[] {
    const skipped: AiProviderSkipReason[] = [];
    if (!this.groq.isConfigured()) {
      skipped.push({ id: 'groq', reason: 'not_configured' });
    }
    if (!this.gemini.isConfigured()) {
      skipped.push({ id: 'gemini', reason: 'not_configured' });
    }
    if (!this.openrouter.isConfigured()) {
      skipped.push({ id: 'openrouter', reason: 'not_configured' });
    }
    return skipped;
  }

  /** True when at least one non-stub live provider is configured. */
  hasLiveProvider(): boolean {
    return (
      this.groq.isConfigured() ||
      this.gemini.isConfigured() ||
      this.openrouter.isConfigured()
    );
  }

  /** Primary configured provider for reservation metadata (first in chain). */
  primaryProvider(): AiProvider | null {
    const chain = this.resolveExecutionChain();
    return chain[0] ?? null;
  }
}
