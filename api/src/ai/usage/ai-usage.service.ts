import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AI_TASK_RESERVATION_TTL_SECONDS } from '../../common/constants.js';
import type { EnvironmentVariables } from '../../config/env.js';
import {
  AiMessageRole,
  AiUsageStatus,
  Prisma,
  type AiChatMessage,
  type AiUsageEvent,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EntitlementService } from '../../subscription/entitlement.service.js';
import {
  PLAN_FEATURES,
  resolveMaxAiTasksPerMonth,
} from '../../subscription/plan-features.js';
import {
  isPlanLimitReachedException,
  throwPlanLimitReached,
} from '../../subscription/plan-limit.exception.js';
import { UsageService } from '../../subscription/usage.service.js';
import { withTenant } from '../../tenancy/tenant-scope.js';

type Tx = Prisma.TransactionClient;

export type ReserveAiTaskInput = {
  organizationId: string;
  userId: string;
  clientRequestId: string;
  taskKey: string;
  sessionId?: string | null;
  provider?: string;
  model?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Outcome of beginExecution — only START may call providers.
 * executionToken is backend-only; never expose to HTTP clients.
 */
export type AiExecutionBeginResult =
  | {
      kind: 'START';
      event: AiUsageEvent;
      executionToken: string;
    }
  | {
      kind: 'IN_PROGRESS';
      event: AiUsageEvent;
    }
  | {
      kind: 'COMPLETED';
      event: AiUsageEvent;
      result: Prisma.JsonValue | null;
    }
  | {
      kind: 'FAILED';
      event: AiUsageEvent;
    }
  | {
      kind: 'INTERRUPTED';
      event: AiUsageEvent;
    };

/**
 * AI task ledger: atomic monthly reservations, execution ownership, heartbeats.
 *
 * Accounting (see docs/ai-usage-accounting.md):
 * - PENDING + SUCCEEDED count toward the UTC-month limit.
 * - FAILED / INTERRUPTED / SKIPPED do not.
 * - Only the START owner (executionToken) may heartbeat or finalize.
 * - Provider failover policy: docs/ai-provider-failover.md
 */
@Injectable()
export class AiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly usage: UsageService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  reservationTtlSeconds() {
    return (
      this.config.get('AI_TASK_RESERVATION_TTL_SECONDS', { infer: true }) ??
      AI_TASK_RESERVATION_TTL_SECONDS
    );
  }

  private leaseExpiresAt(from = new Date()) {
    return new Date(from.getTime() + this.reservationTtlSeconds() * 1000);
  }

  assertTaskAvailable(organizationId: string, actorUserId: string) {
    return this.usage.assertAiTaskAvailable(organizationId, {
      actorUserId,
    });
  }

  utcMonthStart(now = new Date()) {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
  }

  async countTowardLimit(
    organizationId: string,
    now = new Date(),
    tx?: Tx,
  ) {
    const db = tx ?? this.prisma;
    const start = this.utcMonthStart(now);
    return db.aiUsageEvent.count({
      where: {
        organizationId,
        createdAt: { gte: start },
        OR: [
          { status: AiUsageStatus.SUCCEEDED },
          {
            status: AiUsageStatus.PENDING,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        ],
      },
    });
  }

  /**
   * Recover abandoned PENDING leases (expiresAt past). Actively heartbeating
   * executions keep expiresAt in the future and are not touched.
   * Preserves prior metadata keys while recording recovery.
   */
  async expireStaleReservations(
    organizationId: string,
    tx?: Tx,
    now = new Date(),
  ) {
    const db = tx ?? this.prisma;
    const stale = await db.aiUsageEvent.findMany({
      where: {
        organizationId,
        status: AiUsageStatus.PENDING,
        expiresAt: { lte: now },
      },
      select: { id: true, metadata: true, sessionId: true },
    });
    let count = 0;
    for (const row of stale) {
      const prevMeta = this.asMetaObject(row.metadata);
      const updated = await db.aiUsageEvent.updateMany({
        where: {
          id: row.id,
          organizationId,
          status: AiUsageStatus.PENDING,
          expiresAt: { lte: now },
        },
        data: {
          status: AiUsageStatus.INTERRUPTED,
          executionToken: null,
          expiresAt: null,
          metadata: {
            ...prevMeta,
            recovery: 'expired_pending_reservation',
            recoveredAt: now.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      if (updated.count > 0) {
        count += updated.count;
        await this.excludeTurnMessagesFromModelHistory(db, {
          organizationId,
          sessionId: row.sessionId,
          usageEventId: row.id,
          outcome: 'INTERRUPTED',
        });
      }
    }
    return count;
  }

  /**
   * If a PENDING row is past expiresAt, mark INTERRUPTED under the same
   * ownership-safe predicates (status still PENDING + expired). Does not
   * re-execute providers. Fresh non-expired PENDING stays IN_PROGRESS.
   */
  private async resolveExistingReservation(
    event: AiUsageEvent,
    organizationId: string,
    now: Date,
    tx?: Tx,
  ): Promise<AiExecutionBeginResult> {
    const expiredPending =
      event.status === AiUsageStatus.PENDING &&
      event.expiresAt != null &&
      event.expiresAt.getTime() <= now.getTime();

    if (!expiredPending) {
      return this.mapExisting(event);
    }

    const db = tx ?? this.prisma;
    const prevMeta = this.asMetaObject(event.metadata);
    const updated = await db.aiUsageEvent.updateMany({
      where: {
        id: event.id,
        organizationId,
        status: AiUsageStatus.PENDING,
        expiresAt: { lte: now },
      },
      data: {
        status: AiUsageStatus.INTERRUPTED,
        executionToken: null,
        expiresAt: null,
        metadata: {
          ...prevMeta,
          recovery: 'expired_pending_on_client_request_lookup',
          recoveredAt: now.toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    if (updated.count > 0) {
      await this.excludeTurnMessagesFromModelHistory(db, {
        organizationId,
        sessionId: event.sessionId,
        usageEventId: event.id,
        outcome: 'INTERRUPTED',
      });
    }

    const refreshed = await db.aiUsageEvent.findFirst({
      where: { id: event.id, organizationId },
    });
    if (!refreshed) {
      return { kind: 'INTERRUPTED', event };
    }
    return this.mapExisting(refreshed);
  }

  /**
   * Mark chat rows tagged with usageEventId so provider history skips them.
   * Does not delete (audit). No-op when sessionId is missing.
   */
  private async excludeTurnMessagesFromModelHistory(
    db: Tx | PrismaService,
    input: {
      organizationId: string;
      sessionId: string | null;
      usageEventId: string;
      outcome: 'FAILED' | 'INTERRUPTED';
    },
  ) {
    if (!input.sessionId) return;

    const rows = await db.aiChatMessage.findMany({
      where: withTenant(input.organizationId, {
        sessionId: input.sessionId,
      }),
      select: { id: true, metadata: true },
    });

    for (const row of rows) {
      const meta = this.asMetaObject(row.metadata);
      if (meta.usageEventId !== input.usageEventId) continue;
      if (meta.excludeFromModelHistory === true) continue;

      await db.aiChatMessage.update({
        where: { id: row.id },
        data: {
          metadata: {
            ...meta,
            usageEventId: input.usageEventId,
            excludeFromModelHistory: true,
            turnOutcome: input.outcome,
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  private asMetaObject(
    metadata: Prisma.JsonValue | null | undefined,
  ): Record<string, unknown> {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return { ...(metadata as Record<string, unknown>) };
    }
    return {};
  }

  private mapExisting(event: AiUsageEvent): AiExecutionBeginResult {
    if (event.status === AiUsageStatus.PENDING) {
      return { kind: 'IN_PROGRESS', event };
    }
    if (event.status === AiUsageStatus.SUCCEEDED) {
      return {
        kind: 'COMPLETED',
        event,
        result: event.resultPayload ?? null,
      };
    }
    // Non-billable stub / skip path still returns stored payload for idempotent retries.
    if (event.status === AiUsageStatus.SKIPPED) {
      return {
        kind: 'COMPLETED',
        event,
        result: event.resultPayload ?? null,
      };
    }
    if (event.status === AiUsageStatus.FAILED) {
      return { kind: 'FAILED', event };
    }
    return { kind: 'INTERRUPTED', event };
  }

  /**
   * Atomically reserve + claim execution ownership for a clientRequestId.
   * Only kind=START includes executionToken and may initiate provider work.
   */
  async beginExecution(
    input: ReserveAiTaskInput,
  ): Promise<AiExecutionBeginResult> {
    const entitlement = await this.entitlements.evaluate(input.organizationId);
    const features = this.entitlements.featuresForPlan(entitlement.plan);
    if (!features[PLAN_FEATURES.AI_WORKFORCE]) {
      throw new ForbiddenException(
        'AI Workforce is not included on your current plan.',
      );
    }
    const limit = resolveMaxAiTasksPerMonth(entitlement.plan.features);
    const now = new Date();
    const expiresAt = this.leaseExpiresAt(now);
    const id = randomUUID();
    const executionToken = randomUUID();

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM "Organization" WHERE id = ${input.organizationId}::uuid FOR UPDATE
        `;

        const existing = await tx.aiUsageEvent.findFirst({
          where: {
            organizationId: input.organizationId,
            clientRequestId: input.clientRequestId,
            userId: input.userId,
          },
        });
        if (existing) {
          // Same id against a different session must not replay another chat's result.
          if (
            input.sessionId &&
            existing.sessionId &&
            existing.sessionId !== input.sessionId
          ) {
            throw new ConflictException(
              'This clientRequestId cannot be used for a new request.',
            );
          }
          // Expire-then-map so abandoned leases are not stuck as IN_PROGRESS.
          return this.resolveExistingReservation(
            existing,
            input.organizationId,
            now,
            tx,
          );
        }

        // Same clientRequestId under another user — generic conflict (no existence oracle).
        const foreign = await tx.aiUsageEvent.findFirst({
          where: {
            organizationId: input.organizationId,
            clientRequestId: input.clientRequestId,
            NOT: { userId: input.userId },
          },
          select: { id: true },
        });
        if (foreign) {
          throw new ConflictException(
            'This clientRequestId cannot be used for a new request.',
          );
        }

        await this.expireStaleReservations(input.organizationId, tx, now);

        const used = await this.countTowardLimit(
          input.organizationId,
          now,
          tx,
        );
        if (used >= limit) {
          // Do not audit while Organization FOR UPDATE is held — AuditLog FK
          // would wait on a second connection. Throw; audit after commit/release.
          throwPlanLimitReached({
            limitType: 'AI_TASKS',
            used,
            limit,
            planCode: entitlement.plan.code,
            planName: entitlement.plan.name,
            message: `You've reached the ${limit} AI task limit for this month on your ${entitlement.plan.name} plan.`,
          });
        }

        const event = await tx.aiUsageEvent.create({
          data: {
            id,
            organizationId: input.organizationId,
            userId: input.userId,
            sessionId: input.sessionId ?? null,
            clientRequestId: input.clientRequestId,
            executionToken,
            provider: input.provider ?? 'reserved',
            model: input.model ?? null,
            taskKey: input.taskKey,
            status: AiUsageStatus.PENDING,
            expiresAt,
            metadata: input.metadata,
          },
        });
        return { kind: 'START' as const, event, executionToken };
      });
    } catch (error) {
      if (isPlanLimitReachedException(error)) {
        const body = error.getResponse() as {
          used?: number | string;
          limit?: number | string;
          planCode?: string;
        };
        await this.usage.recordAiLimitBlocked({
          organizationId: input.organizationId,
          actorUserId: input.userId,
          used: body.used ?? limit,
          limit: body.limit ?? limit,
          planCode: body.planCode ?? entitlement.plan.code,
        });
        throw error;
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.aiUsageEvent.findFirst({
          where: {
            organizationId: input.organizationId,
            clientRequestId: input.clientRequestId,
            userId: input.userId,
          },
        });
        if (existing) {
          if (
            input.sessionId &&
            existing.sessionId &&
            existing.sessionId !== input.sessionId
          ) {
            throw new ConflictException(
              'This clientRequestId cannot be used for a new request.',
            );
          }
          return this.resolveExistingReservation(
            existing,
            input.organizationId,
            new Date(),
          );
        }
        const foreign = await this.prisma.aiUsageEvent.findFirst({
          where: {
            organizationId: input.organizationId,
            clientRequestId: input.clientRequestId,
          },
          select: { id: true },
        });
        if (foreign) {
          throw new ConflictException(
            'This clientRequestId cannot be used for a new request.',
          );
        }
      }
      throw error;
    }
  }

  /** @deprecated Prefer beginExecution — kept for soft callers. */
  async reserveTask(input: ReserveAiTaskInput) {
    const outcome = await this.beginExecution(input);
    if (outcome.kind === 'START') {
      return { event: outcome.event, reused: false as const };
    }
    return { event: outcome.event, reused: true as const };
  }

  /**
   * Extend lease while provider work is running. Backend-only; requires
   * executionToken. Cannot extend terminal or foreign-owned rows.
   */
  async heartbeatReservation(input: {
    organizationId: string;
    usageEventId: string;
    executionToken: string;
  }) {
    const now = new Date();
    const updated = await this.prisma.aiUsageEvent.updateMany({
      where: {
        id: input.usageEventId,
        organizationId: input.organizationId,
        status: AiUsageStatus.PENDING,
        executionToken: input.executionToken,
      },
      data: {
        expiresAt: this.leaseExpiresAt(now),
      },
    });
    return updated.count === 1;
  }

  /**
   * PENDING → SUCCEEDED with stored result for idempotent retries.
   * Requires matching executionToken; refuses terminal/foreign ownership.
   */
  async completeReservation(input: {
    organizationId: string;
    usageEventId: string;
    executionToken: string;
    provider?: string;
    model?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    resultPayload?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    const updated = await this.prisma.aiUsageEvent.updateMany({
      where: {
        id: input.usageEventId,
        organizationId: input.organizationId,
        status: AiUsageStatus.PENDING,
        executionToken: input.executionToken,
      },
      data: {
        status: AiUsageStatus.SUCCEEDED,
        provider: input.provider,
        model: input.model ?? undefined,
        inputTokens: input.inputTokens ?? undefined,
        outputTokens: input.outputTokens ?? undefined,
        resultPayload: input.resultPayload,
        metadata: input.metadata,
        expiresAt: null,
        executionToken: null,
      },
    });
    return updated.count === 1;
  }

  /**
   * Atomically persist the assistant turn + token-gated terminalization.
   * If the lease is no longer PENDING with this executionToken, the transaction
   * rolls back and no assistant message is committed.
   */
  async completeTurnAtomically(input: {
    organizationId: string;
    usageEventId: string;
    executionToken: string;
    sessionId: string;
    userMessageId: string;
    assistantContent: string;
    provider: string;
    model: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    finishReason?: string | null;
    sessionTitle?: string | null;
    /**
     * When true, finalize as SKIPPED (non-billable) instead of SUCCEEDED.
     * Used for development stubs and incomplete outcomes that must not hold quota
     * (e.g. tool-execution limit exceeded).
     */
    nonBillable?: boolean;
    /** @deprecated Prefer `nonBillable`. Kept for call-site compatibility. */
    nonBillableStub?: boolean;
    metadata?: Prisma.InputJsonValue;
  }): Promise<
    | {
        ok: true;
        assistantMessage: AiChatMessage;
        resultPayload: Prisma.JsonObject;
        status: typeof AiUsageStatus.SUCCEEDED | typeof AiUsageStatus.SKIPPED;
      }
    | { ok: false }
  > {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const owned = await tx.aiUsageEvent.findFirst({
          where: {
            id: input.usageEventId,
            organizationId: input.organizationId,
            status: AiUsageStatus.PENDING,
            executionToken: input.executionToken,
          },
          select: { id: true },
        });
        if (!owned) {
          return { ok: false as const };
        }

        const nonBillable =
          input.nonBillable === true || input.nonBillableStub === true;

        const assistantMessage = await tx.aiChatMessage.create({
          data: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            role: AiMessageRole.ASSISTANT,
            content: input.assistantContent,
            provider: input.provider,
            model: input.model,
            metadata: {
              kind: 'assistant_final',
              usageEventId: input.usageEventId,
              historySequence: 1,
              finishReason: input.finishReason ?? null,
              stub: input.nonBillableStub === true,
              nonBillable,
              usage: {
                inputTokens: input.inputTokens ?? null,
                outputTokens: input.outputTokens ?? null,
              },
            },
          },
        });

        const resultPayload: Prisma.JsonObject = {
          sessionId: input.sessionId,
          userMessageId: input.userMessageId,
          assistantMessageId: assistantMessage.id,
          assistantContent: input.assistantContent,
          provider: input.provider,
          model: input.model,
          stub: input.nonBillableStub === true,
          nonBillable,
        };

        const terminalStatus = nonBillable
          ? AiUsageStatus.SKIPPED
          : AiUsageStatus.SUCCEEDED;

        const updated = await tx.aiUsageEvent.updateMany({
          where: {
            id: input.usageEventId,
            organizationId: input.organizationId,
            status: AiUsageStatus.PENDING,
            executionToken: input.executionToken,
          },
          data: {
            status: terminalStatus,
            provider: input.provider,
            model: input.model,
            inputTokens: input.inputTokens ?? undefined,
            outputTokens: input.outputTokens ?? undefined,
            resultPayload,
            metadata: input.metadata,
            expiresAt: null,
            executionToken: null,
          },
        });
        if (updated.count !== 1) {
          // Force rollback so the assistant row is not visible.
          throw new Error('AI_TURN_COMPLETION_LOST_OWNERSHIP');
        }

        if (input.sessionTitle !== undefined) {
          await tx.aiChatSession.update({
            where: { id: input.sessionId },
            data: {
              updatedAt: new Date(),
              ...(input.sessionTitle !== null
                ? { title: input.sessionTitle }
                : {}),
            },
          });
        } else {
          await tx.aiChatSession.update({
            where: { id: input.sessionId },
            data: { updatedAt: new Date() },
          });
        }

        return {
          ok: true as const,
          assistantMessage,
          resultPayload,
          status: terminalStatus,
        };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'AI_TURN_COMPLETION_LOST_OWNERSHIP'
      ) {
        return { ok: false };
      }
      throw error;
    }
  }

  /**
   * Persist one assistant tool-call turn + matching TOOL result rows while the
   * reservation remains PENDING under this executionToken. Does not terminalize.
   * Rolls back all inserts if ownership is lost mid-transaction.
   *
   * Used by the tool orchestration loop so history is durable before the next
   * provider round. Never re-executes tools — callers must only append after
   * NestJS has finished the round's executions (or synthetic limit errors).
   */
  async appendToolRoundWhilePending(input: {
    organizationId: string;
    usageEventId: string;
    executionToken: string;
    sessionId: string;
    provider: string;
    model: string;
    assistantContent: string;
    toolCalls: Prisma.InputJsonValue;
    toolResults: Array<{
      toolCallId: string;
      toolName: string;
      content: string;
    }>;
    roundNumber: number;
    inputTokensDelta?: number | null;
    outputTokensDelta?: number | null;
  }): Promise<
    | {
        ok: true;
        assistantMessageId: string;
        toolMessageIds: string[];
      }
    | { ok: false }
  > {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const owned = await tx.aiUsageEvent.findFirst({
          where: {
            id: input.usageEventId,
            organizationId: input.organizationId,
            status: AiUsageStatus.PENDING,
            executionToken: input.executionToken,
          },
        });
        if (!owned) {
          return { ok: false as const };
        }

        // historySequence keeps assistant→tool order when createdAt ties
        // (no schema change; sorted in application code on load).
        const seqBase = input.roundNumber * 1000;
        const assistantMessage = await tx.aiChatMessage.create({
          data: {
            organizationId: input.organizationId,
            sessionId: input.sessionId,
            role: AiMessageRole.ASSISTANT,
            content: input.assistantContent,
            provider: input.provider,
            model: input.model,
            toolCalls: input.toolCalls,
            metadata: {
              kind: 'tool_calls',
              roundNumber: input.roundNumber,
              finishReason: 'tool_calls',
              usageEventId: input.usageEventId,
              historySequence: seqBase,
            },
          },
        });

        const toolMessageIds: string[] = [];
        for (let i = 0; i < input.toolResults.length; i += 1) {
          const result = input.toolResults[i]!;
          const toolMessage = await tx.aiChatMessage.create({
            data: {
              organizationId: input.organizationId,
              sessionId: input.sessionId,
              role: AiMessageRole.TOOL,
              content: result.content,
              toolCallId: result.toolCallId,
              toolName: result.toolName,
              metadata: {
                kind: 'tool_result',
                roundNumber: input.roundNumber,
                usageEventId: input.usageEventId,
                historySequence: seqBase + i + 1,
              },
            },
          });
          toolMessageIds.push(toolMessage.id);
        }

        const prevMeta =
          owned.metadata &&
          typeof owned.metadata === 'object' &&
          !Array.isArray(owned.metadata)
            ? (owned.metadata as Record<string, unknown>)
            : {};

        const priorInput =
          typeof owned.inputTokens === 'number' ? owned.inputTokens : 0;
        const priorOutput =
          typeof owned.outputTokens === 'number' ? owned.outputTokens : 0;
        const nextInput =
          priorInput +
          (typeof input.inputTokensDelta === 'number'
            ? input.inputTokensDelta
            : 0);
        const nextOutput =
          priorOutput +
          (typeof input.outputTokensDelta === 'number'
            ? input.outputTokensDelta
            : 0);

        const updated = await tx.aiUsageEvent.updateMany({
          where: {
            id: input.usageEventId,
            organizationId: input.organizationId,
            status: AiUsageStatus.PENDING,
            executionToken: input.executionToken,
          },
          data: {
            provider: input.provider,
            model: input.model,
            inputTokens: nextInput,
            outputTokens: nextOutput,
            expiresAt: this.leaseExpiresAt(),
            metadata: {
              ...prevMeta,
              lastToolRound: input.roundNumber,
              toolOrchestration: true,
            } as Prisma.InputJsonValue,
          },
        });
        if (updated.count !== 1) {
          throw new Error('AI_TOOL_ROUND_LOST_OWNERSHIP');
        }

        await tx.aiChatSession.update({
          where: { id: input.sessionId },
          data: { updatedAt: new Date() },
        });

        return {
          ok: true as const,
          assistantMessageId: assistantMessage.id,
          toolMessageIds,
        };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'AI_TOOL_ROUND_LOST_OWNERSHIP'
      ) {
        return { ok: false };
      }
      throw error;
    }
  }

  /**
   * Record a skipped/rejected provider attempt without leaving PENDING or
   * clearing executionToken. Used when the owner will try another provider
   * under the same reservation. Extends the lease.
   */
  async noteProviderAttempt(input: {
    organizationId: string;
    usageEventId: string;
    executionToken: string;
    attempt: Prisma.InputJsonValue;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.aiUsageEvent.findFirst({
        where: {
          id: input.usageEventId,
          organizationId: input.organizationId,
          status: AiUsageStatus.PENDING,
          executionToken: input.executionToken,
        },
      });
      if (!row) return false;

      const prevMeta =
        row.metadata &&
        typeof row.metadata === 'object' &&
        !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const priorAttempts = Array.isArray(prevMeta.providerAttempts)
        ? [...prevMeta.providerAttempts]
        : [];
      priorAttempts.push(input.attempt);

      const updated = await tx.aiUsageEvent.updateMany({
        where: {
          id: input.usageEventId,
          organizationId: input.organizationId,
          status: AiUsageStatus.PENDING,
          executionToken: input.executionToken,
        },
        data: {
          metadata: {
            ...prevMeta,
            providerAttempts: priorAttempts,
          } as Prisma.InputJsonValue,
          expiresAt: this.leaseExpiresAt(),
        },
      });
      return updated.count === 1;
    });
  }

  /** Ownership-safe status lookup for HTTP reconciliation (never returns token). */
  async getReservationPublicState(input: {
    organizationId: string;
    usageEventId: string;
  }) {
    return this.prisma.aiUsageEvent.findFirst({
      where: {
        id: input.usageEventId,
        organizationId: input.organizationId,
      },
      select: {
        id: true,
        clientRequestId: true,
        status: true,
        resultPayload: true,
        provider: true,
        model: true,
      },
    });
  }

  async failReservation(input: {
    organizationId: string;
    usageEventId: string;
    executionToken: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const updated = await this.prisma.aiUsageEvent.updateMany({
      where: {
        id: input.usageEventId,
        organizationId: input.organizationId,
        status: AiUsageStatus.PENDING,
        executionToken: input.executionToken,
      },
      data: {
        status: AiUsageStatus.FAILED,
        metadata: input.metadata,
        expiresAt: null,
        executionToken: null,
      },
    });
    return updated.count === 1;
  }

  async interruptReservation(input: {
    organizationId: string;
    usageEventId: string;
    executionToken: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const updated = await this.prisma.aiUsageEvent.updateMany({
      where: {
        id: input.usageEventId,
        organizationId: input.organizationId,
        status: AiUsageStatus.PENDING,
        executionToken: input.executionToken,
      },
      data: {
        status: AiUsageStatus.INTERRUPTED,
        metadata: input.metadata,
        expiresAt: null,
        executionToken: null,
      },
    });
    return updated.count === 1;
  }

  /**
   * PENDING → SKIPPED (non-billable). Used for development stub replies so
   * quota is released and production never treats stub as SUCCEEDED usage.
   * Requires matching executionToken; stores resultPayload for idempotent retries.
   */
  async skipReservation(input: {
    organizationId: string;
    usageEventId: string;
    executionToken: string;
    provider?: string;
    model?: string | null;
    resultPayload?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }) {
    const updated = await this.prisma.aiUsageEvent.updateMany({
      where: {
        id: input.usageEventId,
        organizationId: input.organizationId,
        status: AiUsageStatus.PENDING,
        executionToken: input.executionToken,
      },
      data: {
        status: AiUsageStatus.SKIPPED,
        provider: input.provider,
        model: input.model ?? undefined,
        resultPayload: input.resultPayload,
        metadata: input.metadata,
        expiresAt: null,
        executionToken: null,
      },
    });
    return updated.count === 1;
  }

  /**
   * Load a usage event for the owning user within the org (result retrieval).
   */
  async getOwnedEvent(input: {
    organizationId: string;
    userId: string;
    usageEventId: string;
  }) {
    return this.prisma.aiUsageEvent.findFirst({
      where: withTenant(input.organizationId, {
        id: input.usageEventId,
        userId: input.userId,
      }),
    });
  }

  async summaryForOrganization(organizationId: string) {
    await this.expireStaleReservations(organizationId);
    const summary = await this.usage.getSummary(organizationId);
    const now = new Date();
    const periodResetsAt = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    ).toISOString();
    return {
      enabled: summary.aiTasks.enabled,
      used: summary.aiTasks.used,
      limit: summary.aiTasks.limit,
      remaining: Math.max(0, summary.aiTasks.limit - summary.aiTasks.used),
      planCode: summary.plan.code,
      planName: summary.plan.name,
      /** Next UTC calendar-month boundary when the AI task counter resets. */
      periodResetsAt,
    };
  }

  async listRecent(
    organizationId: string,
    options: { take?: number } = {},
  ) {
    const take = Math.min(Math.max(options.take ?? 20, 1), 100);
    return this.prisma.aiUsageEvent.findMany({
      where: withTenant(organizationId, {}),
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        userId: true,
        sessionId: true,
        clientRequestId: true,
        provider: true,
        model: true,
        taskKey: true,
        inputTokens: true,
        outputTokens: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }
}
