import type {
  AiGenerateTextRequest,
  AiGenerateTextResult,
  AiProviderId,
} from './ai-provider.types.js';

/**
 * Provider-independent generation contract.
 *
 * Adapters translate FieldKeel-normalized messages, optional tool definitions,
 * and results (`content`, optional `toolCalls`) to/from vendor APIs.
 * They must not leak API keys into results or DTOs, and must never execute tools
 * or access the database — NestJS owns tool execution under the AI usage lease.
 */
export interface AiProvider {
  readonly id: AiProviderId;
  readonly displayName: string;

  /** True when required env (API key, model) is present for this process. */
  isConfigured(): boolean;

  /** Default model id for this provider when the request omits one. */
  defaultModel(): string;

  /**
   * Generate a model turn. Requests without `tools` remain ordinary text generation.
   * When `tools` are present, adapters that do not yet implement tool calling may
   * ignore them and return text-only results until wired in a later step.
   */
  generateText(request: AiGenerateTextRequest): Promise<AiGenerateTextResult>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

/** Ordered provider chain (Groq → Gemini → …). Does not own reservations. */
export const AI_PROVIDER_ROUTER = Symbol('AI_PROVIDER_ROUTER');
