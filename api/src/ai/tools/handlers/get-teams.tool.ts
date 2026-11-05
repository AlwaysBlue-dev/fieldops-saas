import { Injectable, OnModuleInit } from '@nestjs/common';
import { EntityStatus } from '../../../generated/prisma/client.js';
import type { ListQueryDto } from '../../../organizations/dto/list-query.dto.js';
import { TeamsService } from '../../../organizations/teams.service.js';
import type { OrganizationContext } from '../../../tenancy/request-context.js';
import type { AiJsonObject, AiToolDefinition } from '../../providers/ai-provider.types.js';
import { AiToolRegistry } from '../ai-tool.registry.js';
import type {
  AiToolContext,
  AiToolExecutionOptions,
  AiToolHandler,
} from '../ai-tool.types.js';

export const GET_TEAMS_MAX_PAGE_SIZE = 50;

const STATUS_VALUES = Object.values(EntityStatus);
const SORT_VALUES = ['name', 'createdAt', 'updatedAt', 'status'] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET_TEAMS_TOOL_NAME = 'getTeams';

export const GET_TEAMS_TOOL_DEFINITION: AiToolDefinition = {
  name: GET_TEAMS_TOOL_NAME,
  description:
    'List/search teams the current user is authorized to see, or fetch one team by id. Use to resolve teamId by name before team.update / team.deactivate / job.assign. Never ask the user for a UUID — call this tool instead. Envelope: teams (page), total, page, pageSize, truncated. Does not create or modify teams.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      teamId: {
        type: 'string',
        description: 'Optional team UUID for a single-team lookup.',
      },
      search: {
        type: 'string',
        maxLength: 200,
        description: 'Case-insensitive search across team name, code, and supervisor name.',
      },
      status: {
        type: 'string',
        enum: [...STATUS_VALUES],
        description: 'Filter by ACTIVE or INACTIVE.',
      },
      page: {
        type: 'integer',
        minimum: 1,
        description: '1-based page index (default 1).',
      },
      pageSize: {
        type: 'integer',
        minimum: 1,
        maximum: GET_TEAMS_MAX_PAGE_SIZE,
        description: `Page size (default 20, max ${GET_TEAMS_MAX_PAGE_SIZE}).`,
      },
      sort: {
        type: 'string',
        enum: [...SORT_VALUES],
        description: 'Sort field (default name).',
      },
      order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (default asc).',
      },
    },
  },
};

@Injectable()
export class GetTeamsAiTool implements OnModuleInit {
  constructor(
    private readonly teams: TeamsService,
    private readonly registry: AiToolRegistry,
  ) {}

  onModuleInit() {
    this.registry.register({
      definition: GET_TEAMS_TOOL_DEFINITION,
      access: 'read',
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
      throw new Error('getTeams cancelled before start');
    }

    const orgCtx = this.toOrganizationContext(context);

    if (args.teamId !== undefined) {
      const teamId = this.requireUuid(args.teamId, 'teamId');
      if (execution.signal.aborted) {
        throw new Error('getTeams cancelled before get');
      }
      const detail = await this.teams.get(orgCtx, context.userId, teamId);
      if (execution.signal.aborted) {
        throw new Error('getTeams cancelled after get');
      }
      return {
        team: this.projectTeam(detail, context.organizationSlug),
      };
    }

    const query = this.toListQuery(args);
    if (execution.signal.aborted) {
      throw new Error('getTeams cancelled before list');
    }
    const listed = await this.teams.list(orgCtx, context.userId, query);
    if (execution.signal.aborted) {
      throw new Error('getTeams cancelled after list');
    }

    const teams = listed.items.map((row) =>
      this.projectTeam(row, context.organizationSlug),
    );
    const fetched = (listed.page - 1) * listed.pageSize + teams.length;
    const truncated = fetched < listed.total;

    return {
      teams,
      total: listed.total,
      page: listed.page,
      pageSize: listed.pageSize,
      truncated,
      appliedFilters: {
        search: query.search ?? null,
        status: query.status ?? null,
      },
    };
  }

  private projectTeam(
    row: {
      id: string;
      name: string;
      code?: string | null;
      status: string;
      memberCount?: number;
      supervisor?: { fullName?: string | null } | null;
    },
    organizationSlug: string,
  ) {
    const supervisorName =
      row.supervisor && typeof row.supervisor.fullName === 'string'
        ? row.supervisor.fullName
        : null;
    return {
      id: row.id,
      name: row.name,
      code: row.code ?? null,
      status: row.status,
      memberCount: row.memberCount ?? null,
      supervisorName,
      deepLink: `/app/${organizationSlug}/teams/${row.id}`,
    };
  }

  private toListQuery(args: AiJsonObject): ListQueryDto {
    const query: ListQueryDto = {};

    if (args.search !== undefined) {
      if (typeof args.search !== 'string' || !args.search.trim()) {
        throw new Error('search must be a non-empty string');
      }
      if (args.search.length > 200) {
        throw new Error('search exceeds 200 characters');
      }
      query.search = args.search.trim();
    }

    if (args.status !== undefined) {
      if (
        typeof args.status !== 'string' ||
        !STATUS_VALUES.includes(args.status as EntityStatus)
      ) {
        throw new Error('Invalid status filter');
      }
      query.status = args.status as EntityStatus;
    }

    if (args.page !== undefined) {
      if (typeof args.page !== 'number' || !Number.isInteger(args.page) || args.page < 1) {
        throw new Error('page must be an integer >= 1');
      }
      query.page = args.page;
    } else {
      query.page = 1;
    }

    if (args.pageSize !== undefined) {
      if (
        typeof args.pageSize !== 'number' ||
        !Number.isInteger(args.pageSize) ||
        args.pageSize < 1 ||
        args.pageSize > GET_TEAMS_MAX_PAGE_SIZE
      ) {
        throw new Error(
          `pageSize must be an integer from 1 to ${GET_TEAMS_MAX_PAGE_SIZE}`,
        );
      }
      query.pageSize = args.pageSize;
    } else {
      query.pageSize = 20;
    }

    if (args.sort !== undefined) {
      if (
        typeof args.sort !== 'string' ||
        !(SORT_VALUES as readonly string[]).includes(args.sort)
      ) {
        throw new Error('Invalid sort');
      }
      query.sort = args.sort as ListQueryDto['sort'];
    }

    if (args.order !== undefined) {
      if (args.order !== 'asc' && args.order !== 'desc') {
        throw new Error('order must be asc or desc');
      }
      query.order = args.order;
    }

    return query;
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

  private requireUuid(value: unknown, field: string): string {
    if (typeof value !== 'string' || !UUID_RE.test(value)) {
      throw new Error(`${field} must be a UUID`);
    }
    return value;
  }
}
