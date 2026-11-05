import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OrganizationRole } from '../../generated/prisma/client.js';
import { AuditService } from '../../audit/audit.service.js';
import { ClientsService } from '../../organizations/clients.service.js';
import type { CreateClientDto } from '../../organizations/dto/create-client.dto.js';
import type { CreateJobDto } from '../../organizations/dto/create-job.dto.js';
import type { CreateSiteDto } from '../../organizations/dto/create-site.dto.js';
import type { CreateTeamDto } from '../../organizations/dto/create-team.dto.js';
import type { CancelJobDto } from '../../organizations/dto/job-action.dto.js';
import type { ScheduleJobDto } from '../../organizations/dto/schedule-job.dto.js';
import type { UpdateClientDto } from '../../organizations/dto/update-client.dto.js';
import type { UpdateJobDto } from '../../organizations/dto/update-job.dto.js';
import type { UpdateSiteDto } from '../../organizations/dto/update-site.dto.js';
import type { UpdateTeamDto } from '../../organizations/dto/update-team.dto.js';
import { JobsService } from '../../organizations/jobs.service.js';
import { ScheduleService } from '../../organizations/schedule.service.js';
import { SitesService } from '../../organizations/sites.service.js';
import { TeamsService } from '../../organizations/teams.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { OrganizationContext } from '../../tenancy/request-context.js';
import { withTenant } from '../../tenancy/tenant-scope.js';
import {
  canProposeOrExecute,
  isAiActionType,
  type AiActionType,
} from './ai-action.constants.js';

function asRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BadRequestException('Proposal payload must be an object.');
  }
  return payload as Record<string, unknown>;
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`Proposal payload.${key} is required.`);
  }
  return value.trim();
}

function optionalUuid(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestException(`Proposal payload.${key} must be a string.`);
  }
  return value;
}

@Injectable()
export class AiProposalExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly schedule: ScheduleService,
    private readonly clients: ClientsService,
    private readonly sites: SitesService,
    private readonly teams: TeamsService,
  ) {}

  assertCanExecute(role: OrganizationRole, actionType: string) {
    if (!isAiActionType(actionType)) {
      throw new BadRequestException(`Unknown AI action type: ${actionType}`);
    }
    if (!canProposeOrExecute(role, actionType)) {
      throw new ForbiddenException(
        'You do not have permission to execute this AI proposed action.',
      );
    }
  }

  /**
   * Re-check optimistic concurrency snapshot when the proposal targeted an existing row.
   */
  async assertTargetNotStale(input: {
    organizationId: string;
    actionType: AiActionType;
    targetEntityType: string | null;
    targetEntityId: string | null;
    expectedTargetUpdatedAt: Date | null;
  }) {
    if (!input.targetEntityId || !input.expectedTargetUpdatedAt) return;

    let current: Date | null = null;
    if (input.targetEntityType === 'Job' || input.actionType.startsWith('job.')) {
      const row = await this.prisma.job.findFirst({
        where: withTenant(input.organizationId, { id: input.targetEntityId }),
        select: { updatedAt: true },
      });
      if (!row) throw new NotFoundException('Target job no longer exists.');
      current = row.updatedAt;
    } else if (
      input.targetEntityType === 'Client' ||
      input.actionType.startsWith('client.')
    ) {
      const row = await this.prisma.client.findFirst({
        where: withTenant(input.organizationId, { id: input.targetEntityId }),
        select: { updatedAt: true },
      });
      if (!row) throw new NotFoundException('Target client no longer exists.');
      current = row.updatedAt;
    } else if (
      input.targetEntityType === 'Site' ||
      input.actionType.startsWith('site.')
    ) {
      const row = await this.prisma.site.findFirst({
        where: withTenant(input.organizationId, { id: input.targetEntityId }),
        select: { updatedAt: true },
      });
      if (!row) throw new NotFoundException('Target site no longer exists.');
      current = row.updatedAt;
    } else if (
      input.targetEntityType === 'Team' ||
      input.actionType.startsWith('team.')
    ) {
      const row = await this.prisma.team.findFirst({
        where: withTenant(input.organizationId, { id: input.targetEntityId }),
        select: { updatedAt: true },
      });
      if (!row) throw new NotFoundException('Target team no longer exists.');
      current = row.updatedAt;
    }

    if (
      current &&
      current.getTime() !== input.expectedTargetUpdatedAt.getTime()
    ) {
      throw new BadRequestException(
        'This proposal is out of date because the record changed. Reject it and propose again.',
      );
    }
  }

  async execute(input: {
    organization: OrganizationContext;
    deciderUserId: string;
    proposalId: string;
    actionType: string;
    payload: unknown;
  }): Promise<{ ok: true; result: unknown } | { ok: false; message: string }> {
    try {
      if (!isAiActionType(input.actionType)) {
        throw new BadRequestException(`Unknown AI action type: ${input.actionType}`);
      }
      this.assertCanExecute(input.organization.role, input.actionType);
      const result = await this.dispatch(
        input.organization,
        input.deciderUserId,
        input.actionType,
        asRecord(input.payload),
      );
      await this.audit.record({
        action: `AI_PROPOSAL_EXECUTED:${input.actionType}`,
        entityType: 'AiProposedAction',
        entityId: input.proposalId,
        organizationId: input.organization.organizationId,
        actorUserId: input.deciderUserId,
        metadata: { actionType: input.actionType },
      });
      return { ok: true, result };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to execute the approved AI proposal.';
      return { ok: false, message };
    }
  }

  private async dispatch(
    ctx: OrganizationContext,
    actorUserId: string,
    actionType: AiActionType,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    switch (actionType) {
      case 'job.create':
        return this.jobs.create(ctx, actorUserId, payload as unknown as CreateJobDto);
      case 'job.update': {
        const jobId = requireString(payload, 'jobId');
        const { jobId: _id, ...dto } = payload;
        return this.jobs.update(ctx, actorUserId, jobId, dto as unknown as UpdateJobDto);
      }
      case 'job.schedule':
      case 'job.assign': {
        const jobId = requireString(payload, 'jobId');
        const { jobId: _id, ...dto } = payload;
        return this.schedule.schedule(
          ctx,
          actorUserId,
          jobId,
          dto as unknown as ScheduleJobDto,
        );
      }
      case 'job.dispatch': {
        const jobId = requireString(payload, 'jobId');
        return this.jobs.dispatch(ctx, actorUserId, jobId);
      }
      case 'job.cancel': {
        const jobId = requireString(payload, 'jobId');
        const reason =
          typeof payload.reason === 'string' ? payload.reason : undefined;
        return this.jobs.cancel(ctx, actorUserId, jobId, {
          reason,
        } as CancelJobDto);
      }
      case 'client.create':
        return this.clients.create(
          ctx,
          payload as unknown as CreateClientDto,
          actorUserId,
        );
      case 'client.update': {
        const clientId = requireString(payload, 'clientId');
        const { clientId: _id, ...dto } = payload;
        return this.clients.update(
          ctx,
          clientId,
          dto as unknown as UpdateClientDto,
          actorUserId,
        );
      }
      case 'client.deactivate': {
        const clientId = requireString(payload, 'clientId');
        return this.clients.deactivate(ctx, clientId, actorUserId);
      }
      case 'site.create': {
        const clientId = requireString(payload, 'clientId');
        const { clientId: _cid, ...dto } = payload;
        return this.sites.create(
          ctx,
          clientId,
          dto as unknown as CreateSiteDto,
          actorUserId,
        );
      }
      case 'site.update': {
        const siteId = requireString(payload, 'siteId');
        const { siteId: _id, ...dto } = payload;
        return this.sites.update(
          ctx,
          siteId,
          dto as unknown as UpdateSiteDto,
          actorUserId,
        );
      }
      case 'site.deactivate': {
        const siteId = requireString(payload, 'siteId');
        return this.sites.deactivate(ctx, siteId, actorUserId);
      }
      case 'team.create':
        return this.teams.create(
          ctx,
          payload as unknown as CreateTeamDto,
          actorUserId,
        );
      case 'team.update': {
        const teamId = requireString(payload, 'teamId');
        const { teamId: _id, ...dto } = payload;
        return this.teams.update(
          ctx,
          teamId,
          dto as unknown as UpdateTeamDto,
          actorUserId,
        );
      }
      case 'team.deactivate': {
        const teamId = requireString(payload, 'teamId');
        return this.teams.deactivate(ctx, teamId, actorUserId);
      }
      default: {
        const _exhaustive: never = actionType;
        void _exhaustive;
        throw new BadRequestException('Unsupported AI action type.');
      }
    }
  }

  /** Helper unused uuid check kept for propose-side validation reuse. */
  requireOptionalTargetId(payload: Record<string, unknown>, key: string) {
    return optionalUuid(payload, key);
  }
}
