import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  isYmd,
  jobWindow,
  windowsOverlap,
} from '../../../common/timezone.js';
import type { ScheduleQueryDto } from '../../../organizations/dto/schedule-query.dto.js';
import type { ScheduleJobView } from '../../../organizations/schedule-serializer.js';
import { ScheduleService } from '../../../organizations/schedule.service.js';
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

/** Cap returned scheduled jobs so results stay under the executor 64 KiB limit. */
export const GET_SCHEDULE_MAX_JOBS = 50;

const VIEW_VALUES = ['day', 'week'] as const;
type ScheduleView = (typeof VIEW_VALUES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET_SCHEDULE_TOOL_NAME = 'getSchedule';

export const GET_SCHEDULE_TOOL_DEFINITION: AiToolDefinition = {
  name: GET_SCHEDULE_TOOL_NAME,
  description:
    'Retrieve the authorized operational schedule for a day or week in the organization timezone (Monday-based weeks). Use for daily/weekly schedule summaries and scheduled workload by technician/team/date (job counts only). Envelope: totalScheduledJobs (full count in window), jobs (may be capped), truncated, from/to/timezone. Cite totalScheduledJobs for window size; if truncated, attribute breakdowns of jobs[] are based on the returned subset. Does NOT calculate availability, free capacity, working hours, or that an empty/light schedule means someone is free. Does not create or modify schedule entries.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      date: {
        type: 'string',
        description:
          'Optional anchor calendar date YYYY-MM-DD in the organization timezone. Defaults to today in that timezone. For week view, the week containing this date (Monday-based) is used.',
      },
      view: {
        type: 'string',
        enum: [...VIEW_VALUES],
        description:
          'day = single local calendar day; week = local calendar week containing date. Default week.',
      },
      technicianId: {
        type: 'string',
        description:
          'Optional technician user UUID filter (same as schedule board). Still constrained by job visibility.',
      },
      teamId: {
        type: 'string',
        description:
          'Optional team UUID filter (same as schedule board). Still constrained by job visibility.',
      },
    },
  },
};

type ScheduleProjectedJob = {
  jobNumber: string;
  title: string;
  status: string;
  priority: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  clientName: string;
  siteName: string;
  teamName: string | null;
  technicians: string[];
  missingAccessInfo: boolean;
  missingAccessItems: string[];
};

@Injectable()
export class GetScheduleAiTool implements OnModuleInit {
  constructor(
    private readonly schedule: ScheduleService,
    private readonly registry: AiToolRegistry,
  ) {}

  onModuleInit() {
    this.registry.register({
      definition: GET_SCHEDULE_TOOL_DEFINITION,
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
      throw new Error('getSchedule cancelled before start');
    }

    const { query, view } = this.toScheduleQuery(args);
    const orgCtx = this.toOrganizationContext(context);

    if (execution.signal.aborted) {
      throw new Error('getSchedule cancelled before service call');
    }

    const board = await this.schedule.getBoard(orgCtx, context.userId, query);

    if (execution.signal.aborted) {
      throw new Error('getSchedule cancelled after service call');
    }

    // Unique in-range jobs from lanes + unassigned that overlap the board window.
    // Do not treat empty technician lanes as free/available capacity.
    const boardWindow = {
      start: new Date(board.from),
      end: new Date(board.to),
    };
    const unique = this.uniqueScheduledJobs(
      board.lanes,
      board.unassigned,
      boardWindow,
    );
    const totalScheduledJobs = unique.length;
    const truncated = totalScheduledJobs > GET_SCHEDULE_MAX_JOBS;
    const jobs = unique
      .slice(0, GET_SCHEDULE_MAX_JOBS)
      .map((job) => this.projectJob(job));

    return {
      view,
      date: board.date,
      from: board.from,
      to: board.to,
      timezone: board.timezone,
      totalScheduledJobs,
      jobs,
      truncated,
      appliedFilters: this.appliedFilters(query, view, board.date),
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

  private toScheduleQuery(args: AiJsonObject): {
    query: ScheduleQueryDto;
    view: ScheduleView;
  } {
    const query: ScheduleQueryDto = {};

    if (args.date !== undefined) {
      if (typeof args.date !== 'string' || !isYmd(args.date)) {
        throw new Error('date must be YYYY-MM-DD');
      }
      query.date = args.date;
    }

    let view: ScheduleView = 'week';
    if (args.view !== undefined) {
      if (
        typeof args.view !== 'string' ||
        !(VIEW_VALUES as readonly string[]).includes(args.view)
      ) {
        throw new Error('view must be day or week');
      }
      view = args.view as ScheduleView;
    }
    // ScheduleQueryDto / getBoard use `range`; AI schema uses `view`.
    query.range = view;

    if (args.technicianId !== undefined) {
      query.technicianId = this.requireUuid(args.technicianId, 'technicianId');
    }
    if (args.teamId !== undefined) {
      query.teamId = this.requireUuid(args.teamId, 'teamId');
    }

    return { query, view };
  }

  private requireUuid(value: unknown, field: string): string {
    if (typeof value !== 'string' || !UUID_RE.test(value)) {
      throw new Error(`${field} must be a UUID`);
    }
    return value;
  }

  private uniqueScheduledJobs(
    lanes: Array<{ jobs: ScheduleJobView[] }>,
    unassigned: ScheduleJobView[],
    boardWindow: { start: Date; end: Date },
  ): ScheduleJobView[] {
    const byId = new Map<string, ScheduleJobView>();
    for (const lane of lanes) {
      for (const job of lane.jobs) {
        if (!byId.has(job.id)) {
          byId.set(job.id, job);
        }
      }
    }
    // Board unassigned queue is not pre-filtered to the window; reuse jobWindow overlap.
    for (const job of unassigned) {
      if (byId.has(job.id)) continue;
      const span = jobWindow(
        job.scheduledStart ? new Date(job.scheduledStart) : null,
        job.expectedFinish ? new Date(job.expectedFinish) : null,
      );
      if (!span || !windowsOverlap(span, boardWindow)) continue;
      byId.set(job.id, job);
    }
    return [...byId.values()].sort((a, b) => {
      const aStart = a.scheduledStart ?? '';
      const bStart = b.scheduledStart ?? '';
      if (aStart !== bStart) return aStart.localeCompare(bStart);
      return a.jobNumber.localeCompare(b.jobNumber);
    });
  }

  private projectJob(job: ScheduleJobView): ScheduleProjectedJob {
    return {
      jobNumber: job.jobNumber,
      title: job.title,
      status: job.status,
      priority: job.priority,
      scheduledStart: job.scheduledStart,
      scheduledEnd: job.expectedFinish,
      clientName: job.client.name,
      siteName: job.site.name,
      teamName: job.team?.name ?? null,
      technicians: job.technicians.map((t) => t.fullName),
      missingAccessInfo: job.missingAccessInfo,
      missingAccessItems: [...job.missingAccessItems],
    };
  }

  private appliedFilters(
    query: ScheduleQueryDto,
    view: ScheduleView,
    resolvedDate: string,
  ): AiJsonObject {
    const out: AiJsonObject = {
      date: resolvedDate,
      view,
    };
    if (query.technicianId) out.technicianId = query.technicianId;
    if (query.teamId) out.teamId = query.teamId;
    return out;
  }
}
