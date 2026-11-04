import { Injectable, OnModuleInit } from '@nestjs/common';
import { isYmd } from '../../../common/timezone.js';
import type { ListJobsQueryDto } from '../../../organizations/dto/list-jobs-query.dto.js';
import {
  formatMissingAccessItems,
  type AccessInfoMissingItem,
} from '../../../organizations/job-access-info.js';
import { JobsService } from '../../../organizations/jobs.service.js';
import type { JobSummaryView } from '../../../organizations/jobs-serializer.js';
import type { OrganizationContext } from '../../../tenancy/request-context.js';
import type {
  AiJsonObject,
  AiToolDefinition,
} from '../../providers/ai-provider.types.js';
import { AiToolRegistry } from '../ai-tool.registry.js';
import type {
  AiToolContext,
  AiToolExecutionOptions,
  AiToolHandler,
} from '../ai-tool.types.js';

/** Hard cap for AI findMissingAccess page size (aligned with getJobs). */
export const FIND_MISSING_ACCESS_MAX_PAGE_SIZE = 50;

export const FIND_MISSING_ACCESS_TOOL_NAME = 'findMissingAccess';

export const FIND_MISSING_ACCESS_TOOL_DEFINITION: AiToolDefinition = {
  name: FIND_MISSING_ACCESS_TOOL_NAME,
  description:
    'Find authorized jobs missing site access information: access notes and/or usable site contact, with concise missing-access reasons. Omit date unless the user asked for a specific day or “today” — without date, returns open missing-access jobs across the board (same idea as the Jobs page). Envelope: jobs (page), total (matching count), page, pageSize, truncated, timezone. Use total for matching size; disclose when the page is partial. Uses FieldKeel’s existing missing-access rules; completed and cancelled jobs are never flagged. Do NOT use for incomplete safety or time approvals. Does not create or modify jobs.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      date: {
        type: 'string',
        description:
          'Optional calendar date YYYY-MM-DD in the organization timezone; filters by scheduledStart day. Omit for all open missing-access jobs.',
      },
      search: {
        type: 'string',
        maxLength: 200,
        description:
          'Optional case-insensitive search across job number, title, client name, and site name.',
      },
      page: {
        type: 'integer',
        minimum: 1,
        description: '1-based page index (default 1).',
      },
      pageSize: {
        type: 'integer',
        minimum: 1,
        maximum: FIND_MISSING_ACCESS_MAX_PAGE_SIZE,
        description: `Page size (default 20, max ${FIND_MISSING_ACCESS_MAX_PAGE_SIZE}).`,
      },
    },
  },
};

type MissingAccessProjectedItem = {
  id: string;
  jobNumber: string;
  title: string;
  status: string;
  clientName: string;
  siteName: string;
  siteCity: string | null;
  scheduledStart: string | null;
  missingAccessNotes: boolean;
  missingSiteContact: boolean;
  missingItems: AccessInfoMissingItem[];
  reason: string;
  deepLink: string;
};

@Injectable()
export class FindMissingAccessAiTool implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly registry: AiToolRegistry,
  ) {}

  onModuleInit() {
    this.registry.register({
      definition: FIND_MISSING_ACCESS_TOOL_DEFINITION,
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
      throw new Error('findMissingAccess cancelled before start');
    }

    const query = this.toListQuery(args);
    const orgCtx = this.toOrganizationContext(context);

    if (execution.signal.aborted) {
      throw new Error('findMissingAccess cancelled before service call');
    }

    // Forces JobsService missing-access path (same rule as preset missing_access /
    // missingAccess filter → accessInfoFromJobRow / evaluateJobAccessInfo).
    const listed = await this.jobs.list(orgCtx, context.userId, query);

    if (execution.signal.aborted) {
      throw new Error('findMissingAccess cancelled after service call');
    }

    const jobs = listed.items.map((row) =>
      this.projectJob(row, context.organizationSlug),
    );
    const fetched = (listed.page - 1) * listed.pageSize + jobs.length;
    const truncated = fetched < listed.total;

    return {
      jobs,
      total: listed.total,
      page: listed.page,
      pageSize: listed.pageSize,
      truncated,
      appliedFilters: this.appliedFilters(query),
      timezone: context.timezone,
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
      status: 'ACTIVE',
    };
  }

  private toListQuery(args: AiJsonObject): ListJobsQueryDto {
    const query: ListJobsQueryDto = {
      // Always apply existing server missing-access filter (not a new rule).
      missingAccess: true,
    };

    if (args.date !== undefined) {
      if (typeof args.date !== 'string' || !isYmd(args.date)) {
        throw new Error('date must be YYYY-MM-DD');
      }
      query.date = args.date;
    }

    if (args.search !== undefined) {
      if (typeof args.search !== 'string') {
        throw new Error('search must be a string');
      }
      query.search = args.search;
    }

    if (args.page !== undefined) {
      if (
        typeof args.page !== 'number' ||
        !Number.isInteger(args.page) ||
        args.page < 1
      ) {
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
      query.pageSize = Math.min(
        args.pageSize,
        FIND_MISSING_ACCESS_MAX_PAGE_SIZE,
      );
    } else {
      query.pageSize = 20;
    }

    return query;
  }

  private projectJob(
    job: JobSummaryView,
    organizationSlug: string,
  ): MissingAccessProjectedItem {
    const missingItems = [...job.missingAccessItems] as AccessInfoMissingItem[];
    const missingAccessNotes = missingItems.includes('access notes');
    const missingSiteContact = missingItems.includes('site contact');
    const reason =
      formatMissingAccessItems(missingItems) ||
      'Missing access information';

    return {
      id: job.id,
      jobNumber: job.jobNumber,
      title: job.title,
      status: job.status,
      clientName: job.client.name,
      siteName: job.site.name,
      siteCity: job.site.city ?? null,
      scheduledStart: job.scheduledStart,
      missingAccessNotes,
      missingSiteContact,
      missingItems,
      reason: `Missing ${reason}.`,
      deepLink: `/app/${organizationSlug}/jobs/${job.id}`,
    };
  }

  private appliedFilters(query: ListJobsQueryDto): AiJsonObject {
    const out: AiJsonObject = {
      missingAccess: true,
    };
    if (query.date) out.date = query.date;
    if (query.search) out.search = query.search;
    out.page = query.page ?? 1;
    out.pageSize = query.pageSize ?? 20;
    return out;
  }
}
