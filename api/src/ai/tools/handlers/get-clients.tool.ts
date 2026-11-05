import { Injectable, OnModuleInit } from '@nestjs/common';
import { EntityStatus } from '../../../generated/prisma/client.js';
import type { ListQueryDto } from '../../../organizations/dto/list-query.dto.js';
import { ClientsService } from '../../../organizations/clients.service.js';
import type {
  AiJsonObject,
  AiJsonValue,
  AiToolDefinition,
} from '../../providers/ai-provider.types.js';
import { AiToolRegistry } from '../ai-tool.registry.js';
import type {
  AiToolContext,
  AiToolExecutionOptions,
  AiToolHandler,
} from '../ai-tool.types.js';

export const GET_CLIENTS_MAX_PAGE_SIZE = 50;

const STATUS_VALUES = Object.values(EntityStatus);
const SORT_VALUES = ['name', 'createdAt', 'updatedAt', 'status'] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET_CLIENTS_TOOL_NAME = 'getClients';

export const GET_CLIENTS_TOOL_DEFINITION: AiToolDefinition = {
  name: GET_CLIENTS_TOOL_NAME,
  description:
    'List/search clients (customers) in the current organization, or fetch one client with sites. Use to resolve clientId by name before site.create / job.create. Never ask the user for a UUID — call this tool instead. Envelope: clients (page), total, page, pageSize, truncated. When clientId is set, returns that client plus sites (id, name, address, city, country, status). Does not create or modify clients.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      clientId: {
        type: 'string',
        description:
          'Optional client UUID. When set, returns that client with its sites (ignores search pagination).',
      },
      search: {
        type: 'string',
        maxLength: 200,
        description:
          'Case-insensitive search across client name, account code, and primary contact fields.',
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
        maximum: GET_CLIENTS_MAX_PAGE_SIZE,
        description: `Page size (default 20, max ${GET_CLIENTS_MAX_PAGE_SIZE}).`,
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
export class GetClientsAiTool implements OnModuleInit {
  constructor(
    private readonly clients: ClientsService,
    private readonly registry: AiToolRegistry,
  ) {}

  onModuleInit() {
    this.registry.register({
      definition: GET_CLIENTS_TOOL_DEFINITION,
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
  ): Promise<AiJsonValue> {
    if (execution.signal.aborted) {
      throw new Error('getClients cancelled before start');
    }

    if (args.clientId !== undefined) {
      const clientId = this.requireUuid(args.clientId, 'clientId');
      if (execution.signal.aborted) {
        throw new Error('getClients cancelled before get');
      }
      const detail = await this.clients.get(context.organizationId, clientId);
      if (execution.signal.aborted) {
        throw new Error('getClients cancelled after get');
      }
      return {
        client: {
          id: detail.id,
          name: detail.name,
          clientCode: detail.clientCode,
          status: detail.status,
          primaryContactName: detail.primaryContactName,
          primaryContactEmail: detail.primaryContactEmail,
          primaryContactPhone: detail.primaryContactPhone,
          siteCount: detail.siteCount,
          jobCount: detail.jobCount,
          deepLink: `/app/${context.organizationSlug}/clients/${detail.id}`,
        },
        sites: (detail.sites ?? []).map((site) => ({
          id: site.id,
          name: site.name,
          status: site.status,
          addressLine1: site.addressLine1,
          city: site.city,
          country: site.country,
          deepLink: `/app/${context.organizationSlug}/clients/${detail.id}`,
        })),
      };
    }

    const query = this.toListQuery(args);
    if (execution.signal.aborted) {
      throw new Error('getClients cancelled before list');
    }
    const listed = await this.clients.list(context.organizationId, query);
    if (execution.signal.aborted) {
      throw new Error('getClients cancelled after list');
    }

    const clients = listed.items.map((row) => ({
      id: row.id,
      name: row.name,
      clientCode: row.clientCode,
      status: row.status,
      primaryContactName: row.primaryContactName,
      siteCount: row.siteCount,
      jobCount: row.jobCount,
      deepLink: `/app/${context.organizationSlug}/clients/${row.id}`,
    }));
    const fetched = (listed.page - 1) * listed.pageSize + clients.length;
    const truncated = fetched < listed.total;

    return {
      clients,
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
        args.pageSize > GET_CLIENTS_MAX_PAGE_SIZE
      ) {
        throw new Error(
          `pageSize must be an integer from 1 to ${GET_CLIENTS_MAX_PAGE_SIZE}`,
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

  private requireUuid(value: unknown, field: string): string {
    if (typeof value !== 'string' || !UUID_RE.test(value)) {
      throw new Error(`${field} must be a UUID`);
    }
    return value;
  }
}
