import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobPriority, JobStatus } from '../../../generated/prisma/client.js';
import { isYmd } from '../../../common/timezone.js';
import type { ListJobsQueryDto } from '../../../organizations/dto/list-jobs-query.dto.js';
import { JobsService } from '../../../organizations/jobs.service.js';
import type { JobSummaryView } from '../../../organizations/jobs-serializer.js';
import type { OrganizationContext } from '../../../tenancy/request-context.js';
import type { AiJsonObject, AiToolDefinition } from '../../providers/ai-provider.types.js';
import { AiToolRegistry } from '../ai-tool.registry.js';
import type {
  AiToolContext,
  AiToolExecutionOptions,
  AiToolHandler,
} from '../ai-tool.types.js';

/** Hard cap for AI getJobs page size (JobsService allows up to 100). */
export const GET_JOBS_MAX_PAGE_SIZE = 50;

const JOB_STATUS_VALUES = Object.values(JobStatus);
const JOB_PRIORITY_VALUES = Object.values(JobPriority);
const PRESET_VALUES = [
  'open',
  'today',
  'unassigned',
  'approval',
  'missing_access',
] as const;
const SORT_VALUES = [
  'jobNumber',
  'scheduledStart',
  'priority',
  'status',
  'updatedAt',
  'createdAt',
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET_JOBS_TOOL_NAME = 'getJobs';

export const GET_JOBS_TOOL_DEFINITION: AiToolDefinition = {
  name: GET_JOBS_TOOL_NAME,
  description:
    'List and search jobs the current user is authorized to see. Use for job lists, filters (status, priority, date, technician, team, client), presets (open/today/unassigned/approval/missing_access), search by job number/title/client/site, paginated summaries, and status/priority breakdowns of returned jobs. Envelope: jobs (page), total (matching count), page, pageSize, truncated (more pages). Use total for matching size — never treat the page length alone as the global total when truncated. Returns job number, title, status, priority, schedule window, client/site, team, technicians, missing-access flags. Does not create or modify jobs. Does not establish technician availability.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: {
        type: 'string',
        enum: [...JOB_STATUS_VALUES],
        description: 'Filter by exact job status.',
      },
      priority: {
        type: 'string',
        enum: [...JOB_PRIORITY_VALUES],
        description: 'Filter by job priority.',
      },
      clientId: {
        type: 'string',
        description: 'Filter by client (customer) UUID.',
      },
      technicianId: {
        type: 'string',
        description: 'Filter by assigned technician user UUID.',
      },
      teamId: {
        type: 'string',
        description: 'Filter by team UUID.',
      },
      date: {
        type: 'string',
        description:
          'Calendar date YYYY-MM-DD in the organization timezone; filters by scheduledStart day.',
      },
      preset: {
        type: 'string',
        enum: [...PRESET_VALUES],
        description:
          'open = non-terminal; today = scheduled today; unassigned; approval = pending approval; missing_access = missing access notes/contact.',
      },
      search: {
        type: 'string',
        maxLength: 200,
        description:
          'Case-insensitive search across job number, title, client name, and site name.',
      },
      unassigned: {
        type: 'boolean',
        description: 'When true, only jobs with no team and no assignments.',
      },
      missingAccess: {
        type: 'boolean',
        description:
          'When true, only jobs missing access notes and/or usable site contact (server rule).',
      },
      page: {
        type: 'integer',
        minimum: 1,
        description: '1-based page index (default 1).',
      },
      pageSize: {
        type: 'integer',
        minimum: 1,
        maximum: GET_JOBS_MAX_PAGE_SIZE,
        description: `Page size (default 20, max ${GET_JOBS_MAX_PAGE_SIZE}).`,
      },
      sort: {
        type: 'string',
        enum: [...SORT_VALUES],
        description: 'Sort field (default scheduledStart).',
      },
      order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (default asc).',
      },
    },
  },
};

type GetJobsProjectedItem = {
  id: string;
  jobNumber: string;
  title: string;
  jobType: string;
  status: string;
  priority: string;
  scheduledStart: string | null;
  expectedFinish: string | null;
  workOrderNumber: string | null;
  client: { id: string; name: string };
  site: { id: string; name: string; city: string | null };
  team: { id: string; name: string } | null;
  supervisor: { userId: string; fullName: string } | null;
  technicians: Array<{ userId: string; fullName: string }>;
  missingAccessInfo: boolean;
  accessInfoReady: boolean;
  missingAccessItems: string[];
  updatedAt: string;
};

@Injectable()
export class GetJobsAiTool implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly registry: AiToolRegistry,
  ) {}

  onModuleInit() {
    this.registry.register({
      definition: GET_JOBS_TOOL_DEFINITION,
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
      throw new Error('getJobs cancelled before start');
    }

    const query = this.toListQuery(args);
    const orgCtx = this.toOrganizationContext(context);

    if (execution.signal.aborted) {
      throw new Error('getJobs cancelled before service call');
    }

    const listed = await this.jobs.list(orgCtx, context.userId, query);

    if (execution.signal.aborted) {
      throw new Error('getJobs cancelled after service call');
    }

    const items = listed.items.map((row) => this.projectJob(row));
    const fetched = (listed.page - 1) * listed.pageSize + items.length;
    const truncated = fetched < listed.total;

    return {
      jobs: items,
      total: listed.total,
      page: listed.page,
      pageSize: listed.pageSize,
      truncated,
      appliedFilters: this.appliedFilters(query),
    };
  }

  private toOrganizationContext(context: AiToolContext): OrganizationContext {
    return {
      organizationId: context.organizationId,
      membershipId: context.membershipId,
      role: context.role,
      name: context.organizationName,
      slug: context.organizationSlug,
      timezone: context.timezone,
      // AI routes already require an active membership/org; list() does not branch on this.
      status: 'ACTIVE',
    };
  }

  private toListQuery(args: AiJsonObject): ListJobsQueryDto {
    const query: ListJobsQueryDto = {};

    if (args.status !== undefined) {
      if (
        typeof args.status !== 'string' ||
        !JOB_STATUS_VALUES.includes(args.status as JobStatus)
      ) {
        throw new Error('Invalid status filter');
      }
      query.status = args.status as JobStatus;
    }

    if (args.priority !== undefined) {
      if (
        typeof args.priority !== 'string' ||
        !JOB_PRIORITY_VALUES.includes(args.priority as JobPriority)
      ) {
        throw new Error('Invalid priority filter');
      }
      query.priority = args.priority as JobPriority;
    }

    if (args.clientId !== undefined) {
      query.clientId = this.requireUuid(args.clientId, 'clientId');
    }
    if (args.technicianId !== undefined) {
      query.technicianId = this.requireUuid(args.technicianId, 'technicianId');
    }
    if (args.teamId !== undefined) {
      query.teamId = this.requireUuid(args.teamId, 'teamId');
    }

    if (args.date !== undefined) {
      if (typeof args.date !== 'string' || !isYmd(args.date)) {
        throw new Error('date must be YYYY-MM-DD');
      }
      query.date = args.date;
    }

    if (args.preset !== undefined) {
      if (
        typeof args.preset !== 'string' ||
        !(PRESET_VALUES as readonly string[]).includes(args.preset)
      ) {
        throw new Error('Invalid preset');
      }
      query.preset = args.preset as ListJobsQueryDto['preset'];
    }

    if (args.search !== undefined) {
      if (typeof args.search !== 'string') {
        throw new Error('search must be a string');
      }
      query.search = args.search;
    }

    if (args.unassigned !== undefined) {
      if (typeof args.unassigned !== 'boolean') {
        throw new Error('unassigned must be a boolean');
      }
      query.unassigned = args.unassigned;
    }

    if (args.missingAccess !== undefined) {
      if (typeof args.missingAccess !== 'boolean') {
        throw new Error('missingAccess must be a boolean');
      }
      query.missingAccess = args.missingAccess;
    }

    if (args.page !== undefined) {
      if (typeof args.page !== 'number' || !Number.isInteger(args.page) || args.page < 1) {
        throw new Error('page must be a positive integer');
      }
      query.page = args.page;
    }

    if (args.pageSize !== undefined) {
      if (
        typeof args.pageSize !== 'number' ||
        !Number.isInteger(args.pageSize) ||
        args.pageSize < 1
      ) {
        throw new Error('pageSize must be a positive integer');
      }
      query.pageSize = Math.min(args.pageSize, GET_JOBS_MAX_PAGE_SIZE);
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
      query.sort = args.sort as ListJobsQueryDto['sort'];
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

  private projectJob(job: JobSummaryView): GetJobsProjectedItem {
    return {
      id: job.id,
      jobNumber: job.jobNumber,
      title: job.title,
      jobType: job.jobType,
      status: job.status,
      priority: job.priority,
      scheduledStart: job.scheduledStart,
      expectedFinish: job.expectedFinish,
      workOrderNumber: job.workOrderNumber,
      client: { id: job.client.id, name: job.client.name },
      site: {
        id: job.site.id,
        name: job.site.name,
        city: job.site.city ?? null,
      },
      team: job.team,
      supervisor: job.supervisor
        ? { userId: job.supervisor.userId, fullName: job.supervisor.fullName }
        : null,
      technicians: job.technicians.map((t) => ({
        userId: t.userId,
        fullName: t.fullName,
      })),
      missingAccessInfo: job.missingAccessInfo,
      accessInfoReady: job.accessInfoReady,
      missingAccessItems: [...job.missingAccessItems],
      updatedAt: job.updatedAt,
    };
  }

  private appliedFilters(query: ListJobsQueryDto): AiJsonObject {
    const out: AiJsonObject = {};
    if (query.status) out.status = query.status;
    if (query.priority) out.priority = query.priority;
    if (query.clientId) out.clientId = query.clientId;
    if (query.technicianId) out.technicianId = query.technicianId;
    if (query.teamId) out.teamId = query.teamId;
    if (query.date) out.date = query.date;
    if (query.preset) out.preset = query.preset;
    if (query.search) out.search = query.search;
    if (query.unassigned === true) out.unassigned = true;
    if (query.missingAccess === true) out.missingAccess = true;
    out.page = query.page ?? 1;
    out.pageSize = query.pageSize ?? 20;
    if (query.sort) out.sort = query.sort;
    if (query.order) out.order = query.order;
    return out;
  }
}
