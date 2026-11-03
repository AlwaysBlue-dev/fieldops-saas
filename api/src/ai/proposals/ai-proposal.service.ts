import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiProposedActionStatus,
  OrganizationRole,
  type Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { OrganizationContext } from '../../tenancy/request-context.js';
import { withTenant } from '../../tenancy/tenant-scope.js';

/**
 * Decide is limited to owner/admin/ops until proposals carry job-visibility
 * checks. SUPERVISOR is intentionally excluded for now.
 */
const DECIDER_ROLES: ReadonlySet<OrganizationRole> = new Set([
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.OPERATIONS_MANAGER,
]);

export type CreateAiProposalInput = {
  organizationId: string;
  userId: string;
  sessionId?: string | null;
  actionType: string;
  payload: Prisma.InputJsonValue;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  /** Target record updatedAt (or version clock) at proposal time. */
  expectedTargetUpdatedAt?: Date | null;
  expiresAt?: Date | null;
};

/**
 * Stores AI-proposed mutations for human review.
 * Does not execute domain changes in this stage.
 */
@Injectable()
export class AiProposalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAiProposalInput) {
    return this.prisma.aiProposedAction.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        sessionId: input.sessionId ?? null,
        actionType: input.actionType,
        payload: input.payload,
        targetEntityType: input.targetEntityType ?? null,
        targetEntityId: input.targetEntityId ?? null,
        expectedTargetUpdatedAt: input.expectedTargetUpdatedAt ?? null,
        status: AiProposedActionStatus.PENDING,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  /**
   * List proposals created by the current user only.
   * Org-wide listing is deferred until write tools + target visibility exist.
   */
  async list(
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
      select: {
        id: true,
        actionType: true,
        status: true,
        targetEntityType: true,
        targetEntityId: true,
        createdAt: true,
        expiresAt: true,
        decidedAt: true,
        // Omit raw payload from list until a producer + DTO ship.
      },
    });
  }

  async get(organization: OrganizationContext, proposalId: string) {
    const row = await this.prisma.aiProposedAction.findFirst({
      where: withTenant(organization.organizationId, { id: proposalId }),
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  /**
   * Conditional decide: only one concurrent APPROVE/REJECT wins.
   * Requires matching organizationId + id + status PENDING.
   * Does not execute the proposed action.
   */
  async decide(
    organization: OrganizationContext,
    actorUserId: string,
    proposalId: string,
    decision: 'APPROVE' | 'REJECT',
    comment?: string,
  ) {
    if (!DECIDER_ROLES.has(organization.role)) {
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

    const nextStatus =
      decision === 'APPROVE'
        ? AiProposedActionStatus.APPROVED
        : AiProposedActionStatus.REJECTED;

    const updated = await this.prisma.aiProposedAction.updateMany({
      where: {
        id: proposalId,
        organizationId: organization.organizationId,
        status: AiProposedActionStatus.PENDING,
      },
      data: {
        status: nextStatus,
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

    return this.get(organization, proposalId);
  }
}
