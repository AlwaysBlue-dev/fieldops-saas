import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AiChatSessionStatus,
  AiMessageRole,
  AiUsageStatus,
  OrganizationRole,
  Prisma,
  type AiChatMessage,
  type AiUsageEvent,
} from '../generated/prisma/client.js';
import { AI_EXECUTION_HEARTBEAT_INTERVAL_MS } from '../common/constants.js';
import {
  formatYmdInZone,
  isValidIanaTimeZone,
} from '../common/timezone.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../subscription/clock.js';
import { EntitlementService } from '../subscription/entitlement.service.js';
import { PLAN_FEATURES } from '../subscription/plan-features.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { withTenant } from '../tenancy/tenant-scope.js';
import {
  evaluatePostToolProviderFailure,
  formatPostToolProviderFailureLog,
  POST_TOOL_FALLBACK_BLOCKED,
  POST_TOOL_FALLBACK_ELIGIBLE,
  POST_TOOL_FALLBACK_EXHAUSTED,
  resolvePostToolFailoverExhausted,
  type PostToolFailureResolution,
} from './ai-post-tool-failure.js';
import {
  AI_USER_MESSAGES,
  userFacingProviderError,
} from './ai-user-facing.js';
import { buildFieldkeelSystemPrompt } from './prompts/fieldkeel-system-prompt.js';
import { AiProposalService } from './proposals/ai-proposal.service.js';
import { classifyChainError } from './providers/ai-provider-chain.js';
import type { AiProvider } from './providers/ai-provider.interface.js';
import { AiProviderRouter } from './providers/ai-provider.router.js';
import type {
  AiChatMessageInput,
  AiGenerateTextResult,
  AiProviderError,
  AiToolCall,
  AiToolDefinition,
} from './providers/ai-provider.types.js';
import { startExecutionHeartbeat } from './providers/execution-heartbeat.js';
import { windowRecentConversationRows } from './tools/ai-conversation-history.js';
import {
  collectUsageEventIdsFromMessages,
  compareChatMessageOrder,
  mapStoredMessagesToProviderInput,
  serializeToolResultContent,
  shouldIncludeMessageInModelHistory,
} from './tools/ai-message-history.js';
import { buildAiToolContext } from './tools/ai-tool.context.js';
import {
  AI_TOOL_MAX_CONCURRENT_PER_ROUND,
  AI_TOOL_MAX_INVOCATIONS_PER_REQUEST,
  AI_TOOL_MAX_ROUNDS_PER_REQUEST,
  AI_TOOL_PERSISTED_RESULT_MAX_BYTES,
} from './tools/ai-tool.constants.js';
import {
  validateProviderToolCallList,
  validateToolRoundForPersistence,
  type ToolRoundResultRow,
} from './tools/ai-tool-round.validation.js';
import { AiToolExecutorService } from './tools/ai-tool-executor.service.js';
import { AiToolRegistry } from './tools/ai-tool.registry.js';
import type { AiToolContext } from './tools/ai-tool.types.js';
import { AiUsageService } from './usage/ai-usage.service.js';

function publicUsageEvent(event: {
  id: string;
  clientRequestId: string | null;
  status: AiUsageStatus;
}) {
  return {
    id: event.id,
    clientRequestId: event.clientRequestId,
    status: event.status,
  };
}

const AI_ACCESS_ROLES: ReadonlySet<OrganizationRole> = new Set([
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.OPERATIONS_MANAGER,
  OrganizationRole.SUPERVISOR,
]);

/** Max persisted chat rows considered for a provider turn (newest first). */
const HISTORY_MESSAGE_LIMIT = 80;
/** Fetch one extra row to detect whether older history exists beyond the window. */
const HISTORY_FETCH_LIMIT = HISTORY_MESSAGE_LIMIT + 1;

const TOOL_LIMIT_ASSISTANT_MESSAGE =
  'I reached the tool-execution limit for this request (maximum tool rounds or invocations). Please narrow the question or send a new message so I can continue with a fresh request.';

const MALFORMED_TOOL_CALLS_ASSISTANT_MESSAGE =
  'I received an invalid tool request from the model and could not run tools for this turn. Please try again with a new message.';

const TOOL_ROUND_PERSISTENCE_ASSISTANT_MESSAGE =
  'I could not safely record tool results for this turn and stopped without saving an incomplete tool group. Please try again with a new message.';

type HeartbeatHandle = ReturnType<typeof startExecutionHeartbeat>;

/**
 * AI Workforce orchestration — lease-owned execution with
 * Groq → Gemini → OpenRouter router under one reservation,
 * plus a bounded read-only tool loop (Step 4.3.7).
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly usage: AiUsageService,
    private readonly proposals: AiProposalService,
    private readonly providerRouter: AiProviderRouter,
    private readonly toolRegistry: AiToolRegistry,
    private readonly toolExecutor: AiToolExecutorService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  assertCanUseAi(organization: OrganizationContext) {
    if (!AI_ACCESS_ROLES.has(organization.role)) {
      throw new ForbiddenException(
        'AI Workforce is not available for your organization role.',
      );
    }
  }

  private async assertFeatureEnabled(organizationId: string) {
    const allowed = await this.entitlements.hasFeature(
      organizationId,
      PLAN_FEATURES.AI_WORKFORCE,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'AI Workforce is not included on your current plan.',
      );
    }
  }

  async createSession(
    organization: OrganizationContext,
    userId: string,
    title?: string,
  ) {
    this.assertCanUseAi(organization);
    await this.assertFeatureEnabled(organization.organizationId);

    return this.prisma.aiChatSession.create({
      data: {
        organizationId: organization.organizationId,
        userId,
        title: title?.trim() || null,
        status: AiChatSessionStatus.ACTIVE,
      },
    });
  }

  async listSessions(organization: OrganizationContext, userId: string) {
    this.assertCanUseAi(organization);
    await this.assertFeatureEnabled(organization.organizationId);

    return this.prisma.aiChatSession.findMany({
      where: withTenant(organization.organizationId, {
        userId,
        status: AiChatSessionStatus.ACTIVE,
      }),
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async renameSession(
    organization: OrganizationContext,
    userId: string,
    sessionId: string,
    title: string,
  ) {
    this.assertCanUseAi(organization);
    await this.assertFeatureEnabled(organization.organizationId);

    const trimmed = title.trim();
    if (!trimmed) {
      throw new BadRequestException('Conversation title cannot be empty.');
    }
    if (trimmed.length > 200) {
      throw new BadRequestException(
        'Conversation title must be at most 200 characters.',
      );
    }

    const updated = await this.prisma.aiChatSession.updateMany({
      where: withTenant(organization.organizationId, {
        id: sessionId,
        userId,
        status: AiChatSessionStatus.ACTIVE,
      }),
      data: { title: trimmed },
    });
    if (updated.count === 0) throw new NotFoundException();

    const session = await this.prisma.aiChatSession.findFirst({
      where: withTenant(organization.organizationId, {
        id: sessionId,
        userId,
        status: AiChatSessionStatus.ACTIVE,
      }),
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!session) throw new NotFoundException();
    return session;
  }

  /**
   * Soft-deletes (ARCHIVED) an owned conversation. Removes chat messages and
   * tool-call history. Preserves AiUsageEvent rows for billing/audit and keeps
   * AiProposedAction rows (session FK remains on the archived session).
   */
  async deleteSession(
    organization: OrganizationContext,
    userId: string,
    sessionId: string,
  ) {
    this.assertCanUseAi(organization);
    await this.assertFeatureEnabled(organization.organizationId);

    const session = await this.prisma.aiChatSession.findFirst({
      where: withTenant(organization.organizationId, {
        id: sessionId,
        userId,
        status: AiChatSessionStatus.ACTIVE,
      }),
      select: { id: true, title: true },
    });
    if (!session) throw new NotFoundException();

    const now = this.clock.now();
    const activeExecution = await this.prisma.aiUsageEvent.findFirst({
      where: withTenant(organization.organizationId, {
        sessionId,
        userId,
        status: AiUsageStatus.PENDING,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      }),
      select: { id: true },
    });
    if (activeExecution) {
      throw new ConflictException(
        'This conversation has a request still in progress. Wait for it to finish, or discard the pending request from the chat, then try deleting again.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.aiChatMessage.deleteMany({
        where: withTenant(organization.organizationId, { sessionId }),
      });
      const archived = await tx.aiChatSession.updateMany({
        where: withTenant(organization.organizationId, {
          id: sessionId,
          userId,
          status: AiChatSessionStatus.ACTIVE,
        }),
        data: { status: AiChatSessionStatus.ARCHIVED },
      });
      if (archived.count === 0) {
        throw new NotFoundException();
      }
    });

    return { deleted: true as const, id: session.id };
  }

  async getSession(
    organization: OrganizationContext,
    userId: string,
    sessionId: string,
  ) {
    this.assertCanUseAi(organization);
    await this.assertFeatureEnabled(organization.organizationId);

    const session = await this.prisma.aiChatSession.findFirst({
      where: withTenant(organization.organizationId, {
        id: sessionId,
        userId,
        status: AiChatSessionStatus.ACTIVE,
      }),
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        organizationId: true,
        userId: true,
      },
    });
    if (!session) throw new NotFoundException();

    // Newest-first fetch with headroom for filtered TOOL / tool-call rows,
    // then return chronological UI messages (newest window, oldest→newest).
    const visibleLimit = 200;
    const fetchLimit = visibleLimit * 3;
    const newestFirst = await this.prisma.aiChatMessage.findMany({
      where: withTenant(organization.organizationId, { sessionId }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: fetchLimit,
      select: {
        id: true,
        role: true,
        content: true,
        provider: true,
        model: true,
        createdAt: true,
        toolCalls: true,
        toolCallId: true,
        metadata: true,
      },
    });

    newestFirst.sort((a, b) => -compareChatMessageOrder(a, b));

    const visibleNewestFirst = newestFirst.filter((m) => {
      if (m.role === AiMessageRole.TOOL) return false;
      if (m.role === AiMessageRole.ASSISTANT && m.toolCalls != null) {
        return false;
      }
      return true;
    });

    const messagesTruncated =
      visibleNewestFirst.length > visibleLimit ||
      newestFirst.length >= fetchLimit;
    const windowNewest = visibleNewestFirst.slice(0, visibleLimit);
    const messages = [...windowNewest].reverse().map(
      ({ toolCalls: _tc, toolCallId: _id, metadata: _m, ...rest }) => rest,
    );

    return { ...session, messages, messagesTruncated };
  }

  /**
   * Persists the user turn, runs the provider chain under lease ownership,
   * optionally executes read-only tools in a bounded loop, and token-gates
   * finalization. Duplicates never re-execute providers or tools.
   */
  async sendMessage(
    organization: OrganizationContext,
    userId: string,
    sessionId: string,
    content: string,
    clientRequestId: string,
  ) {
    this.assertCanUseAi(organization);
    await this.assertFeatureEnabled(organization.organizationId);

    const session = await this.prisma.aiChatSession.findFirst({
      where: withTenant(organization.organizationId, {
        id: sessionId,
        userId,
        status: AiChatSessionStatus.ACTIVE,
      }),
    });
    if (!session) throw new NotFoundException();

    const chain = this.providerRouter.resolveExecutionChain();
    if (chain.length === 0) {
      const skipped = this.providerRouter.listSkippedProviders();
      this.logger.warn(
        `AI configuration unavailable; skipped=${skipped
          .map((s) => `${s.id}:${s.reason}`)
          .join(',')}`,
      );
      throw new ServiceUnavailableException(
        AI_USER_MESSAGES.NO_PROVIDERS_CONFIGURED,
      );
    }

    const primary = chain[0]!;
    const providerId = primary.id;
    const model = primary.defaultModel();

    const began = await this.usage.beginExecution({
      organizationId: organization.organizationId,
      userId,
      clientRequestId,
      sessionId: session.id,
      taskKey: 'chat.turn',
      provider: providerId,
      model,
      metadata: {
        provider: providerId,
        chain: chain.map((p) => p.id),
      },
    });

    if (began.kind === 'IN_PROGRESS') {
      return {
        sessionId: session.id,
        execution: 'IN_PROGRESS' as const,
        usageEvent: publicUsageEvent(began.event),
        providerStatus: providerId,
      };
    }

    if (began.kind === 'COMPLETED') {
      return {
        sessionId: session.id,
        execution: 'COMPLETED' as const,
        usageEvent: publicUsageEvent(began.event),
        result: began.result,
        providerStatus: providerId,
      };
    }

    if (began.kind === 'FAILED' || began.kind === 'INTERRUPTED') {
      await this.afterUnsuccessfulTurn({
        organizationId: organization.organizationId,
        sessionId: session.id,
        usageEventId: began.event.id,
        outcome: began.kind,
      });
      return {
        sessionId: session.id,
        execution: began.kind,
        usageEvent: publicUsageEvent(began.event),
        providerStatus: providerId,
        message: AI_USER_MESSAGES.CLIENT_REQUEST_FINISHED,
      };
    }

    const { event, executionToken } = began;
    const orgId = organization.organizationId;

    const owned = await this.usage.heartbeatReservation({
      organizationId: orgId,
      usageEventId: event.id,
      executionToken,
    });
    if (!owned) {
      return this.reconcileOwnershipLost({
        organizationId: orgId,
        sessionId: session.id,
        event,
        providerStatus: providerId,
        message: 'Execution lease was lost before provider work started.',
      });
    }

    const trimmed = content.trim();
    let userMessage: AiChatMessage;
    try {
      userMessage = await this.prisma.aiChatMessage.create({
        data: {
          organizationId: orgId,
          sessionId: session.id,
          userId,
          role: AiMessageRole.USER,
          content: trimmed,
          metadata: {
            kind: 'user_turn',
            usageEventId: event.id,
            clientRequestId,
            historySequence: 0,
          },
        },
      });
    } catch (error) {
      await this.usage.failReservation({
        organizationId: orgId,
        usageEventId: event.id,
        executionToken,
        metadata: { reason: 'user_message_persist_failed' },
      });
      throw error;
    }

    const toolDefinitions = this.toolRegistry.listDefinitions();
    const toolContext = buildAiToolContext({
      organization,
      userId,
      sessionId: session.id,
      usageEventId: event.id,
    });

    const abort = new AbortController();
    const heartbeat = startExecutionHeartbeat({
      intervalMs: AI_EXECUTION_HEARTBEAT_INTERVAL_MS,
      tick: () =>
        this.usage.heartbeatReservation({
          organizationId: orgId,
          usageEventId: event.id,
          executionToken,
        }),
      onLostOwnership: () => {
        abort.abort(
          Object.assign(new Error('AI execution ownership lost'), {
            name: 'AbortError',
          }),
        );
      },
    });

    try {
      const selected = await this.selectProviderWithFailover({
        chain,
        orgId,
        sessionId: session.id,
        timeZone: organization.timezone,
        event,
        executionToken,
        clientRequestId,
        userMessage,
        toolDefinitions,
        abort,
        heartbeat,
        fallbackProviderStatus: providerId,
      });
      if (selected.kind !== 'ok') {
        return selected.response;
      }

      return this.runToolOrchestrationLoop({
        organizationId: orgId,
        session,
        timeZone: organization.timezone,
        event,
        executionToken,
        userMessage,
        trimmed,
        lockedProvider: selected.provider,
        generation: selected.generation,
        toolDefinitions,
        toolContext,
        clientRequestId,
        abort,
        heartbeat,
        totalInputTokens: selected.inputTokens,
        totalOutputTokens: selected.outputTokens,
      });
    } finally {
      heartbeat.stop();
    }
  }

  /**
   * First provider success (text or tool_calls) locks the provider for the
   * remainder of the turn. Failover remains available only before any success.
   */
  private async selectProviderWithFailover(input: {
    chain: AiProvider[];
    orgId: string;
    sessionId: string;
    timeZone: string;
    event: AiUsageEvent;
    executionToken: string;
    clientRequestId: string;
    userMessage: AiChatMessage;
    toolDefinitions: AiToolDefinition[];
    abort: AbortController;
    heartbeat: HeartbeatHandle;
    fallbackProviderStatus: string;
  }): Promise<
    | {
        kind: 'ok';
        provider: AiProvider;
        generation: AiGenerateTextResult;
        inputTokens: number;
        outputTokens: number;
      }
    | { kind: 'terminal'; response: Record<string, unknown> }
  > {
    const {
      chain,
      orgId,
      sessionId,
      timeZone,
      event,
      executionToken,
      clientRequestId,
      userMessage,
      toolDefinitions,
      abort,
      heartbeat,
      fallbackProviderStatus,
    } = input;

    for (let index = 0; index < chain.length; index++) {
      const current = chain[index]!;
      const hasNextProvider = index < chain.length - 1;

      if (heartbeat.didLoseOwnership()) {
        return {
          kind: 'terminal',
          response: await this.reconcileOwnershipLost({
            organizationId: orgId,
            sessionId,
            event,
            providerStatus: current.id,
            message:
              'Ownership lost during provider chain; stale token will not finalize.',
          }),
        };
      }

      try {
        const providerMessages = await this.buildProviderMessages({
          organizationId: orgId,
          sessionId,
          timeZone,
        });
        const generation = await current.generateText({
          model: current.defaultModel(),
          messages: providerMessages,
          signal: abort.signal,
          idempotencyKey: `${orgId}:${clientRequestId}:r0`,
          ...(toolDefinitions.length > 0
            ? { tools: toolDefinitions, toolChoice: 'auto' as const }
            : {}),
        });

        if (heartbeat.didLoseOwnership()) {
          return {
            kind: 'terminal',
            response: await this.reconcileOwnershipLost({
              organizationId: orgId,
              sessionId,
              event,
              providerStatus: current.id,
              message:
                'Ownership lost during provider call; result was not finalized.',
            }),
          };
        }

        return {
          kind: 'ok',
          provider: current,
          generation,
          inputTokens: generation.usage.inputTokens ?? 0,
          outputTokens: generation.usage.outputTokens ?? 0,
        };
      } catch (error) {
        if (heartbeat.didLoseOwnership()) {
          return {
            kind: 'terminal',
            response: await this.reconcileOwnershipLost({
              organizationId: orgId,
              sessionId,
              event,
              providerStatus: current.id,
              message:
                'Ownership lost during provider call; stale token will not finalize.',
            }),
          };
        }

        const decision = classifyChainError(error);

        if (decision.kind === 'unexpected') {
          this.logger.warn(
            `Unexpected AI error usageEvent=${event.id} provider=${current.id}`,
          );
          await this.usage.interruptReservation({
            organizationId: orgId,
            usageEventId: event.id,
            executionToken,
            metadata: {
              reason: 'unexpected_error',
              transmissionCertainty: 'ambiguous',
              provider: current.id,
            },
          });
          await this.afterUnsuccessfulTurn({
            organizationId: orgId,
            sessionId,
            usageEventId: event.id,
            outcome: 'INTERRUPTED',
          });
          return {
            kind: 'terminal',
            response: {
              sessionId,
              execution: 'INTERRUPTED' as const,
              usageEvent: {
                id: event.id,
                clientRequestId: event.clientRequestId,
                status: AiUsageStatus.INTERRUPTED,
              },
              userMessage,
              providerStatus: current.id,
              message: AI_USER_MESSAGES.UNEXPECTED,
            },
          };
        }

        const providerError = decision.error;
        const attemptNumber = index + 1;
        const attemptModel = current.defaultModel();
        const willFallback =
          decision.kind === 'continue' && hasNextProvider;
        this.logger.warn(
          `AI phase=initial_generation provider=${providerError.provider} model=${attemptModel} attempt=${attemptNumber} class=${providerError.failureClass} code=${providerError.code} status=${providerError.status ?? 'n/a'} fallbackEligible=${providerError.fallbackEligible} fallback=${willFallback ? 'attempted' : decision.kind === 'ambiguous' ? 'skipped_ambiguous' : hasNextProvider ? 'skipped' : 'exhausted'} retryAfterSeconds=${providerError.retryAfterSeconds ?? 'n/a'}`,
        );

        if (decision.kind === 'ambiguous') {
          await this.usage.interruptReservation({
            organizationId: orgId,
            usageEventId: event.id,
            executionToken,
            metadata: {
              reason: providerError.failureClass,
              code: providerError.code,
              transmissionCertainty: providerError.transmissionCertainty,
              fallbackEligible: false,
              fallback: 'skipped_ambiguous',
              phase: 'initial_generation',
              httpStatus: providerError.status,
              provider: providerError.provider,
              model: attemptModel,
              attemptNumber,
              retryAfterSeconds: providerError.retryAfterSeconds,
            },
          });
          await this.afterUnsuccessfulTurn({
            organizationId: orgId,
            sessionId,
            usageEventId: event.id,
            outcome: 'INTERRUPTED',
          });
          return {
            kind: 'terminal',
            response: {
              sessionId,
              execution: 'INTERRUPTED' as const,
              usageEvent: {
                id: event.id,
                clientRequestId: event.clientRequestId,
                status: AiUsageStatus.INTERRUPTED,
              },
              userMessage,
              providerStatus: current.id,
              message: userFacingProviderError(providerError),
              failureClass: providerError.failureClass,
              fallbackEligible: false,
            },
          };
        }

        if (decision.kind === 'continue' && hasNextProvider) {
          const noted = await this.usage.noteProviderAttempt({
            organizationId: orgId,
            usageEventId: event.id,
            executionToken,
            attempt: {
              provider: providerError.provider,
              model: attemptModel,
              attemptNumber,
              failureClass: providerError.failureClass,
              code: providerError.code,
              httpStatus: providerError.status,
              transmissionCertainty: providerError.transmissionCertainty,
              at: new Date().toISOString(),
            },
          });
          if (!noted) {
            return {
              kind: 'terminal',
              response: await this.reconcileOwnershipLost({
                organizationId: orgId,
                sessionId,
                event,
                providerStatus: current.id,
                message:
                  'Ownership lost while recording provider attempt; chain stopped.',
              }),
            };
          }
          if (providerError.failureClass === 'INVALID_CONFIGURATION') {
            this.logger.warn(
              `AI phase=initial_generation fallback=attempted reason=invalid_configuration provider=${providerError.provider}`,
            );
          }
          continue;
        }

        if (
          providerError.failureClass === 'INVALID_CONFIGURATION' ||
          !hasNextProvider
        ) {
          const skipped = this.providerRouter.listSkippedProviders();
          this.logger.warn(
            `AI phase=initial_generation fallback=exhausted after ${providerError.provider} (${providerError.failureClass}); skipped=${skipped
              .map((s) => `${s.id}:${s.reason}`)
              .join(',')}`,
          );
        }

        await this.usage.failReservation({
          organizationId: orgId,
          usageEventId: event.id,
          executionToken,
          metadata: {
            reason: providerError.failureClass,
            code: providerError.code,
            transmissionCertainty: providerError.transmissionCertainty,
            fallbackEligible: providerError.fallbackEligible,
            httpStatus: providerError.status,
            provider: providerError.provider,
            model: attemptModel,
            attemptNumber,
            chainExhausted: !hasNextProvider,
          },
        });
        await this.afterUnsuccessfulTurn({
          organizationId: orgId,
          sessionId,
          usageEventId: event.id,
          outcome: 'FAILED',
        });

        return {
          kind: 'terminal',
          response: {
            sessionId,
            execution: 'FAILED' as const,
            usageEvent: {
              id: event.id,
              clientRequestId: event.clientRequestId,
              status: AiUsageStatus.FAILED,
            },
            userMessage,
            providerStatus: current.id,
            message: userFacingProviderError(providerError),
            failureClass: providerError.failureClass,
            fallbackEligible: false,
          },
        };
      }
    }

    await this.usage.failReservation({
      organizationId: orgId,
      usageEventId: event.id,
      executionToken,
      metadata: { reason: 'provider_chain_exhausted' },
    });
    await this.afterUnsuccessfulTurn({
      organizationId: orgId,
      sessionId,
      usageEventId: event.id,
      outcome: 'FAILED',
    });
    return {
      kind: 'terminal',
      response: {
        sessionId,
        execution: 'FAILED' as const,
        usageEvent: {
          id: event.id,
          clientRequestId: event.clientRequestId,
          status: AiUsageStatus.FAILED,
        },
        userMessage,
        providerStatus: fallbackProviderStatus,
        message: AI_USER_MESSAGES.UNEXPECTED,
      },
    };
  }

  /**
   * After the first successful provider response, execute tools (if any) and
   * re-prompt the **same** provider until a final text turn or a safe stop.
   * Never fails over mid-tool-loop.
   */
  private async runToolOrchestrationLoop(input: {
    organizationId: string;
    session: { id: string; title: string | null };
    timeZone: string;
    event: AiUsageEvent;
    executionToken: string;
    userMessage: AiChatMessage;
    trimmed: string;
    lockedProvider: AiProvider;
    generation: AiGenerateTextResult;
    toolDefinitions: AiToolDefinition[];
    toolContext: AiToolContext;
    clientRequestId: string;
    abort: AbortController;
    heartbeat: HeartbeatHandle;
    totalInputTokens: number;
    totalOutputTokens: number;
  }): Promise<Record<string, unknown>> {
    let generation = input.generation;
    let totalInputTokens = input.totalInputTokens;
    let totalOutputTokens = input.totalOutputTokens;
    let toolRounds = 0;
    let toolInvocations = 0;
    let lockedProvider = input.lockedProvider;
    const {
      organizationId,
      session,
      timeZone,
      event,
      executionToken,
      userMessage,
      trimmed,
      toolDefinitions,
      toolContext,
      clientRequestId,
      abort,
      heartbeat,
    } = input;

    while (this.generationRequestsTools(generation)) {
      if (heartbeat.didLoseOwnership() || abort.signal.aborted) {
        await this.usage.interruptReservation({
          organizationId,
          usageEventId: event.id,
          executionToken,
          metadata: {
            reason: 'ownership_lost_or_aborted_during_tool_loop',
            provider: lockedProvider.id,
            toolRounds,
            toolInvocations,
          },
        });
        await this.afterUnsuccessfulTurn({
          organizationId,
          sessionId: session.id,
          usageEventId: event.id,
          outcome: 'INTERRUPTED',
        });
        return this.reconcileOwnershipLost({
          organizationId,
          sessionId: session.id,
          event,
          providerStatus: lockedProvider.id,
          message:
            'Execution interrupted during tool orchestration; in-flight tool work was not finalized as success.',
        });
      }

      // Reject the entire round before any handler runs (no partial execute).
      const validatedCalls = validateProviderToolCallList(generation.toolCalls);
      if (!validatedCalls.ok) {
        this.logger.warn(
          `AI malformed toolCalls usageEvent=${event.id} code=${validatedCalls.code}`,
        );
        return this.finalizeOrchestrationSafetyStop({
          organizationId,
          session,
          event,
          executionToken,
          userMessage,
          trimmed,
          generation,
          assistantContent: MALFORMED_TOOL_CALLS_ASSISTANT_MESSAGE,
          totalInputTokens,
          totalOutputTokens,
          metadataExtra: {
            malformedToolCalls: true,
            validationCode: validatedCalls.code,
            toolRounds,
            toolInvocations,
          },
        });
      }
      const calls = validatedCalls.calls;

      if (
        toolRounds >= AI_TOOL_MAX_ROUNDS_PER_REQUEST ||
        toolInvocations + calls.length > AI_TOOL_MAX_INVOCATIONS_PER_REQUEST
      ) {
        return this.finalizeToolLimitExceeded({
          organizationId,
          session,
          event,
          executionToken,
          userMessage,
          trimmed,
          generation,
          calls,
          toolRounds,
          toolInvocations,
          totalInputTokens,
          totalOutputTokens,
        });
      }

      toolRounds += 1;

      const executed = await this.executeToolRound({
        calls,
        toolContext,
        signal: abort.signal,
        roundNumber: toolRounds,
      });
      toolInvocations += calls.length;

      if (heartbeat.didLoseOwnership() || abort.signal.aborted) {
        await this.usage.interruptReservation({
          organizationId,
          usageEventId: event.id,
          executionToken,
          metadata: {
            reason: 'ownership_lost_after_tool_execution',
            provider: lockedProvider.id,
            toolRounds,
            toolInvocations,
          },
        });
        await this.afterUnsuccessfulTurn({
          organizationId,
          sessionId: session.id,
          usageEventId: event.id,
          outcome: 'INTERRUPTED',
        });
        return this.reconcileOwnershipLost({
          organizationId,
          sessionId: session.id,
          event,
          providerStatus: lockedProvider.id,
          message:
            'Ownership lost after tool execution; results were not committed under a confirmed lease.',
        });
      }

      const persistenceCheck = validateToolRoundForPersistence({
        toolCalls: calls,
        toolResults: executed,
        roundNumber: toolRounds,
      });
      if (!persistenceCheck.ok) {
        this.logger.warn(
          `AI tool round persistence rejected usageEvent=${event.id} code=${persistenceCheck.code}`,
        );
        return this.finalizeOrchestrationSafetyStop({
          organizationId,
          session,
          event,
          executionToken,
          userMessage,
          trimmed,
          generation,
          assistantContent: TOOL_ROUND_PERSISTENCE_ASSISTANT_MESSAGE,
          totalInputTokens,
          totalOutputTokens,
          metadataExtra: {
            toolRoundPersistenceRejected: true,
            validationCode: persistenceCheck.code,
            toolRounds,
            toolInvocations,
          },
        });
      }

      const appended = await this.usage.appendToolRoundWhilePending({
        organizationId,
        usageEventId: event.id,
        executionToken,
        sessionId: session.id,
        provider: generation.provider,
        model: generation.model,
        assistantContent: generation.content ?? '',
        toolCalls: calls as unknown as Prisma.InputJsonValue,
        toolResults: executed.map((row) => ({
          toolCallId: row.toolCallId,
          toolName: row.toolName,
          content: row.content,
        })),
        roundNumber: toolRounds,
        inputTokensDelta: generation.usage.inputTokens,
        outputTokensDelta: generation.usage.outputTokens,
      });

      if (!appended.ok) {
        return this.reconcileOwnershipLost({
          organizationId,
          sessionId: session.id,
          event,
          providerStatus: lockedProvider.id,
          message:
            'Execution lease was no longer PENDING while persisting tool results.',
        });
      }

      // Subsequent rounds: same provider only — never replay tool rounds elsewhere.
      try {
        const providerMessages = await this.buildProviderMessages({
          organizationId,
          sessionId: session.id,
          timeZone,
        });
        generation = await lockedProvider.generateText({
          model: lockedProvider.defaultModel(),
          messages: providerMessages,
          signal: abort.signal,
          idempotencyKey: `${organizationId}:${clientRequestId}:r${toolRounds}`,
          ...(toolDefinitions.length > 0
            ? { tools: toolDefinitions, toolChoice: 'auto' as const }
            : {}),
        });
        totalInputTokens += generation.usage.inputTokens ?? 0;
        totalOutputTokens += generation.usage.outputTokens ?? 0;
      } catch (error) {
        if (heartbeat.didLoseOwnership()) {
          return this.reconcileOwnershipLost({
            organizationId,
            sessionId: session.id,
            event,
            providerStatus: lockedProvider.id,
            message:
              'Ownership lost during post-tool provider call; not finalized.',
          });
        }

        const decision = classifyChainError(error);
        const resolution = evaluatePostToolProviderFailure(decision);
        const chain = this.providerRouter.resolveExecutionChain();
        const lockedIndex = chain.findIndex((p) => p.id === lockedProvider.id);
        const alternates =
          lockedIndex >= 0 ? chain.slice(lockedIndex + 1) : [];
        const otherProviderConfigured = alternates.length > 0;
        const logFailureClass =
          resolution.failureClass ??
          (decision.kind === 'unexpected' ? 'UNEXPECTED' : 'UNKNOWN');
        const logCode =
          resolution.code ??
          (decision.kind === 'unexpected' ? 'UNKNOWN' : 'UNKNOWN');

        this.logger.warn(
          formatPostToolProviderFailureLog({
            provider: lockedProvider.id,
            model: lockedProvider.defaultModel(),
            toolRounds,
            httpStatus: resolution.httpStatus,
            failureClass: logFailureClass,
            code: logCode,
            fallbackDecision: resolution.fallbackDecision,
            otherProviderConfigured,
            retryAfterSeconds: resolution.providerError?.retryAfterSeconds,
          }),
        );

        // Safe post-tool generation failover: only when the locked provider
        // definitively did not execute, tools are already persisted, and later
        // providers exist. Never re-runs tools; never goes back to earlier providers.
        if (resolution.mayFailover && otherProviderConfigured) {
          const noted = await this.usage.noteProviderAttempt({
            organizationId,
            usageEventId: event.id,
            executionToken,
            attempt: {
              provider: lockedProvider.id,
              model: lockedProvider.defaultModel(),
              attemptNumber: toolRounds + 1,
              failureClass: resolution.failureClass ?? 'DEFINITIVE_REJECTION',
              code: resolution.code ?? 'UNKNOWN',
              httpStatus: resolution.httpStatus,
              transmissionCertainty:
                resolution.providerError?.transmissionCertainty ?? 'rejected',
              at: new Date().toISOString(),
            },
          });
          if (!noted) {
            return this.reconcileOwnershipLost({
              organizationId,
              sessionId: session.id,
              event,
              providerStatus: lockedProvider.id,
              message:
                'Ownership lost while recording post-tool provider attempt; failover stopped.',
            });
          }

          let lastFailoverError: AiProviderError | null =
            resolution.providerError;
          let recovered: AiGenerateTextResult | null = null;
          let recoveredProvider: AiProvider | null = null;

          for (const alternate of alternates) {
            if (heartbeat.didLoseOwnership() || abort.signal.aborted) {
              break;
            }
            this.logger.warn(
              `AI phase=post_tool_failover fallback=attempted from=${lockedProvider.id} to=${alternate.id} toolRounds=${toolRounds}`,
            );
            try {
              const providerMessages = await this.buildProviderMessages({
                organizationId,
                sessionId: session.id,
                timeZone,
              });
              const nextGeneration = await alternate.generateText({
                model: alternate.defaultModel(),
                messages: providerMessages,
                signal: abort.signal,
                idempotencyKey: `${organizationId}:${clientRequestId}:r${toolRounds}:${alternate.id}`,
                ...(toolDefinitions.length > 0
                  ? { tools: toolDefinitions, toolChoice: 'auto' as const }
                  : {}),
              });
              recovered = nextGeneration;
              recoveredProvider = alternate;
              break;
            } catch (altError) {
              if (heartbeat.didLoseOwnership()) {
                break;
              }
              const altDecision = classifyChainError(altError);
              const altResolution =
                evaluatePostToolProviderFailure(altDecision);
              lastFailoverError = altResolution.providerError;
              this.logger.warn(
                formatPostToolProviderFailureLog({
                  provider: alternate.id,
                  model: alternate.defaultModel(),
                  toolRounds,
                  httpStatus: altResolution.httpStatus,
                  failureClass:
                    altResolution.failureClass ??
                    (altDecision.kind === 'unexpected'
                      ? 'UNEXPECTED'
                      : 'UNKNOWN'),
                  code:
                    altResolution.code ??
                    (altDecision.kind === 'unexpected' ? 'UNKNOWN' : 'UNKNOWN'),
                  fallbackDecision: altResolution.mayFailover
                    ? POST_TOOL_FALLBACK_ELIGIBLE
                    : altResolution.fallbackDecision,
                  otherProviderConfigured: true,
                  phase: 'post_tool_failover',
                  retryAfterSeconds:
                    altResolution.providerError?.retryAfterSeconds,
                }),
              );

              if (!altResolution.mayFailover) {
                return this.finalizePostToolFailure({
                  organizationId,
                  sessionId: session.id,
                  event,
                  executionToken,
                  userMessage,
                  lockedProviderId: alternate.id,
                  toolRounds,
                  toolInvocations,
                  resolution: altResolution,
                  otherProviderConfigured: true,
                  failoverBlocked: !altResolution.mayFailover,
                });
              }

              const altNoted = await this.usage.noteProviderAttempt({
                organizationId,
                usageEventId: event.id,
                executionToken,
                attempt: {
                  provider: alternate.id,
                  model: alternate.defaultModel(),
                  attemptNumber: toolRounds + 1,
                  failureClass:
                    altResolution.failureClass ?? 'DEFINITIVE_REJECTION',
                  code: altResolution.code ?? 'UNKNOWN',
                  httpStatus: altResolution.httpStatus,
                  transmissionCertainty:
                    altResolution.providerError?.transmissionCertainty ??
                    'rejected',
                  at: new Date().toISOString(),
                },
              });
              if (!altNoted) {
                return this.reconcileOwnershipLost({
                  organizationId,
                  sessionId: session.id,
                  event,
                  providerStatus: alternate.id,
                  message:
                    'Ownership lost while recording post-tool failover attempt.',
                });
              }
            }
          }

          if (recovered && recoveredProvider) {
            if (heartbeat.didLoseOwnership()) {
              return this.reconcileOwnershipLost({
                organizationId,
                sessionId: session.id,
                event,
                providerStatus: recoveredProvider.id,
                message:
                  'Ownership lost after post-tool failover generation; not finalized.',
              });
            }
            this.logger.warn(
              `AI phase=post_tool_failover fallback=succeeded provider=${recoveredProvider.id} toolRounds=${toolRounds}`,
            );
            lockedProvider = recoveredProvider;
            generation = recovered;
            totalInputTokens += generation.usage.inputTokens ?? 0;
            totalOutputTokens += generation.usage.outputTokens ?? 0;
            continue;
          }

          if (heartbeat.didLoseOwnership()) {
            return this.reconcileOwnershipLost({
              organizationId,
              sessionId: session.id,
              event,
              providerStatus: lockedProvider.id,
              message:
                'Ownership lost during post-tool failover; not finalized.',
            });
          }

          const exhausted = resolvePostToolFailoverExhausted(lastFailoverError);
          this.logger.warn(
            formatPostToolProviderFailureLog({
              provider: lockedProvider.id,
              model: lockedProvider.defaultModel(),
              toolRounds,
              httpStatus: exhausted.httpStatus,
              failureClass: exhausted.failureClass ?? 'DEFINITIVE_REJECTION',
              code: exhausted.code ?? 'UNKNOWN',
              fallbackDecision: POST_TOOL_FALLBACK_EXHAUSTED,
              otherProviderConfigured: true,
              phase: 'post_tool_failover',
            }),
          );
          return this.finalizePostToolFailure({
            organizationId,
            sessionId: session.id,
            event,
            executionToken,
            userMessage,
            lockedProviderId: lockedProvider.id,
            toolRounds,
            toolInvocations,
            resolution: exhausted,
            otherProviderConfigured: true,
            failoverBlocked: false,
          });
        }

        if (resolution.mayFailover && !otherProviderConfigured) {
          this.logger.warn(
            `AI phase=post_tool fallback=skipped reason=no_alternate provider=${lockedProvider.id} decision=${POST_TOOL_FALLBACK_ELIGIBLE}`,
          );
        } else if (!resolution.mayFailover) {
          this.logger.warn(
            `AI phase=post_tool fallback=skipped reason=safety provider=${lockedProvider.id} decision=${resolution.fallbackDecision}`,
          );
        }

        return this.finalizePostToolFailure({
          organizationId,
          sessionId: session.id,
          event,
          executionToken,
          userMessage,
          lockedProviderId: lockedProvider.id,
          toolRounds,
          toolInvocations,
          resolution: {
            ...resolution,
            fallbackDecision: resolution.mayFailover
              ? POST_TOOL_FALLBACK_EXHAUSTED
              : resolution.fallbackDecision === POST_TOOL_FALLBACK_ELIGIBLE
                ? POST_TOOL_FALLBACK_BLOCKED
                : resolution.fallbackDecision,
          },
          otherProviderConfigured,
          failoverBlocked: !resolution.mayFailover,
        });
      }
    }

    if (heartbeat.didLoseOwnership()) {
      return this.reconcileOwnershipLost({
        organizationId,
        sessionId: session.id,
        event,
        providerStatus: lockedProvider.id,
        message:
          'Ownership lost before finalizing assistant text; stale token will not finalize.',
      });
    }

    return this.finalizeSuccessfulTurn({
      organizationId,
      session,
      event,
      executionToken,
      userMessage,
      trimmed,
      generation,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });
  }

  private generationRequestsTools(generation: AiGenerateTextResult): boolean {
    return Array.isArray(generation.toolCalls) && generation.toolCalls.length > 0;
  }

  private async executeToolRound(input: {
    calls: AiToolCall[];
    toolContext: AiToolContext;
    signal: AbortSignal;
    roundNumber: number;
  }): Promise<ToolRoundResultRow[]> {
    const { calls, toolContext, signal, roundNumber } = input;
    const results: ToolRoundResultRow[] = new Array(calls.length);

    let nextIndex = 0;
    const workerCount = Math.min(
      AI_TOOL_MAX_CONCURRENT_PER_ROUND,
      Math.max(1, calls.length),
    );

    const runOne = async (index: number) => {
      const call = calls[index]!;
      const execution = await this.toolExecutor.execute({
        toolName: call.name,
        arguments: call.arguments,
        context: toolContext,
        signal,
      });

      const content = execution.ok
        ? serializeToolResultContent({
            ok: true,
            data: execution.data,
            maxBytes: AI_TOOL_PERSISTED_RESULT_MAX_BYTES,
          })
        : serializeToolResultContent({
            ok: false,
            error: execution.error,
            maxBytes: AI_TOOL_PERSISTED_RESULT_MAX_BYTES,
          });

      results[index] = {
        toolCallId: call.id,
        toolName: call.name,
        content,
        roundNumber,
      };
    };

    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= calls.length) return;
        await runOne(index);
      }
    });
    await Promise.all(workers);
    return results;
  }

  /**
   * Terminalize with a safe assistant message without persisting a tool-call
   * group. Used for malformed provider toolCalls or rejected persistence checks.
   */
  private async finalizeOrchestrationSafetyStop(input: {
    organizationId: string;
    session: { id: string; title: string | null };
    event: AiUsageEvent;
    executionToken: string;
    userMessage: AiChatMessage;
    trimmed: string;
    generation: AiGenerateTextResult;
    assistantContent: string;
    totalInputTokens: number;
    totalOutputTokens: number;
    metadataExtra: Record<string, unknown>;
  }) {
    return this.finalizeSuccessfulTurn({
      organizationId: input.organizationId,
      session: input.session,
      event: input.event,
      executionToken: input.executionToken,
      userMessage: input.userMessage,
      trimmed: input.trimmed,
      generation: {
        ...input.generation,
        content: input.assistantContent,
        finishReason: 'stop',
        toolCalls: undefined,
      },
      inputTokens: input.totalInputTokens,
      outputTokens: input.totalOutputTokens,
      metadataExtra: input.metadataExtra,
    });
  }

  private async finalizeToolLimitExceeded(input: {
    organizationId: string;
    session: { id: string; title: string | null };
    event: AiUsageEvent;
    executionToken: string;
    userMessage: AiChatMessage;
    trimmed: string;
    generation: AiGenerateTextResult;
    calls: AiToolCall[];
    toolRounds: number;
    toolInvocations: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  }) {
    const limitRoundNumber = input.toolRounds + 1;
    const syntheticResults: ToolRoundResultRow[] = input.calls.map((call) => ({
      toolCallId: call.id,
      toolName: call.name,
      content: serializeToolResultContent({
        ok: false,
        error: {
          code: 'EXECUTION_FAILED',
          message:
            'Tool execution limit reached for this request; this call was not executed.',
        },
        maxBytes: AI_TOOL_PERSISTED_RESULT_MAX_BYTES,
      }),
      roundNumber: limitRoundNumber,
    }));

    const persistenceCheck = validateToolRoundForPersistence({
      toolCalls: input.calls,
      toolResults: syntheticResults,
      roundNumber: limitRoundNumber,
    });
    if (!persistenceCheck.ok) {
      this.logger.warn(
        `AI tool limit synthetic persistence rejected usageEvent=${input.event.id} code=${persistenceCheck.code}`,
      );
      return this.finalizeOrchestrationSafetyStop({
        organizationId: input.organizationId,
        session: input.session,
        event: input.event,
        executionToken: input.executionToken,
        userMessage: input.userMessage,
        trimmed: input.trimmed,
        generation: input.generation,
        assistantContent: TOOL_LIMIT_ASSISTANT_MESSAGE,
        totalInputTokens: input.totalInputTokens,
        totalOutputTokens: input.totalOutputTokens,
        metadataExtra: {
          toolLimitExceeded: true,
          toolRoundPersistenceRejected: true,
          validationCode: persistenceCheck.code,
          toolRounds: input.toolRounds,
          toolInvocations: input.toolInvocations,
        },
      });
    }

    const appended = await this.usage.appendToolRoundWhilePending({
      organizationId: input.organizationId,
      usageEventId: input.event.id,
      executionToken: input.executionToken,
      sessionId: input.session.id,
      provider: input.generation.provider,
      model: input.generation.model,
      assistantContent: input.generation.content ?? '',
      toolCalls: input.calls as unknown as Prisma.InputJsonValue,
      toolResults: syntheticResults.map((row) => ({
        toolCallId: row.toolCallId,
        toolName: row.toolName,
        content: row.content,
      })),
      roundNumber: limitRoundNumber,
      inputTokensDelta: input.generation.usage.inputTokens,
      outputTokensDelta: input.generation.usage.outputTokens,
    });

    if (!appended.ok) {
      return this.reconcileOwnershipLost({
        organizationId: input.organizationId,
        sessionId: input.session.id,
        event: input.event,
        providerStatus: input.generation.provider,
        message:
          'Execution lease lost while recording tool-limit acknowledgment.',
      });
    }

    // `totalInputTokens` / `totalOutputTokens` already include this generation.
    return this.finalizeSuccessfulTurn({
      organizationId: input.organizationId,
      session: input.session,
      event: input.event,
      executionToken: input.executionToken,
      userMessage: input.userMessage,
      trimmed: input.trimmed,
      generation: {
        ...input.generation,
        content: TOOL_LIMIT_ASSISTANT_MESSAGE,
        finishReason: 'stop',
        toolCalls: undefined,
      },
      inputTokens: input.totalInputTokens,
      outputTokens: input.totalOutputTokens,
      metadataExtra: {
        toolLimitExceeded: true,
        toolRounds: input.toolRounds,
        toolInvocations: input.toolInvocations,
        maxRounds: AI_TOOL_MAX_ROUNDS_PER_REQUEST,
        maxInvocations: AI_TOOL_MAX_INVOCATIONS_PER_REQUEST,
      },
    });
  }

  private async finalizeSuccessfulTurn(input: {
    organizationId: string;
    session: { id: string; title: string | null };
    event: AiUsageEvent;
    executionToken: string;
    userMessage: AiChatMessage;
    trimmed: string;
    generation: AiGenerateTextResult;
    inputTokens?: number;
    outputTokens?: number;
    metadataExtra?: Record<string, unknown>;
  }) {
    const {
      organizationId,
      session,
      event,
      executionToken,
      userMessage,
      trimmed,
      generation,
    } = input;

    const sessionTitle = session.title?.trim()
      ? session.title
      : trimmed.slice(0, 80) || null;

    const inputTokens =
      input.inputTokens ?? generation.usage.inputTokens ?? null;
    const outputTokens =
      input.outputTokens ?? generation.usage.outputTokens ?? null;

    const completed = await this.usage.completeTurnAtomically({
      organizationId,
      usageEventId: event.id,
      executionToken,
      sessionId: session.id,
      userMessageId: userMessage.id,
      assistantContent: generation.content,
      provider: generation.provider,
      model: generation.model,
      inputTokens,
      outputTokens,
      finishReason: generation.finishReason,
      sessionTitle,
      nonBillableStub: generation.provider === 'stub',
      metadata: {
        finishReason: generation.finishReason,
        provider: generation.provider,
        stub: generation.provider === 'stub',
        nonBillable: generation.provider === 'stub',
        ...(input.metadataExtra ?? {}),
      },
    });

    if (!completed.ok) {
      return this.reconcileOwnershipLost({
        organizationId,
        sessionId: session.id,
        event,
        providerStatus: generation.provider,
        message:
          'Execution lease was no longer PENDING; provider work must not be assumed successful.',
      });
    }

    return {
      sessionId: session.id,
      execution: 'COMPLETED' as const,
      usageEvent: {
        id: event.id,
        clientRequestId: event.clientRequestId,
        status: completed.status,
      },
      result: completed.resultPayload,
      userMessage,
      assistantMessage: completed.assistantMessage,
      providerStatus: generation.provider,
      ...(generation.provider === 'stub'
        ? {
            message:
              'Development stub response — not counted toward AI task quota.',
          }
        : {}),
    };
  }

  /**
   * Terminalize a post-tool generation failure. Does not re-execute tools.
   * Preserves partial-completion user copy from the resolution.
   */
  private async finalizePostToolFailure(input: {
    organizationId: string;
    sessionId: string;
    event: AiUsageEvent;
    executionToken: string;
    userMessage: AiChatMessage;
    lockedProviderId: string;
    toolRounds: number;
    toolInvocations: number;
    resolution: PostToolFailureResolution;
    otherProviderConfigured: boolean;
    failoverBlocked: boolean;
  }): Promise<Record<string, unknown>> {
    const { resolution } = input;
    const metadata = {
      reason: resolution.metadataReason,
      code: resolution.code,
      provider: input.lockedProviderId,
      toolRounds: input.toolRounds,
      toolInvocations: input.toolInvocations,
      failoverBlocked: input.failoverBlocked,
      fallbackDecision: resolution.fallbackDecision,
      failureClass: resolution.failureClass,
      httpStatus: resolution.httpStatus,
      otherProviderConfigured: input.otherProviderConfigured,
      phase: 'post_tool',
      retryAfterSeconds: resolution.providerError?.retryAfterSeconds ?? null,
    };

    if (resolution.execution === 'INTERRUPTED') {
      await this.usage.interruptReservation({
        organizationId: input.organizationId,
        usageEventId: input.event.id,
        executionToken: input.executionToken,
        metadata,
      });
      await this.afterUnsuccessfulTurn({
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        usageEventId: input.event.id,
        outcome: 'INTERRUPTED',
      });
      return {
        sessionId: input.sessionId,
        execution: 'INTERRUPTED' as const,
        usageEvent: {
          id: input.event.id,
          clientRequestId: input.event.clientRequestId,
          status: AiUsageStatus.INTERRUPTED,
        },
        userMessage: input.userMessage,
        providerStatus: input.lockedProviderId,
        message: resolution.userMessage,
        failureClass: resolution.failureClass,
        fallbackEligible: false,
      };
    }

    await this.usage.failReservation({
      organizationId: input.organizationId,
      usageEventId: input.event.id,
      executionToken: input.executionToken,
      metadata,
    });
    await this.afterUnsuccessfulTurn({
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      usageEventId: input.event.id,
      outcome: 'FAILED',
    });
    return {
      sessionId: input.sessionId,
      execution: 'FAILED' as const,
      usageEvent: {
        id: input.event.id,
        clientRequestId: input.event.clientRequestId,
        status: AiUsageStatus.FAILED,
      },
      userMessage: input.userMessage,
      providerStatus: input.lockedProviderId,
      message: resolution.userMessage,
      failureClass: resolution.failureClass,
      fallbackEligible: false,
    };
  }

  private async reconcileOwnershipLost(input: {
    organizationId: string;
    sessionId: string;
    event: AiUsageEvent;
    providerStatus: string;
    message: string;
  }) {
    const row = await this.usage.getReservationPublicState({
      organizationId: input.organizationId,
      usageEventId: input.event.id,
    });

    if (!row) {
      await this.afterUnsuccessfulTurn({
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        usageEventId: input.event.id,
        outcome: 'INTERRUPTED',
      });
      return {
        sessionId: input.sessionId,
        execution: 'INTERRUPTED' as const,
        usageEvent: {
          id: input.event.id,
          clientRequestId: input.event.clientRequestId,
          status: AiUsageStatus.INTERRUPTED,
        },
        providerStatus: input.providerStatus,
        message: input.message,
      };
    }

    if (
      row.status === AiUsageStatus.SUCCEEDED ||
      row.status === AiUsageStatus.SKIPPED
    ) {
      return {
        sessionId: input.sessionId,
        execution: 'COMPLETED' as const,
        usageEvent: publicUsageEvent(row),
        result: row.resultPayload,
        providerStatus: row.provider ?? input.providerStatus,
        message: input.message,
      };
    }

    if (row.status === AiUsageStatus.FAILED) {
      await this.afterUnsuccessfulTurn({
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        usageEventId: input.event.id,
        outcome: 'FAILED',
      });
      return {
        sessionId: input.sessionId,
        execution: 'FAILED' as const,
        usageEvent: publicUsageEvent(row),
        providerStatus: row.provider ?? input.providerStatus,
        message: input.message,
      };
    }

    if (row.status === AiUsageStatus.INTERRUPTED) {
      await this.afterUnsuccessfulTurn({
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        usageEventId: input.event.id,
        outcome: 'INTERRUPTED',
      });
      return {
        sessionId: input.sessionId,
        execution: 'INTERRUPTED' as const,
        usageEvent: publicUsageEvent(row),
        providerStatus: row.provider ?? input.providerStatus,
        message: input.message,
      };
    }

    return {
      sessionId: input.sessionId,
      execution: 'IN_PROGRESS' as const,
      usageEvent: publicUsageEvent(row),
      providerStatus: row.provider ?? input.providerStatus,
      message: AI_USER_MESSAGES.OWNERSHIP_IN_PROGRESS,
    };
  }

  /**
   * Build provider messages for every generateText round.
   * Always prepends a fresh trusted system prompt; strips any persisted SYSTEM
   * rows from history so conversation content cannot duplicate or override it.
   */
  private async buildProviderMessages(input: {
    organizationId: string;
    sessionId: string;
    timeZone: string;
  }): Promise<AiChatMessageInput[]> {
    const calendar = this.resolveTrustedCalendar(input.timeZone);
    const loaded = await this.loadConversationMessages(
      input.organizationId,
      input.sessionId,
    );
    const systemContent = buildFieldkeelSystemPrompt({
      timeZone: calendar.timeZone,
      todayYmd: calendar.todayYmd,
      historyTruncated: loaded.truncated,
    });

    // Persisted SYSTEM rows are not used as authority; only the trusted prompt.
    const withoutSystem = loaded.messages.filter((m) => m.role !== 'system');

    return [{ role: 'system', content: systemContent }, ...withoutSystem];
  }

  /**
   * Load the newest session messages, align to complete tool-call groups, and
   * map to provider-neutral history. Source of truth is Postgres (survives
   * refresh / restart); no separate memory store.
   */
  private async loadConversationMessages(
    organizationId: string,
    sessionId: string,
  ): Promise<{ messages: AiChatMessageInput[]; truncated: boolean }> {
    const fetched = await this.prisma.aiChatMessage.findMany({
      where: withTenant(organizationId, { sessionId }),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: HISTORY_FETCH_LIMIT,
      select: {
        id: true,
        role: true,
        content: true,
        toolCalls: true,
        toolCallId: true,
        toolName: true,
        metadata: true,
        createdAt: true,
      },
    });

    const fetchedCapped = fetched.length >= HISTORY_FETCH_LIMIT;

    // Deterministic order when createdAt ties (historySequence from metadata).
    const orderedNewestFirst = [...fetched].sort(
      (a, b) => -compareChatMessageOrder(a, b),
    );

    // Authoritative fail-closed filter: batch-check AiUsageEvent status for any
    // usageEventId tags. excludeFromModelHistory remains an optimization only.
    const usageEventIds = collectUsageEventIdsFromMessages(orderedNewestFirst);
    const usageStatusById = new Map<string, string>();
    if (usageEventIds.length > 0) {
      const events = await this.prisma.aiUsageEvent.findMany({
        where: withTenant(organizationId, { id: { in: usageEventIds } }),
        select: { id: true, status: true },
      });
      for (const event of events) {
        usageStatusById.set(event.id, event.status);
      }
    }

    const forModel = orderedNewestFirst
      .filter((row) =>
        shouldIncludeMessageInModelHistory({
          metadata: row.metadata,
          usageStatusById,
        }),
      )
      .map(({ role, content, toolCalls, toolCallId, toolName }) => ({
        role,
        content,
        toolCalls,
        toolCallId,
        toolName,
      }));

    // Newest-first → oldest-first for reconstruction.
    const oldestFirst = [...forModel].reverse();
    const windowed = windowRecentConversationRows(
      oldestFirst,
      HISTORY_MESSAGE_LIMIT,
    );

    const messages = mapStoredMessagesToProviderInput(windowed.rows, {
      onIncompleteToolGroup: (info) => {
        this.logger.warn(
          `AI history skipped incomplete tool group session=${sessionId} assistantIndex=${info.assistantIndex} expected=${info.expectedCalls} found=${info.foundResults}`,
        );
      },
    });

    return {
      messages,
      // Report truncation when the DB fetch was capped, even if filters shrink rows.
      truncated: fetchedCapped || windowed.truncated,
    };
  }

  /**
   * Resolve organization calendar from trusted membership timezone only.
   * Invalid/missing timezone → unreliable (no silent UTC substitution).
   */
  private resolveTrustedCalendar(timeZoneRaw: string): {
    timeZone: string | null;
    todayYmd: string | null;
  } {
    const trimmed = timeZoneRaw?.trim() ?? '';
    if (!trimmed || !isValidIanaTimeZone(trimmed)) {
      return { timeZone: null, todayYmd: null };
    }
    return {
      timeZone: trimmed,
      todayYmd: formatYmdInZone(this.clock.now(), trimmed),
    };
  }

  async getUsage(organization: OrganizationContext) {
    this.assertCanUseAi(organization);
    await this.assertFeatureEnabled(organization.organizationId);
    return this.usage.summaryForOrganization(organization.organizationId);
  }

  async listProposals(organization: OrganizationContext, userId: string) {
    this.assertCanUseAi(organization);
    await this.assertFeatureEnabled(organization.organizationId);
    return this.proposals.list(organization, userId);
  }

  async decideProposal(
    organization: OrganizationContext,
    userId: string,
    proposalId: string,
    decision: 'APPROVE' | 'REJECT',
    comment?: string,
  ) {
    this.assertCanUseAi(organization);
    await this.assertFeatureEnabled(organization.organizationId);
    return this.proposals.decide(
      organization,
      userId,
      proposalId,
      decision,
      comment,
    );
  }

  /**
   * Mark messages tagged with this usageEventId so provider history skips them.
   * Does not delete rows (auditability). UI may still show the USER text.
   */
  private async excludeUnsuccessfulTurnFromModelHistory(input: {
    organizationId: string;
    sessionId: string;
    usageEventId: string;
    outcome: 'FAILED' | 'INTERRUPTED';
  }) {
    const rows = await this.prisma.aiChatMessage.findMany({
      where: withTenant(input.organizationId, { sessionId: input.sessionId }),
      select: { id: true, metadata: true },
    });

    for (const row of rows) {
      const meta =
        row.metadata &&
        typeof row.metadata === 'object' &&
        !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null;
      if (!meta || meta.usageEventId !== input.usageEventId) continue;
      if (meta.excludeFromModelHistory === true) continue;

      await this.prisma.aiChatMessage.update({
        where: { id: row.id },
        data: {
          metadata: {
            ...meta,
            usageEventId: input.usageEventId,
            excludeFromModelHistory: true,
            turnOutcome: input.outcome,
          },
        },
      });
    }
  }

  private async afterUnsuccessfulTurn(input: {
    organizationId: string;
    sessionId: string;
    usageEventId: string;
    outcome: 'FAILED' | 'INTERRUPTED';
  }) {
    try {
      await this.excludeUnsuccessfulTurnFromModelHistory(input);
    } catch {
      this.logger.warn(
        `AI turn history exclusion failed usageEvent=${input.usageEventId} outcome=${input.outcome}`,
      );
    }
  }
}
