import { Injectable, Logger } from '@nestjs/common';
import type { AiJsonObject, AiJsonValue } from '../providers/ai-provider.types.js';
import {
  AI_TOOL_DEFAULT_TIMEOUT_MS,
  AI_TOOL_MAX_ARGUMENTS_BYTES,
  AI_TOOL_MAX_RESULT_BYTES,
  AI_TOOL_MAX_TIMEOUT_MS,
} from './ai-tool.constants.js';
import { AiToolRegistry } from './ai-tool.registry.js';
import {
  formatSchemaFailures,
  validateToolArguments,
} from './ai-tool-schema.validator.js';
import type {
  AiToolError,
  AiToolExecuteInput,
  AiToolExecutionResult,
  AiToolHandler,
} from './ai-tool.types.js';

@Injectable()
export class AiToolExecutorService {
  private readonly logger = new Logger(AiToolExecutorService.name);

  constructor(private readonly registry: AiToolRegistry) {}

  /**
   * Resolve, authorize (read-only), validate, and invoke a registered tool.
   * Never throws provider-facing exceptions — failures are normalized results.
   * Returns exactly one terminal result; late handler completions are ignored.
   */
  async execute(input: AiToolExecuteInput): Promise<AiToolExecutionResult> {
    const started = Date.now();
    const toolName = input.toolName?.trim() || '';
    const ctx = input.context;

    const fail = (
      name: string,
      error: AiToolError,
    ): AiToolExecutionResult => {
      const durationMs = Date.now() - started;
      this.logOutcome({
        toolName: name || toolName || '(unknown)',
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        usageEventId: ctx.usageEventId,
        durationMs,
        ok: false,
        failureCode: error.code,
        resultBytes: null,
      });
      return {
        ok: false,
        toolName: name || toolName || '(unknown)',
        error,
        durationMs,
      };
    };

    if (!toolName) {
      return fail('(unknown)', {
        code: 'UNKNOWN_TOOL',
        message: 'Tool name is required.',
      });
    }

    const registered = this.registry.get(toolName);
    if (!registered) {
      return fail(toolName, {
        code: 'UNKNOWN_TOOL',
        message: `Unknown tool "${toolName}".`,
      });
    }

    if (!registered.enabled) {
      return fail(toolName, {
        code: 'DISABLED',
        message: `Tool "${toolName}" is disabled.`,
      });
    }

    if (registered.access !== 'read' && registered.access !== 'propose') {
      return fail(toolName, {
        code: 'NOT_ALLOWED_ACCESS',
        message: `Tool "${toolName}" has an unsupported access class.`,
      });
    }

    const argsCheck = this.ensureArgumentObjectAndSize(input.arguments);
    if (!argsCheck.ok) {
      return fail(toolName, argsCheck.error);
    }

    const schemaResult = validateToolArguments(
      registered.definition.parameters,
      argsCheck.value,
    );
    if (!schemaResult.ok) {
      return fail(toolName, {
        code: 'INVALID_ARGUMENTS',
        message: `Invalid arguments for "${toolName}": ${formatSchemaFailures(schemaResult.failures)}`,
      });
    }

    const timeoutMs = this.resolveTimeoutMs(registered.timeoutMs);

    try {
      const data = await this.invokeWithAbort({
        handler: registered.handler,
        args: schemaResult.value,
        context: ctx,
        timeoutMs,
        parentSignal: input.signal,
      });

      const sized = this.ensureResultSize(data);
      if (!sized.ok) {
        return fail(toolName, sized.error);
      }

      const durationMs = Date.now() - started;
      this.logOutcome({
        toolName,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        usageEventId: ctx.usageEventId,
        durationMs,
        ok: true,
        failureCode: null,
        resultBytes: sized.bytes,
      });

      return {
        ok: true,
        toolName,
        data: sized.value,
        durationMs,
      };
    } catch (error) {
      if (error instanceof ToolTimeoutError) {
        return fail(toolName, {
          code: 'TIMEOUT',
          message: `Tool "${toolName}" timed out after ${timeoutMs}ms.`,
        });
      }

      if (error instanceof ToolCancelledError) {
        return fail(toolName, {
          code: 'CANCELLED',
          message: `Tool "${toolName}" was cancelled before completion.`,
        });
      }

      // Late completion after timeout/cancel must never surface as success.
      if (error instanceof LateToolResultError) {
        return fail(toolName, {
          code: 'TIMEOUT',
          message: `Tool "${toolName}" timed out after ${timeoutMs}ms.`,
        });
      }

      this.logger.warn(
        `AI tool execution failed name=${toolName} org=${ctx.organizationId} code=EXECUTION_FAILED`,
      );
      return fail(toolName, {
        code: 'EXECUTION_FAILED',
        message: `Tool "${toolName}" failed during execution.`,
      });
    }
  }

  private ensureArgumentObjectAndSize(
    args: unknown,
  ):
    | { ok: true; value: AiJsonObject }
    | { ok: false; error: AiToolError } {
    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_ARGUMENTS',
          message: 'Tool arguments must be a JSON object.',
        },
      };
    }

    let serialized: string;
    try {
      serialized = JSON.stringify(args);
    } catch {
      return {
        ok: false,
        error: {
          code: 'INVALID_ARGUMENTS',
          message: 'Tool arguments could not be serialized as JSON.',
        },
      };
    }

    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes > AI_TOOL_MAX_ARGUMENTS_BYTES) {
      return {
        ok: false,
        error: {
          code: 'INVALID_ARGUMENTS',
          message: `Tool arguments exceed the ${AI_TOOL_MAX_ARGUMENTS_BYTES}-byte limit.`,
        },
      };
    }

    return { ok: true, value: args as AiJsonObject };
  }

  private ensureResultSize(
    data: AiJsonValue,
  ):
    | { ok: true; value: AiJsonValue; bytes: number }
    | { ok: false; error: AiToolError } {
    let serialized: string;
    try {
      serialized = JSON.stringify(data);
    } catch {
      return {
        ok: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: 'Tool result could not be serialized as JSON.',
        },
      };
    }
    if (serialized === undefined) {
      return {
        ok: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: 'Tool result is not JSON-serializable.',
        },
      };
    }
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes > AI_TOOL_MAX_RESULT_BYTES) {
      return {
        ok: false,
        error: {
          code: 'RESULT_TOO_LARGE',
          message: `Tool result exceeds the ${AI_TOOL_MAX_RESULT_BYTES}-byte limit.`,
        },
      };
    }
    return { ok: true, value: data, bytes };
  }

  private resolveTimeoutMs(override?: number): number {
    const raw =
      typeof override === 'number' && Number.isFinite(override) && override > 0
        ? override
        : AI_TOOL_DEFAULT_TIMEOUT_MS;
    return Math.min(Math.max(1, Math.floor(raw)), AI_TOOL_MAX_TIMEOUT_MS);
  }

  /**
   * Run the handler under a dedicated AbortController.
   * Timeout / parent abort → signal aborted; only the first settlement wins.
   * Late handler fulfillments are discarded (never reported as success).
   *
   * Note: AbortSignal does not cancel in-flight Prisma queries unless a future
   * handler cooperatively stops and the DB client supports it (jobs/schedule
   * services currently have no AbortSignal parameters).
   */
  private async invokeWithAbort(input: {
    handler: AiToolHandler;
    args: AiJsonObject;
    context: AiToolExecuteInput['context'];
    timeoutMs: number;
    parentSignal?: AbortSignal;
  }): Promise<AiJsonValue> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    let onParentAbort: (() => void) | undefined;
    let onControllerAbort: (() => void) | undefined;

    const abortWith = (reason: Error) => {
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
    };

    try {
      if (input.parentSignal) {
        if (input.parentSignal.aborted) {
          throw new ToolCancelledError();
        }
        onParentAbort = () => {
          abortWith(new ToolCancelledError());
        };
        input.parentSignal.addEventListener('abort', onParentAbort, {
          once: true,
        });
      }

      timer = setTimeout(() => {
        abortWith(new ToolTimeoutError());
      }, input.timeoutMs);

      const work = Promise.resolve()
        .then(() =>
          input.handler(input.args, input.context, {
            signal: controller.signal,
          }),
        )
        .then((value) => {
          if (settled || controller.signal.aborted) {
            throw new LateToolResultError();
          }
          settled = true;
          return value;
        })
        .catch((error: unknown) => {
          if (settled) {
            throw new LateToolResultError();
          }
          if (controller.signal.aborted) {
            const reason = controller.signal.reason;
            if (reason instanceof ToolTimeoutError) {
              settled = true;
              throw reason;
            }
            if (reason instanceof ToolCancelledError) {
              settled = true;
              throw reason;
            }
          }
          settled = true;
          throw error;
        });

      // Avoid unhandled rejection if the race already settled on abort/timeout.
      work.catch(() => undefined);

      const aborted = new Promise<AiJsonValue>((_resolve, reject) => {
        onControllerAbort = () => {
          const reason = controller.signal.reason;
          if (reason instanceof Error) {
            reject(reason);
            return;
          }
          reject(new ToolTimeoutError());
        };
        if (controller.signal.aborted) {
          onControllerAbort();
        } else {
          controller.signal.addEventListener('abort', onControllerAbort, {
            once: true,
          });
        }
      });

      return await Promise.race([work, aborted]);
    } finally {
      settled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (input.parentSignal && onParentAbort) {
        input.parentSignal.removeEventListener('abort', onParentAbort);
        onParentAbort = undefined;
      }
      if (onControllerAbort) {
        controller.signal.removeEventListener('abort', onControllerAbort);
        onControllerAbort = undefined;
      }
      // If the handler is still running after we return (timeout/cancel), keep
      // the signal aborted so cooperative handlers can stop. On success the
      // signal stays non-aborted.
    }
  }

  private logOutcome(input: {
    toolName: string;
    organizationId: string;
    userId: string;
    sessionId?: string;
    usageEventId?: string;
    durationMs: number;
    ok: boolean;
    failureCode: string | null;
    resultBytes: number | null;
  }) {
    this.logger.log(
      [
        'AI tool',
        `name=${input.toolName}`,
        `org=${input.organizationId}`,
        `user=${input.userId}`,
        input.sessionId ? `session=${input.sessionId}` : null,
        input.usageEventId ? `usageEvent=${input.usageEventId}` : null,
        `durationMs=${input.durationMs}`,
        `ok=${input.ok}`,
        input.failureCode ? `failure=${input.failureCode}` : null,
        input.resultBytes != null ? `resultBytes=${input.resultBytes}` : null,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
}

class ToolTimeoutError extends Error {
  constructor() {
    super('AI tool timeout');
    this.name = 'ToolTimeoutError';
  }
}

class ToolCancelledError extends Error {
  constructor() {
    super('AI tool cancelled');
    this.name = 'ToolCancelledError';
  }
}

/** Handler fulfilled after the executor already settled — must not become success. */
class LateToolResultError extends Error {
  constructor() {
    super('AI tool late result ignored');
    this.name = 'LateToolResultError';
  }
}
