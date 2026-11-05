import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiProposedActionStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { OrganizationContext } from '../../tenancy/request-context.js';
import { withTenant } from '../../tenancy/tenant-scope.js';
import {
  AI_PROPOSAL_DECIDER_ROLES,
  AI_PROPOSAL_DEFAULT_TTL_MS,
  canProposeOrExecute,
  entityTypeForAction,
  isAiActionType,
  summaryForAction,
  type AiActionType,
} from './ai-action.constants.js';
import { AiProposalExecutorService } from './ai-proposal-executor.service.js';

export type CreateAiProposalInput = {
  organizationId: string;
  userId: string;
  sessionId?: string | null;
  actionType: AiActionType;
  payload: Prisma.InputJsonValue;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  expectedTargetUpdatedAt?: Date | null;
  expiresAt?: Date | null;
  summary?: string;
};

const LIST_SELECT = {
  id: true,
  actionType: true,
  status: true,
  targetEntityType: true,
  targetEntityId: true,
  createdAt: true,
  expiresAt: true,
  decidedAt: true,
  decidedByUserId: true,
  userId: true,
  sessionId: true,
  executedAt: true,
} as const;

/**
 * Stores AI-proposed mutations for human review and executes on Approve.
 */
@Injectable()
export class AiProposalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: AiProposalExecutorService,
  ) {}

  async create(input: CreateAiProposalInput) {
    if (!isAiActionType(input.actionType)) {
      throw new BadRequestException(`Unknown AI action type: ${input.actionType}`);
    }
    const expiresAt =
      input.expiresAt ?? new Date(Date.now() + AI_PROPOSAL_DEFAULT_TTL_MS);
    const payload =
      typeof input.payload === 'object' &&
      input.payload !== null &&
      !Array.isArray(input.payload)
        ? {
            ...(input.payload as Record<string, unknown>),
            _summary:
              input.summary ??
              summaryForAction(
                input.actionType,
                input.payload as Record<string, unknown>,
              ),
          }
        : input.payload;

    return this.prisma.aiProposedAction.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        sessionId: input.sessionId ?? null,
        actionType: input.actionType,
        payload: payload as Prisma.InputJsonValue,
        targetEntityType:
          input.targetEntityType ?? entityTypeForAction(input.actionType),
        targetEntityId: input.targetEntityId ?? null,
        expectedTargetUpdatedAt: input.expectedTargetUpdatedAt ?? null,
        status: AiProposedActionStatus.PENDING,
        expiresAt,
      },
    });
  }

  async listMine(
    organization: OrganizationContext,
    userId: string,
    options: { status?: AiProposedActionStatus } = {},
  ) {
    return this.prisma.aiProposedAction.findMany({
      where: withTenant(organization.organizationId, {
        userId,
        ...(options.status ? { status: options.status } : {}),
      }),
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: LIST_SELECT,
    });
  }

  /** Org pending queue for OWNER / ADMIN / OPS. */
  async listForReview(
    organization: OrganizationContext,
    options: { status?: AiProposedActionStatus } = {},
  ) {
    if (!AI_PROPOSAL_DECIDER_ROLES.has(organization.role)) {
      throw new ForbiddenException(
        'You do not have permission to review AI proposed actions.',
      );
    }
    return this.prisma.aiProposedAction.findMany({
      where: withTenant(organization.organizationId, {
        status: options.status ?? AiProposedActionStatus.PENDING,
      }),
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: LIST_SELECT,
    });
  }

  /** @deprecated Prefer listMine / listForReview */
  async list(
    organization: OrganizationContext,
    userId: string,
    options: { status?: AiProposedActionStatus } = {},
  ) {
    return this.listMine(organization, userId, options);
  }

  async get(organization: OrganizationContext, proposalId: string) {
    const row = await this.prisma.aiProposedAction.findFirst({
      where: withTenant(organization.organizationId, { id: proposalId }),
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  /**
   * Detail for the requester or a decider. Others get 404 (no cross-user leak).
   */
  async getAuthorized(
    organization: OrganizationContext,
    userId: string,
    proposalId: string,
  ) {
    const row = await this.get(organization, proposalId);
    const isDecider = AI_PROPOSAL_DECIDER_ROLES.has(organization.role);
    if (row.userId !== userId && !isDecider) {
      throw new NotFoundException();
    }
    return this.present(row);
  }

  present(row: {
    id: string;
    organizationId: string;
    userId: string;
    sessionId: string | null;
    actionType: string;
    payload: Prisma.JsonValue;
    targetEntityType: string | null;
    targetEntityId: string | null;
    expectedTargetUpdatedAt: Date | null;
    status: AiProposedActionStatus;
    decidedByUserId: string | null;
    decidedAt: Date | null;
    decisionComment: string | null;
    executedAt: Date | null;
    executionResult: Prisma.JsonValue | null;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const payload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    const summary =
      typeof payload._summary === 'string'
        ? payload._summary
        : isAiActionType(row.actionType)
          ? summaryForAction(row.actionType, payload)
          : row.actionType;

    return {
      id: row.id,
      actionType: row.actionType,
      summary,
      payload,
      status: row.status,
      targetEntityType: row.targetEntityType,
      targetEntityId: row.targetEntityId,
      expectedTargetUpdatedAt: row.expectedTargetUpdatedAt?.toISOString() ?? null,
      userId: row.userId,
      sessionId: row.sessionId,
      decidedByUserId: row.decidedByUserId,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionComment: row.decisionComment,
      executedAt: row.executedAt?.toISOString() ?? null,
      executionResult: row.executionResult,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  presentWithRole(
    row: Awaited<ReturnType<AiProposalService['get']>>,
    organization: OrganizationContext,
  ) {
    const base = this.present(row);
    return {
      ...base,
      canDecide:
        AI_PROPOSAL_DECIDER_ROLES.has(organization.role) &&
        row.status === AiProposedActionStatus.PENDING,
    };
  }

  /**
   * Conditional decide: only one concurrent APPROVE/REJECT wins.
   * APPROVE executes via existing domain services as the decider.
   */
  async decide(
    organization: OrganizationContext,
    actorUserId: string,
    proposalId: string,
    decision: 'APPROVE' | 'REJECT',
    comment?: string,
  ) {
    if (!AI_PROPOSAL_DECIDER_ROLES.has(organization.role)) {
      throw new ForbiddenException(
        'You do not have permission to decide AI proposed actions.',
      );
    }

    const proposal = await this.get(organization, proposalId);

    if (
      proposal.expiresAt &&
      proposal.expiresAt.getTime() <= Date.now() &&
      proposal.status === AiProposedActionStatus.PENDING
    ) {
      await this.prisma.aiProposedAction.updateMany({
        where: {
          id: proposal.id,
          organizationId: organization.organizationId,
          status: AiProposedActionStatus.PENDING,
        },
        data: { status: AiProposedActionStatus.EXPIRED },
      });
      throw new BadRequestException('This proposal has expired.');
    }

    if (proposal.status !== AiProposedActionStatus.PENDING) {
      throw new BadRequestException('This proposal is no longer pending.');
    }

    if (decision === 'REJECT') {
      const updated = await this.prisma.aiProposedAction.updateMany({
        where: {
          id: proposalId,
          organizationId: organization.organizationId,
          status: AiProposedActionStatus.PENDING,
        },
        data: {
          status: AiProposedActionStatus.REJECTED,
          decidedByUserId: actorUserId,
          decidedAt: new Date(),
          decisionComment: comment?.trim() || null,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'This proposal was already decided by another request.',
        );
      }
      return this.presentWithRole(
        await this.get(organization, proposalId),
        organization,
      );
    }

    // APPROVE path
    if (!isAiActionType(proposal.actionType)) {
      throw new BadRequestException('This proposal has an unsupported action type.');
    }
    if (!canProposeOrExecute(organization.role, proposal.actionType)) {
      throw new ForbiddenException(
        'You do not have permission to execute this AI proposed action.',
      );
    }

    try {
      await this.executor.assertTargetNotStale({
        organizationId: organization.organizationId,
        actionType: proposal.actionType,
        targetEntityType: proposal.targetEntityType,
        targetEntityId: proposal.targetEntityId,
        expectedTargetUpdatedAt: proposal.expectedTargetUpdatedAt,
      });
    } catch (error) {
      await this.prisma.aiProposedAction.updateMany({
        where: {
          id: proposalId,
          organizationId: organization.organizationId,
          status: AiProposedActionStatus.PENDING,
        },
        data: {
          status: AiProposedActionStatus.FAILED,
          decidedByUserId: actorUserId,
          decidedAt: new Date(),
          decisionComment: comment?.trim() || null,
          executionResult: {
            ok: false,
            message:
              error instanceof Error
                ? error.message
                : 'Proposal target is stale or missing.',
          },
        },
      });
      return this.presentWithRole(
        await this.get(organization, proposalId),
        organization,
      );
    }

    const claimed = await this.prisma.aiProposedAction.updateMany({
      where: {
        id: proposalId,
        organizationId: organization.organizationId,
        status: AiProposedActionStatus.PENDING,
      },
      data: {
        status: AiProposedActionStatus.APPROVED,
        decidedByUserId: actorUserId,
        decidedAt: new Date(),
        decisionComment: comment?.trim() || null,
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException(
        'This proposal was already decided by another request.',
      );
    }

    const execution = await this.executor.execute({
      organization,
      deciderUserId: actorUserId,
      proposalId,
      actionType: proposal.actionType,
      payload: proposal.payload,
    });

    if (execution.ok) {
      let safeResult: Prisma.InputJsonValue = { ok: true };
      try {
        safeResult = JSON.parse(
          JSON.stringify({ ok: true, result: execution.result }),
        ) as Prisma.InputJsonValue;
      } catch {
        safeResult = { ok: true };
      }
      await this.prisma.aiProposedAction.updateMany({
        where: {
          id: proposalId,
          organizationId: organization.organizationId,
          status: AiProposedActionStatus.APPROVED,
        },
        data: {
          status: AiProposedActionStatus.EXECUTED,
          executedAt: new Date(),
          executionResult: safeResult,
        },
      });
    } else {
      await this.prisma.aiProposedAction.updateMany({
        where: {
          id: proposalId,
          organizationId: organization.organizationId,
          status: AiProposedActionStatus.APPROVED,
        },
        data: {
          status: AiProposedActionStatus.FAILED,
          executedAt: new Date(),
          executionResult: {
            ok: false,
            message: execution.message,
          },
        },
      });
    }

    return this.presentWithRole(
      await this.get(organization, proposalId),
      organization,
    );
  }
}
