import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_TIMEOUT_MS,
  GEMINI_GENERATE_CONTENT_BASE_URL,
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

type GeminiFunctionCall = {
  name?: string;
  args?: unknown;
  /** Present on some API versions; optional. */
  id?: string;
};

type GeminiFunctionResponse = {
  name?: string;
  response?: AiJsonObject;
};

type GeminiPart = {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
};

type GeminiContent = {
  role?: 'user' | 'model' | string;
  parts?: GeminiPart[];
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?: string | null;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  modelVersion?: string;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

/**
 * Google Gemini generateContent adapter (first fallback after Groq).
 * Uses fetch — no Gemini SDK. API key never logged or returned.
 * Maps normalized FieldKeel tools ↔ Gemini `functionDeclarations` /
 * `functionCall` / `functionResponse`. Does not execute tools.
 */
@Injectable()
export class GeminiAiProvider implements AiProvider {
  readonly id = 'gemini' as const;
  readonly displayName = 'Google Gemini';
  private readonly logger = new Logger(GeminiAiProvider.name);

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  isConfigured(): boolean {
    const key = this.config.get('GEMINI_API_KEY', { infer: true });
    return typeof key === 'string' && key.trim().length > 0;
  }

  defaultModel(): string {
    return (
      this.config.get('GEMINI_MODEL', { infer: true })?.trim() ||
      DEFAULT_GEMINI_MODEL
    );
  }

  private timeoutMs(): number {
    return (
      this.config.get('GEMINI_TIMEOUT_MS', { infer: true }) ??
      DEFAULT_GEMINI_TIMEOUT_MS
    );
  }

  async generateText(
    request: AiGenerateTextRequest,
  ): Promise<AiGenerateTextResult> {
    const apiKey = this.config.get('GEMINI_API_KEY', { infer: true })?.trim();
    if (!apiKey) {
      throw new AiProviderError({
        code: 'NOT_CONFIGURED',
        provider: 'gemini',
        message:
          'GEMINI_API_KEY is not configured. Set a backend-only Gemini API key to enable this fallback.',
        failureClass: 'INVALID_CONFIGURATION',
        transmissionCertainty: 'invalid_configuration',
        fallbackEligible: true,
        retryable: false,
      });
    }

    const model = request.model?.trim() || this.defaultModel();
    if (!model) {
      throw new AiProviderError({
        code: 'NOT_CONFIGURED',
        provider: 'gemini',
        message: 'GEMINI_MODEL is empty. Set a Gemini model id.',
        failureClass: 'INVALID_CONFIGURATION',
        transmissionCertainty: 'invalid_configuration',
        fallbackEligible: true,
        retryable: false,
      });
    }

    if (!request.messages?.length) {
      throw new AiProviderError({
        code: 'INVALID_REQUEST',
        provider: 'gemini',
        message: 'At least one chat message is required.',
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'not_transmitted',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const { systemInstruction, contents } = this.toGeminiMessages(
      request.messages,
    );
    if (!contents.length) {
      throw new AiProviderError({
        code: 'INVALID_REQUEST',
        provider: 'gemini',
        message: 'No user/model turns available after message normalization.',
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'not_transmitted',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const timeoutMs = request.timeoutMs ?? this.timeoutMs();
    const { signal, cleanup } = this.mergeSignals(request.signal, timeoutMs);
    const url = `${GEMINI_GENERATE_CONTENT_BASE_URL}/${encodeURIComponent(model)}:generateContent`;

    const body: Record<string, unknown> = {
      contents,
      ...(systemInstruction
        ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
        : {}),
      ...(request.temperature !== undefined ||
      request.maxOutputTokens !== undefined
        ? {
            generationConfig: {
              ...(request.temperature !== undefined
                ? { temperature: request.temperature }
                : {}),
              ...(request.maxOutputTokens !== undefined
                ? { maxOutputTokens: request.maxOutputTokens }
                : {}),
            },
          }
        : {}),
    };

    if (request.tools?.length) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((t) =>
            this.toGeminiFunctionDeclaration(t),
          ),
        },
      ];
      const toolConfig = this.toGeminiToolConfig(request.toolChoice);
      if (toolConfig) {
        body.toolConfig = toolConfig;
      }
    }

    let fetchStarted = false;
    try {
      fetchStarted = true;
      const response = await fetch(url, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw await this.mapHttpError(response);
      }

      let payload: GeminiGenerateContentResponse;
      try {
        payload = (await response.json()) as GeminiGenerateContentResponse;
      } catch (cause) {
        throw new AiProviderError({
          code: 'UNKNOWN',
          provider: 'gemini',
          message: 'Gemini returned a non-JSON success body.',
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

  private toGeminiFunctionDeclaration(tool: AiToolDefinition): {
    name: string;
    description: string;
    parameters: AiJsonObject;
  } {
    return {
      name: tool.name,
      description: tool.description,
      // Gemini OpenAPI-subset Schema rejects JSON Schema keywords such as
      // additionalProperties. Backend validators still enforce them.
      parameters: sanitizeSchemaForGemini(tool.parameters),
    };
  }

  /**
   * Gemini toolConfig.functionCallingConfig:
   * - AUTO (default when tools present and choice omitted)
   * - NONE — disable function calling
   * - ANY + allowedFunctionNames — force a named tool
   */
  private toGeminiToolConfig(
    toolChoice: AiToolChoice | undefined,
  ): Record<string, unknown> | undefined {
    if (toolChoice === undefined || toolChoice === 'auto') {
      return {
        functionCallingConfig: { mode: 'AUTO' },
      };
    }
    if (toolChoice === 'none') {
      return {
        functionCallingConfig: { mode: 'NONE' },
      };
    }
    return {
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: [toolChoice.name],
      },
    };
  }

  /**
   * Map shared chat messages into Gemini systemInstruction + contents.
   * - assistant → model (text + functionCall parts)
   * - tool → user functionResponse parts (Gemini has no dedicated tool role)
   * - Does not discard tool turns; resolves function name via toolCallId lookup
   */
  private toGeminiMessages(messages: AiChatMessageInput[]): {
    systemInstruction: string | null;
    contents: GeminiContent[];
  } {
    const systemChunks: string[] = [];
    const contents: GeminiContent[] = [];
    const callIdToName = new Map<string, string>();

    const pushParts = (role: 'user' | 'model', parts: GeminiPart[]) => {
      if (!parts.length) return;
      const last = contents[contents.length - 1];
      if (last && last.role === role && Array.isArray(last.parts)) {
        last.parts.push(...parts);
      } else {
        contents.push({ role, parts: [...parts] });
      }
    };

    for (const message of messages) {
      if (message.role === 'system') {
        if (message.content.trim()) systemChunks.push(message.content);
        continue;
      }

      if (message.role === 'assistant') {
        if (message.toolCalls?.length) {
          for (const call of message.toolCalls) {
            callIdToName.set(call.id, call.name);
          }
        }
        const parts: GeminiPart[] = [];
        if (message.content.length > 0) {
          parts.push({ text: message.content });
        }
        if (message.toolCalls?.length) {
          for (const call of message.toolCalls) {
            parts.push({
              functionCall: {
                name: call.name,
                args: call.arguments,
                id: call.id,
              },
            });
          }
        }
        if (!parts.length) {
          // Empty assistant turn — skip rather than send an empty model content.
          continue;
        }
        pushParts('model', parts);
        continue;
      }

      if (message.role === 'tool') {
        const name =
          callIdToName.get(message.toolCallId) ??
          (typeof message.name === 'string' && message.name.trim()
            ? message.name.trim()
            : null);
        if (!name) {
          throw new AiProviderError({
            code: 'INVALID_REQUEST',
            provider: 'gemini',
            message:
              'Gemini tool result is missing a resolvable function name (toolCallId not found in prior assistant toolCalls).',
            failureClass: 'INVALID_RESPONSE',
            transmissionCertainty: 'not_transmitted',
            fallbackEligible: false,
            retryable: false,
          });
        }
        pushParts('user', [
          {
            functionResponse: {
              name,
              response: this.toolResultToResponseObject(message.content),
            },
          },
        ]);
        continue;
      }

      // user
      pushParts('user', [{ text: message.content }]);
    }

    return {
      systemInstruction: systemChunks.length
        ? systemChunks.join('\n\n')
        : null,
      contents,
    };
  }

  /**
   * Tool result `content` is opaque text from NestJS. Prefer JSON object bodies;
   * otherwise wrap as `{ result: string }` for Gemini Struct compatibility.
   */
  private toolResultToResponseObject(content: string): AiJsonObject {
    const trimmed = content.trim();
    if (!trimmed) {
      return { result: '' };
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (this.isPlainJsonObject(parsed)) {
        return parsed;
      }
    } catch {
      // not JSON — wrap below
    }
    return { result: content };
  }

  private normalizeSuccess(
    payload: GeminiGenerateContentResponse,
    requestedModel: string,
  ): AiGenerateTextResult {
    if (payload.promptFeedback?.blockReason) {
      throw new AiProviderError({
        code: 'INVALID_REQUEST',
        provider: 'gemini',
        message: 'Gemini blocked the prompt before generation.',
        failureClass: 'DEFINITIVE_REJECTION',
        transmissionCertainty: 'rejected',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const candidate = payload.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    if (!Array.isArray(parts)) {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'gemini',
        message: 'Gemini response candidate parts must be an array.',
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const textChunks: string[] = [];
    const toolCalls: AiToolCall[] = [];
    let functionCallIndex = 0;

    for (const part of parts) {
      if (!part || typeof part !== 'object') {
        throw new AiProviderError({
          code: 'UNKNOWN',
          provider: 'gemini',
          message: 'Gemini response contains an invalid content part.',
          failureClass: 'INVALID_RESPONSE',
          transmissionCertainty: 'invalid_response',
          fallbackEligible: false,
          retryable: false,
        });
      }

      if (typeof part.text === 'string') {
        textChunks.push(part.text);
      }

      if (part.functionCall != null) {
        toolCalls.push(
          this.normalizeFunctionCall(part.functionCall, functionCallIndex),
        );
        functionCallIndex += 1;
      }

      // functionResponse in a model candidate is unexpected for generateContent.
      if (part.functionResponse != null) {
        throw new AiProviderError({
          code: 'UNKNOWN',
          provider: 'gemini',
          message:
            'Gemini candidate unexpectedly included a functionResponse part.',
          failureClass: 'INVALID_RESPONSE',
          transmissionCertainty: 'invalid_response',
          fallbackEligible: false,
          retryable: false,
        });
      }
    }

    const content = textChunks.join('');
    const hasToolCalls = toolCalls.length > 0;
    if (!hasToolCalls && !content.trim()) {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'gemini',
        message: 'Gemini response missing assistant text content.',
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const inputTokens =
      typeof payload.usageMetadata?.promptTokenCount === 'number'
        ? payload.usageMetadata.promptTokenCount
        : null;
    const outputTokens =
      typeof payload.usageMetadata?.candidatesTokenCount === 'number'
        ? payload.usageMetadata.candidatesTokenCount
        : null;
    const totalTokens =
      typeof payload.usageMetadata?.totalTokenCount === 'number'
        ? payload.usageMetadata.totalTokenCount
        : inputTokens !== null && outputTokens !== null
          ? inputTokens + outputTokens
          : null;

    const rawFinish =
      typeof candidate?.finishReason === 'string'
        ? candidate.finishReason
        : null;
    // Gemini often returns STOP even when functionCall parts are present.
    const finish = hasToolCalls
      ? normalizeAiFinishReason(rawFinish ?? 'tool_calls')
      : normalizeAiFinishReason(rawFinish);
    const finishReason =
      hasToolCalls && finish.finishReason == null
        ? ('tool_calls' as const)
        : hasToolCalls && finish.finishReason === 'stop'
          ? ('tool_calls' as const)
          : finish.finishReason;

    return {
      provider: 'gemini',
      model:
        typeof payload.modelVersion === 'string' && payload.modelVersion.trim()
          ? payload.modelVersion
          : requestedModel,
      content,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        raw:
          payload.usageMetadata && typeof payload.usageMetadata === 'object'
            ? { ...payload.usageMetadata }
            : undefined,
      },
      finishReason,
      rawFinishReason: finish.rawFinishReason ?? rawFinish,
      ...(hasToolCalls ? { toolCalls } : {}),
    };
  }

  private normalizeFunctionCall(
    call: GeminiFunctionCall,
    index: number,
  ): AiToolCall {
    const name = typeof call.name === 'string' ? call.name.trim() : '';
    if (!name) {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'gemini',
        message: `Gemini functionCall[${index}] missing name.`,
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const args = call.args;
    if (!this.isPlainJsonObject(args)) {
      throw new AiProviderError({
        code: 'UNKNOWN',
        provider: 'gemini',
        message: `Gemini functionCall[${index}] args must be a JSON object.`,
        failureClass: 'INVALID_RESPONSE',
        transmissionCertainty: 'invalid_response',
        fallbackEligible: false,
        retryable: false,
      });
    }

    const vendorId =
      typeof call.id === 'string' && call.id.trim() ? call.id.trim() : null;

    return {
      id: vendorId ?? this.synthesizeToolCallId(index, name),
      name,
      arguments: args,
    };
  }

  /**
   * Gemini often omits OpenAI-style tool call ids. Synthesize a deterministic
   * id unique within a single candidate: `gemini-fc-{index}-{safeName}`.
   * Prefer a vendor-supplied `functionCall.id` when present.
   */
  private synthesizeToolCallId(index: number, name: string): string {
    const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'fn';
    return `gemini-fc-${index}-${safe}`;
  }

  private isPlainJsonObject(value: unknown): value is AiJsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private async mapHttpError(response: Response): Promise<AiProviderError> {
    const status = response.status;
    try {
      await response.json();
    } catch {
      // ignore — do not log raw bodies
    }

    this.logger.warn(`Gemini HTTP ${status}`);

    if (status === 429) {
      return new AiProviderError({
        code: 'RATE_LIMITED',
        provider: 'gemini',
        message: 'Gemini rate limit rejected the request.',
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
        provider: 'gemini',
        message:
          'Gemini rejected the API credentials. Check GEMINI_API_KEY (backend-only).',
        failureClass: 'INVALID_CONFIGURATION',
        transmissionCertainty: 'invalid_configuration',
        fallbackEligible: true,
        retryable: false,
        status,
      });
    }

    if (status === 400 || status === 404 || status === 422) {
      return new AiProviderError({
        code: 'INVALID_REQUEST',
        provider: 'gemini',
        message: `Gemini rejected the request (HTTP ${status}).`,
        failureClass: 'DEFINITIVE_REJECTION',
        transmissionCertainty: 'rejected',
        fallbackEligible: false,
        retryable: false,
        status,
      });
    }

    return new AiProviderError({
      code: 'UNAVAILABLE',
      provider: 'gemini',
      message: `Gemini returned HTTP ${status} with ambiguous execution certainty.`,
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
    const name = error instanceof Error ? error.name : 'Error';
    const message =
      error instanceof Error ? error.message : String(error);
    const causeCode = this.extractCauseCode(error);

    if (name === 'AbortError' || name === 'TimeoutError') {
      return new AiProviderError({
        code: 'TIMEOUT',
        provider: 'gemini',
        message:
          'Gemini request timed out or was aborted after possible transmission. Outcome is ambiguous; automatic fallback is not allowed.',
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

    if (causeCode && preTransmitCodes.has(causeCode) && fetchStarted) {
      return new AiProviderError({
        code: 'UNAVAILABLE',
        provider: 'gemini',
        message: `Gemini connection failed before transmission (${causeCode}).`,
        failureClass: 'PRE_TRANSMISSION_FAILURE',
        transmissionCertainty: 'not_transmitted',
        fallbackEligible: true,
        retryable: true,
        cause: error,
      });
    }

    this.logger.warn(`Gemini transport error: ${name}`);
    return new AiProviderError({
      code: 'UNKNOWN',
      provider: 'gemini',
      message: message || 'Gemini transport failure with ambiguous certainty.',
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
      const timeoutErr = new Error(
        `Gemini request exceeded ${timeoutMs}ms`,
      );
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

/**
 * Gemini `Schema` accepts a subset of JSON Schema. Strip keywords Gemini
 * rejects (notably `additionalProperties`) while preserving type/properties/
 * required/items/enum and numeric/string bounds for declarations.
 * FieldKeel backend validation still uses the full tool schemas.
 */
export function sanitizeSchemaForGemini(schema: AiJsonObject): AiJsonObject {
  return sanitizeSchemaNode(schema) as AiJsonObject;
}

const GEMINI_SCHEMA_KEYS = new Set([
  'type',
  'description',
  'properties',
  'required',
  'items',
  'enum',
  'format',
  'nullable',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'title',
]);

function sanitizeSchemaNode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSchemaNode(entry));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(input)) {
    if (!GEMINI_SCHEMA_KEYS.has(key)) continue;

    if (key === 'properties' && child && typeof child === 'object' && !Array.isArray(child)) {
      const props: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(
        child as Record<string, unknown>,
      )) {
        props[propName] = sanitizeSchemaNode(propSchema);
      }
      out.properties = props;
      continue;
    }

    if (key === 'items') {
      out.items = sanitizeSchemaNode(child);
      continue;
    }

    if (key === 'required' && Array.isArray(child)) {
      out.required = child.filter((entry) => typeof entry === 'string');
      continue;
    }

    if (key === 'enum' && Array.isArray(child)) {
      out.enum = child.filter(
        (entry) =>
          entry === null ||
          typeof entry === 'string' ||
          typeof entry === 'number' ||
          typeof entry === 'boolean',
      );
      continue;
    }

    out[key] = child;
  }

  return out;
}
