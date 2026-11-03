import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_GROQ_MODEL,
  DEFAULT_GROQ_TIMEOUT_MS,
  GROQ_CHAT_COMPLETIONS_URL,
} from '../../common/constants.js';
import type { EnvironmentVariables } from '../../config/env.js';
import type { AiProvider } from './ai-provider.interface.js';
import {
  AiProviderError,
  normalizeAiFinishReason,
  type AiChatMessageInput,
  type AiGenerateTextRequest,
  type AiGenerateTextResult,
  type AiJsonObject,
  type AiToolCall,
  type AiToolChoice,
  type AiToolDefinition,
} from './ai-provider.types.js';

type GroqToolCall = {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type GroqChatCompletionResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    index?: number;
    finish_reason?: string | null;
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: GroqToolCall[] | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

type GroqRequestMessage = {
  role: string;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
};

/**
 * Groq OpenAI-compatible chat completions adapter (primary AI provider).
 * Uses fetch — no Groq SDK. API key never logged or returned.
 * Maps normalized FieldKeel tools ↔ OpenAI-style `tools` / `tool_calls`.
 * Does not execute tools — returns normalized `AiToolCall` for NestJS only.
 */
@Injectable()
export class GroqAiProvider implements AiProvider {
  readonly id = 'groq' as const;
  readonly displayName = 'Groq';
  private readonly logger = new Logger(GroqAiProvider.name);

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  isConfigured(): boolean {
    const key = this.config.get('GROQ_API_KEY', { infer: true });
    return typeof key === 'string' && key.trim().length > 0;
  }

  defaultModel(): string {
    return (
      this.config.get('GROQ_MODEL', { infer: true })?.trim() ||
      DEFAULT_GROQ_MODEL
    );
  }

  private timeoutMs(): number {
    return (
      this.config.get('GROQ_TIMEOUT_MS', { infer: true }) ??
      DEFAULT_GROQ_TIMEOUT_MS
    );
  }

  async generateText(
    request: AiGenerateTextRequest,
  ): Promise<AiGenerateTextResult> {
    const apiKey = this.config.get('GROQ_API_KEY', { infer: true })?.trim();
    if (!apiKey) {
      throw new AiProviderError({
        code: 'NOT_CONFIGURED',
        provider: 'groq',
        message:
          'GROQ_API_KEY is not configured. Set a backend-only Groq API key to enable AI Workforce.',
        failureClass: 'INVALID_CONFIGURATION',
        transmissionCertainty: 'invalid_configuration',
        // Router normally omits unconfigured Groq; if reached, allow skip to Gemini.
        fallbackEligible: true,
        retryable: false,
      });
    }

    const model = request.model?.trim() || this.defaultModel();
    if (!model) {
      throw new AiProviderError({
        code: 'NOT_CONFIGURED',
        provider: 'groq',
        message: 'GROQ_MODEL is empty. Set a Groq model id (e.g. a Qwen model).',
        failureClass: 'INVALID_CONFIGURATION',
        transmissionCertainty: 'invalid_configuration',
        fallbackEligible: true,
        retryable: false,
      });
    }

    if (!request.messages?.length) {
      throw new AiProviderError({
        code: 'INVALID_REQUEST',
        provider: 'groq',
        message: 'At least one chat message is required.',
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'not_transmitted',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const timeoutMs = request.timeoutMs ?? this.timeoutMs();
    const { signal, cleanup } = this.mergeSignals(request.signal, timeoutMs);

    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map((m) => this.toGroqMessage(m)),
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.maxOutputTokens !== undefined
        ? { max_tokens: request.maxOutputTokens }
        : {}),
    };

    const tools = request.tools?.length
      ? request.tools.map((t) => this.toGroqTool(t))
      : undefined;
    if (tools?.length) {
      body.tools = tools;
      const choice = this.toGroqToolChoice(request.toolChoice);
      if (choice !== undefined) {
        body.tool_choice = choice;
      }
    }

    let fetchStarted = false;
    try {
      fetchStarted = true;
      const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(request.idempotencyKey
            ? { 'Idempotency-Key': request.idempotencyKey }
            : {}),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw await this.mapHttpError(response);
      }

      let payload: GroqChatCompletionResponse;
      try {
        payload = (await response.json()) as GroqChatCompletionResponse;
      } catch (cause) {
        throw new AiProviderError({
          code: 'UNKNOWN',
          provider: 'groq',
          message: 'Groq returned a non-JSON success body.',
          failureClass: 'INVALID_RESPONSE',
          transmissionCertainty: 'invalid_response',
          fallbackEligible: false,
          retryable: false,
          status: response.status,
          cause,
        });
      }

      return this.normalizeSuccess(payload, model);
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw this.mapTransportError(error, fetchStarted);
    } finally {
      cleanup();
    }
  }

  private toGroqTool(tool: AiToolDefinition): {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: AiJsonObject;
    };
  } {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }

  private toGroqToolChoice(
    toolChoice: AiToolChoice | undefined,
  ):
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } }
    | undefined {
    if (toolChoice === undefined) {
      // OpenAI/Groq default when tools are present is effectively auto.
      return undefined;
    }
    if (toolChoice === 'auto' || toolChoice === 'none') {
      return toolChoice;
    }
    return {
      type: 'function',
      function: { name: toolChoice.name },
    };
  }

  private toGroqMessage(message: AiChatMessageInput): GroqRequestMessage {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: message.content,
        tool_call_id: message.toolCallId,
        ...(message.name ? { name: message.name } : {}),
      };
    }

    if (message.role === 'assistant') {
      const toolCalls = message.toolCalls?.length
        ? message.toolCalls.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments),
            },
          }))
        : undefined;

      return {
        role: 'assistant',
        content: message.content.length > 0 ? message.content : null,
        ...(message.name ? { name: message.name } : {}),
        ...(toolCalls ? { tool_calls: toolCalls } : {}),
      };
    }

    return {
      role: message.role,
      content: message.content,
      ...(message.name ? { name: message.name } : {}),
    };
  }

  private normalizeSuccess(
    payload: GroqChatCompletionResponse,
    requestedModel: string,
  ): AiGenerateTextResult {
    const choice = payload.choices?.[0];
    const message = choice?.message;
    if (!message || typeof message !== 'object') {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'groq',
        message: 'Groq response missing assistant message.',
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const rawToolCalls = message.tool_calls;
    let toolCalls: AiToolCall[] | undefined;
    if (rawToolCalls != null) {
      if (!Array.isArray(rawToolCalls)) {
        throw new AiProviderError({
          code: 'UNKNOWN',
          provider: 'groq',
          message: 'Groq response tool_calls must be an array.',
          failureClass: 'INVALID_RESPONSE',
          transmissionCertainty: 'invalid_response',
          fallbackEligible: false,
          retryable: false,
        });
      }
      if (rawToolCalls.length > 0) {
        toolCalls = rawToolCalls.map((call, index) =>
          this.normalizeToolCall(call, index),
        );
      }
    }

    const rawContent = message.content;
    const content =
      rawContent == null
        ? ''
        : typeof rawContent === 'string'
          ? rawContent
          : null;

    if (content === null) {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'groq',
        message: 'Groq response assistant content must be a string or null.',
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const hasToolCalls = Boolean(toolCalls?.length);
    if (!hasToolCalls && !content.trim()) {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'groq',
        message: 'Groq response missing assistant message content.',
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const inputTokens =
      typeof payload.usage?.prompt_tokens === 'number'
        ? payload.usage.prompt_tokens
        : null;
    const outputTokens =
      typeof payload.usage?.completion_tokens === 'number'
        ? payload.usage.completion_tokens
        : null;
    const totalTokens =
      typeof payload.usage?.total_tokens === 'number'
        ? payload.usage.total_tokens
        : inputTokens !== null && outputTokens !== null
          ? inputTokens + outputTokens
          : null;

    const finish = normalizeAiFinishReason(
      typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
    );

    return {
      provider: 'groq',
      model:
        typeof payload.model === 'string' && payload.model.trim()
          ? payload.model
          : requestedModel,
      content,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        raw:
          payload.usage && typeof payload.usage === 'object'
            ? { ...payload.usage }
            : undefined,
      },
      finishReason: finish.finishReason,
      rawFinishReason: finish.rawFinishReason,
      ...(hasToolCalls ? { toolCalls } : {}),
    };
  }

  private normalizeToolCall(call: GroqToolCall, index: number): AiToolCall {
    const id = typeof call.id === 'string' ? call.id.trim() : '';
    if (!id) {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'groq',
        message: `Groq tool_calls[${index}] missing id.`,
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
      });
    }

    if (call.type != null && call.type !== 'function') {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'groq',
        message: `Groq tool_calls[${index}] has unsupported type.`,
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const name =
      typeof call.function?.name === 'string' ? call.function.name.trim() : '';
    if (!name) {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'groq',
        message: `Groq tool_calls[${index}] missing function name.`,
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const argsRaw = call.function?.arguments;
    return {
      id,
      name,
      arguments: this.parseToolArguments(argsRaw, index),
    };
  }

  /**
   * Parse OpenAI-style function.arguments JSON string into AiJsonObject.
   * Malformed JSON or non-object roots → INVALID_RESPONSE. Never uses eval.
   */
  private parseToolArguments(
    raw: unknown,
    index: number,
  ): AiJsonObject {
    if (typeof raw !== 'string') {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'groq',
        message: `Groq tool_calls[${index}] arguments must be a JSON string.`,
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (cause) {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'groq',
        message: `Groq tool_calls[${index}] arguments are not valid JSON.`,
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
        cause,
      });
    }

    if (!this.isPlainJsonObject(parsed)) {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'groq',
        message: `Groq tool_calls[${index}] arguments must be a JSON object.`,
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
      });
    }

    return parsed;
  }

  private isPlainJsonObject(value: unknown): value is AiJsonObject {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    );
  }

  private async mapHttpError(response: Response): Promise<AiProviderError> {
    const status = response.status;
    let providerMessage: string | undefined;
    try {
      const errBody = (await response.json()) as GroqChatCompletionResponse;
      providerMessage = errBody.error?.message;
    } catch {
      // ignore body parse — do not log raw bodies (may contain user text)
    }

    this.logger.warn(`Groq HTTP ${status}`);

    if (status === 429) {
      return new AiProviderError({
        code: 'RATE_LIMITED',
        provider: 'groq',
        message: providerMessage?.trim() || 'Groq rate limit rejected the request.',
        failureClass: 'DEFINITIVE_REJECTION',
        transmissionCertainty: 'rejected',
        fallbackEligible: true,
        retryable: true,
        status,
      });
    }

    if (status === 401 || status === 403) {
      return new AiProviderError({
        code: 'AUTH',
        provider: 'groq',
        message:
          'Groq rejected the API credentials. Check GROQ_API_KEY (backend-only).',
        failureClass: 'INVALID_CONFIGURATION',
        transmissionCertainty: 'invalid_configuration',
        // Future router may skip this provider; do not treat as ambiguous success.
        fallbackEligible: true,
        retryable: false,
        status,
      });
    }

    if (status === 400 || status === 404 || status === 422) {
      return new AiProviderError({
        code: 'INVALID_REQUEST',
        provider: 'groq',
        message:
          providerMessage?.trim() ||
          `Groq rejected the request (HTTP ${status}).`,
        failureClass: 'DEFINITIVE_REJECTION',
        transmissionCertainty: 'rejected',
        fallbackEligible: false,
        retryable: false,
        status,
      });
    }

    // 5xx and other statuses: request may have been accepted — ambiguous.
    return new AiProviderError({
      code: 'UNAVAILABLE',
      provider: 'groq',
      message: `Groq returned HTTP ${status} with ambiguous execution certainty.`,
      failureClass: 'AMBIGUOUS_OUTCOME',
      transmissionCertainty: 'ambiguous',
      fallbackEligible: false,
      retryable: false,
      status,
    });
  }

  private mapTransportError(
    error: unknown,
    fetchStarted: boolean,
  ): AiProviderError {
    const name =
      error instanceof Error ? error.name : 'Error';
    const message =
      error instanceof Error ? error.message : String(error);
    const causeCode = this.extractCauseCode(error);

    if (name === 'AbortError' || name === 'TimeoutError') {
      // Abort after fetch() started cannot prove non-execution.
      return new AiProviderError({
        code: 'TIMEOUT',
        provider: 'groq',
        message:
          'Groq request timed out or was aborted after possible transmission. Outcome is ambiguous; automatic fallback is not allowed.',
        failureClass: 'AMBIGUOUS_OUTCOME',
        transmissionCertainty: 'ambiguous',
        fallbackEligible: false,
        retryable: false,
        cause: error,
      });
    }

    const preTransmitCodes = new Set([
      'ENOTFOUND',
      'EAI_AGAIN',
      'ECONNREFUSED',
      'EHOSTUNREACH',
      'ENETUNREACH',
    ]);

    if (
      causeCode &&
      preTransmitCodes.has(causeCode) &&
      // Conservative: only treat as pre-transmission when the failure looks like connect/DNS.
      fetchStarted
    ) {
      return new AiProviderError({
        code: 'UNAVAILABLE',
        provider: 'groq',
        message: `Groq connection failed before transmission (${causeCode}).`,
        failureClass: 'PRE_TRANSMISSION_FAILURE',
        transmissionCertainty: 'not_transmitted',
        fallbackEligible: true,
        retryable: true,
        cause: error,
      });
    }

    this.logger.warn(`Groq transport error: ${name}`);
    return new AiProviderError({
      code: 'UNKNOWN',
      provider: 'groq',
      message: message || 'Groq transport failure with ambiguous certainty.',
      failureClass: 'AMBIGUOUS_OUTCOME',
      transmissionCertainty: 'ambiguous',
      fallbackEligible: false,
      retryable: false,
      cause: error,
    });
  }

  private extractCauseCode(error: unknown): string | null {
    if (!error || typeof error !== 'object') return null;
    const withCause = error as { cause?: unknown };
    if (withCause.cause && typeof withCause.cause === 'object') {
      const code = (withCause.cause as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }

  private mergeSignals(
    external: AbortSignal | undefined,
    timeoutMs: number,
  ): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const timeoutErr = new Error(`Groq request exceeded ${timeoutMs}ms`);
      timeoutErr.name = 'TimeoutError';
      controller.abort(timeoutErr);
    }, timeoutMs);

    const onExternalAbort = () => {
      controller.abort(external?.reason);
    };
    if (external) {
      if (external.aborted) {
        controller.abort(external.reason);
      } else {
        external.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timer);
        external?.removeEventListener('abort', onExternalAbort);
      },
    };
  }
}
