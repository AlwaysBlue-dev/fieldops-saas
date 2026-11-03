import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/env.js';
import type { AiProvider } from './ai-provider.interface.js';
import {
  AiProviderError,
  type AiGenerateTextRequest,
  type AiGenerateTextResult,
} from './ai-provider.types.js';

/**
 * Development-only placeholder. Never a production substitute for Groq.
 * Orchestration must finalize stub turns as non-billable (SKIPPED), not SUCCEEDED.
 */
@Injectable()
export class StubAiProvider implements AiProvider {
  readonly id = 'stub' as const;
  readonly displayName = 'Stub (development only)';

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  isConfigured(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) !== 'production';
  }

  defaultModel(): string {
    return 'stub-dev';
  }

  async generateText(
    request: AiGenerateTextRequest,
  ): Promise<AiGenerateTextResult> {
    const nodeEnv = this.config.get('NODE_ENV', { infer: true });
    if (nodeEnv === 'production') {
      throw new AiProviderError({
        code: 'NOT_CONFIGURED',
        provider: 'stub',
        message:
          'Stub AI provider is disabled in production. Configure GROQ_API_KEY, GEMINI_API_KEY, and/or OPENROUTER_API_KEY on the API.',
        failureClass: 'INVALID_CONFIGURATION',
        transmissionCertainty: 'invalid_configuration',
        fallbackEligible: false,
        retryable: false,
      });
    }

    // Text-only stub: ignore tools / toolChoice; never invent tool calls or execute tools.
    void request.tools;
    void request.toolChoice;

    const lastUser = [...request.messages]
      .reverse()
      .find((m) => m.role === 'user');
    const preview = lastUser?.content?.trim().slice(0, 120) ?? '';

    return {
      provider: 'stub',
      model: this.defaultModel(),
      content: [
        '[FieldKeel AI stub — development only, not a live model]',
        'Provider adapters are wired; this response did not call Groq.',
        preview ? `Last user message preview: ${preview}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      usage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        raw: { stub: true, nonBillable: true },
      },
      finishReason: 'stop',
    };
  }
}
