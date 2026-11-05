import { ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { AiJsonObject, AiToolDefinition } from '../../providers/ai-provider.types.js';
import {
  AI_ACTION_TYPES,
  canProposeOrExecute,
  entityTypeForAction,
  isAiActionType,
  summaryForAction,
  type AiActionType,
} from '../../proposals/ai-action.constants.js';
import { AiProposalService } from '../../proposals/ai-proposal.service.js';
import { ClientsService } from '../../../organizations/clients.service.js';
import { JobsService } from '../../../organizations/jobs.service.js';
import { SitesService } from '../../../organizations/sites.service.js';
import { TeamsService } from '../../../organizations/teams.service.js';
import type { OrganizationContext } from '../../../tenancy/request-context.js';
import { AiToolRegistry } from '../ai-tool.registry.js';
import type {
  AiToolContext,
  AiToolExecutionOptions,
  AiToolHandler,
} from '../ai-tool.types.js';

export const PROPOSE_ACTION_TOOL_NAME = 'proposeAction';

export const PROPOSE_ACTION_TOOL_DEFINITION: AiToolDefinition = {
  name: PROPOSE_ACTION_TOOL_NAME,
  description:
    'Propose a FieldKeel mutation for human Approve/Reject. Does NOT apply changes. Use after confirming facts with getJobs/getSchedule/findMissingAccess when needed. actionType must be one of the allow-listed values. For updates/cancels include the target id in payload (jobId, clientId, siteId, or teamId). Always tell the user a manager must approve before anything changes.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['actionType', 'payload'],
    properties: {
      actionType: {
        type: 'string',
        enum: [...AI_ACTION_TYPES],
        description: 'Allow-listed mutation kind.',
      },
      payload: {
        type: 'object',
        description:
          'Action-specific fields. Examples: job.create needs title, clientId, siteId, jobType; job.update/schedule/assign/dispatch/cancel need jobId; client.create needs name; site.create needs clientId, name, addressLine1, city, country; team.create needs name.',
      },
      rationale: {
        type: 'string',
        maxLength: 500,
        description: 'Short reason shown to the human reviewer.',
      },
    },
  },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ProposeActionAiTool implements OnModuleInit {
  constructor(
    private readonly registry: AiToolRegistry,
    private readonly proposals: AiProposalService,
    private readonly jobs: JobsService,
    private readonly clients: ClientsService,
    private readonly sites: SitesService,
    private readonly teams: TeamsService,
  ) {}

  onModuleInit() {
    this.registry.register({
      definition: PROPOSE_ACTION_TOOL_DEFINITION,
      access: 'propose',
      enabled: true,
      handler: this.createHandler(),
    });
  }

  private createHandler(): AiToolHandler {
    return async (args, context, execution) =>
      this.execute(args, context, execution);
  }

  private async execute(
    args: AiJsonObject,
    context: AiToolContext,
    execution: AiToolExecutionOptions,
  ) {
    if (execution.signal.aborted) {
      throw new Error('proposeAction cancelled before start');
    }

    const actionTypeRaw = args.actionType;
    if (typeof actionTypeRaw !== 'string' || !isAiActionType(actionTypeRaw)) {
      throw new Error('Invalid actionType');
    }
    const actionType: AiActionType = actionTypeRaw;

    if (!canProposeOrExecute(context.role, actionType)) {
      throw new ForbiddenException(
        'Your role cannot propose this kind of change.',
      );
    }

    if (
      !args.payload ||
      typeof args.payload !== 'object' ||
      Array.isArray(args.payload)
    ) {
      throw new Error('payload must be an object');
    }
    const payload = { ...(args.payload as Record<string, unknown>) };
    if (typeof args.rationale === 'string' && args.rationale.trim()) {
      payload._rationale = args.rationale.trim().slice(0, 500);
    }

    const orgCtx = this.toOrganizationContext(context);
    const target = await this.resolveTarget(
      orgCtx,
      context.userId,
      actionType,
      payload,
    );

    if (execution.signal.aborted) {
      throw new Error('proposeAction cancelled before create');
    }

    const summary = summaryForAction(actionType, payload);
    const row = await this.proposals.create({
      organizationId: context.organizationId,
      userId: context.userId,
      sessionId: context.sessionId ?? null,
      actionType,
      payload: payload as Prisma.InputJsonValue,
      targetEntityType: entityTypeForAction(actionType),
      targetEntityId: target?.id ?? null,
      expectedTargetUpdatedAt: target?.updatedAt ?? null,
      summary,
    });

    return {
      proposed: true,
      applied: false,
      requiresApproval: true,
      proposalId: row.id,
      actionType,
      summary,
      status: row.status,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      message:
        'Proposal saved as PENDING. A owner/admin/operations manager must Approve before FieldKeel applies the change. Do not claim the change already happened.',
    };
  }

  private async resolveTarget(
    ctx: OrganizationContext,
    actorUserId: string,
    actionType: AiActionType,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; updatedAt: Date } | null> {
    if (actionType === 'job.create') {
      this.requireUuid(payload.clientId, 'clientId');
      this.requireUuid(payload.siteId, 'siteId');
      if (typeof payload.title !== 'string' || !payload.title.trim()) {
        throw new Error('title is required for job.create');
      }
      if (typeof payload.jobType !== 'string' || !payload.jobType.trim()) {
        throw new Error('jobType is required for job.create');
      }
      return null;
    }

    if (actionType.startsWith('job.')) {
      const jobId = this.requireUuid(payload.jobId, 'jobId');
      const job = await this.jobs.get(ctx, actorUserId, jobId);
      return { id: job.id, updatedAt: new Date(job.updatedAt) };
    }

    if (actionType === 'client.create') {
      if (typeof payload.name !== 'string' || !payload.name.trim()) {
        throw new Error('name is required for client.create');
      }
      return null;
    }

    if (actionType.startsWith('client.')) {
      const clientId = this.requireUuid(payload.clientId, 'clientId');
      const client = await this.clients.get(ctx.organizationId, clientId);
      return {
        id: client.id,
        updatedAt: new Date(client.updatedAt),
      };
    }

    if (actionType === 'site.create') {
      this.requireUuid(payload.clientId, 'clientId');
      for (const key of ['name', 'addressLine1', 'city', 'country'] as const) {
        if (typeof payload[key] !== 'string' || !(payload[key] as string).trim()) {
          throw new Error(`${key} is required for site.create`);
        }
      }
      return null;
    }

    if (actionType.startsWith('site.')) {
      const siteId = this.requireUuid(payload.siteId, 'siteId');
      const site = await this.sites.get(ctx.organizationId, siteId);
      return { id: site.id, updatedAt: new Date(site.updatedAt) };
    }

    if (actionType === 'team.create') {
      if (typeof payload.name !== 'string' || !payload.name.trim()) {
        throw new Error('name is required for team.create');
      }
      return null;
    }

    if (actionType.startsWith('team.')) {
      const teamId = this.requireUuid(payload.teamId, 'teamId');
      const team = await this.teams.get(ctx, actorUserId, teamId);
      return { id: team.id, updatedAt: new Date(team.updatedAt) };
    }

    return null;
  }

  private requireUuid(value: unknown, field: string): string {
    if (typeof value !== 'string' || !UUID_RE.test(value)) {
      throw new Error(`${field} must be a UUID`);
    }
    return value;
  }

  private toOrganizationContext(context: AiToolContext): OrganizationContext {
    return {
      organizationId: context.organizationId,
      membershipId: context.membershipId,
      role: context.role,
      name: context.organizationName,
      slug: context.organizationSlug,
      timezone: context.timezone,
      status: 'ACTIVE',
    };
  }
}
