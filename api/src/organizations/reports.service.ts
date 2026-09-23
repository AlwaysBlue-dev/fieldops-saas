import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClockSessionStatus,
  JobStatus,
  MembershipStatus,
  OrganizationRole,
  Prisma,
  TimeEntryStatus,
  TimeEntryType,
} from '../generated/prisma/client.js';
import {
  addCalendarDays,
  formatYmdInZone,
  isYmd,
  zonedDayRange,
} from '../common/timezone.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../subscription/clock.js';
import { Inject } from '@nestjs/common';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { canManageCrew } from './crew-access.js';
import { csvBuffer } from './csv.js';
import type { ReportFiltersDto } from './dto/report-filters.dto.js';
import { jobVisibilityWhere } from './job-visibility.js';
import { JobReportPdfService } from './job-report-pdf.service.js';
import { TeamsService } from './teams.service.js';

const ACTIVE_STATUSES: JobStatus[] = [
  JobStatus.SCHEDULED,
  JobStatus.DISPATCHED,
  JobStatus.IN_PROGRESS,
  JobStatus.PENDING_APPROVAL,
  JobStatus.RETURNED,
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teams: TeamsService,
    private readonly pdf: JobReportPdfService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async summary(ctx: OrganizationContext, actorUserId: string) {
    const scope = await this.scope(ctx, actorUserId);
    const timeZone = ctx.timezone;
    const todayYmd = formatYmdInZone(this.clock.now(), timeZone);
    const today = zonedDayRange(todayYmd, timeZone);
    const now = this.clock.now();

    const jobBase = scope.jobWhere;
    const [
      jobsToday,
      activeJobs,
      completedJobs,
      pendingApproval,
      overdueJobs,
      labour,
      completedWithTime,
      techsActive,
      reviewEntries,
      completedInWindow,
      terminalInWindow,
    ] = await Promise.all([
      this.prisma.job.count({
        where: {
          AND: [
            jobBase,
            {
              OR: [
                { scheduledStart: { gte: today.start, lt: today.end } },
                {
                  status: {
                    in: [
                      JobStatus.IN_PROGRESS,
                      JobStatus.DISPATCHED,
                      JobStatus.PENDING_APPROVAL,
                    ],
                  },
                },
              ],
            },
          ],
        },
      }),
      this.prisma.job.count({
        where: { AND: [jobBase, { status: { in: ACTIVE_STATUSES } }] },
      }),
      this.prisma.job.count({
        where: {
          AND: [
            jobBase,
            {
              status: JobStatus.COMPLETED,
              completedAt: { gte: today.start, lt: today.end },
            },
          ],
        },
      }),
      this.prisma.job.count({
        where: {
          AND: [jobBase, { status: JobStatus.PENDING_APPROVAL }],
        },
      }),
      this.prisma.job.count({
        where: {
          AND: [
            jobBase,
            {
              status: { in: [JobStatus.SCHEDULED, JobStatus.DISPATCHED] },
              scheduledStart: { lt: now },
            },
          ],
        },
      }),
      this.prisma.timeEntry.groupBy({
        by: ['type'],
        where: {
          organizationId: ctx.organizationId,
          userId: { in: scope.technicianUserIds },
          workDate: new Date(`${todayYmd}T00:00:00.000Z`),
          endedAt: { not: null },
          ...(scope.jobIdFilter ? { jobId: scope.jobIdFilter } : {}),
        },
        _sum: { durationMinutes: true },
      }),
      this.prisma.job.findMany({
        where: {
          AND: [
            jobBase,
            {
              status: JobStatus.COMPLETED,
              completedAt: { gte: today.start, lt: today.end },
            },
          ],
        },
        select: {
          timeEntries: {
            where: { endedAt: { not: null } },
            select: { durationMinutes: true },
          },
        },
        take: 500,
      }),
      this.prisma.clockSession.findMany({
        where: {
          organizationId: ctx.organizationId,
          technicianUserId: { in: scope.technicianUserIds },
          OR: [
            { status: ClockSessionStatus.OPEN },
            { clockInAt: { gte: today.start, lt: today.end } },
          ],
        },
        select: { technicianUserId: true },
        distinct: ['technicianUserId'],
      }),
      this.prisma.timeEntry.count({
        where: {
          organizationId: ctx.organizationId,
          userId: { in: scope.technicianUserIds },
          status: { in: [TimeEntryStatus.PENDING, TimeEntryStatus.SUBMITTED] },
          validation: { path: ['status'], equals: 'REVIEW' },
          ...(scope.jobIdFilter ? { jobId: scope.jobIdFilter } : {}),
        },
      }),
      this.prisma.job.count({
        where: {
          AND: [
            jobBase,
            {
              status: JobStatus.COMPLETED,
              completedAt: { gte: today.start, lt: today.end },
            },
          ],
        },
      }),
      this.prisma.job.count({
        where: {
          AND: [
            jobBase,
            {
              OR: [
                {
                  status: JobStatus.COMPLETED,
                  completedAt: { gte: today.start, lt: today.end },
                },
                {
                  status: JobStatus.CANCELLED,
                  cancelledAt: { gte: today.start, lt: today.end },
                },
              ],
            },
          ],
        },
      }),
    ]);

    const normalMinutes = labour
      .filter((row) => row.type === TimeEntryType.NORMAL)
      .reduce((sum, row) => sum + (row._sum.durationMinutes ?? 0), 0);
    const overtimeMinutes = labour
      .filter((row) => row.type === TimeEntryType.OVERTIME)
      .reduce((sum, row) => sum + (row._sum.durationMinutes ?? 0), 0);
    const otherMinutes = labour
      .filter(
        (row) =>
          row.type !== TimeEntryType.NORMAL &&
          row.type !== TimeEntryType.OVERTIME,
      )
      .reduce((sum, row) => sum + (row._sum.durationMinutes ?? 0), 0);
    const totalLabourMinutes = normalMinutes + overtimeMinutes + otherMinutes;

    const durations = completedWithTime.map((job) =>
      job.timeEntries.reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0),
    );
    const averageJobDurationMinutes =
      durations.length === 0
        ? 0
        : Math.round(
            durations.reduce((sum, value) => sum + value, 0) / durations.length,
          );

    return {
      timezone: timeZone,
      asOf: todayYmd,
      kpis: {
        jobsToday,
        activeJobs,
        completedJobs,
        pendingApproval,
        overdueJobs,
        totalLabourMinutes,
        normalMinutes,
        overtimeMinutes,
        completionRate:
          terminalInWindow === 0
            ? null
            : Number((completedInWindow / terminalInWindow).toFixed(3)),
        averageJobDurationMinutes,
        techniciansActiveToday: techsActive.length,
        timeEntriesRequiringReview: reviewEntries,
      },
    };
  }

  async jobStatus(ctx: OrganizationContext, actorUserId: string, query: ReportFiltersDto) {
    const scope = await this.scope(ctx, actorUserId);
    const range = this.resolveRange(ctx.timezone, query);
    const where: Prisma.JobWhereInput = {
      AND: [
        scope.jobWhere,
        this.jobFilterWhere(query, range),
      ],
    };
    const grouped = await this.prisma.job.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const counts = Object.fromEntries(
      Object.values(JobStatus).map((status) => [status, 0]),
    ) as Record<JobStatus, number>;
    for (const row of grouped) {
      counts[row.status] = row._count._all;
    }
    return {
      timezone: ctx.timezone,
      from: range.fromYmd,
      to: range.toYmd,
      counts,
      items: Object.entries(counts).map(([status, count]) => ({
        status,
        count,
      })),
    };
  }

  async labour(ctx: OrganizationContext, actorUserId: string, query: ReportFiltersDto) {
    const scope = await this.scope(ctx, actorUserId);
    const range = this.resolveRange(ctx.timezone, query);
    const where: Prisma.TimeEntryWhereInput = {
      organizationId: ctx.organizationId,
      userId: query.technicianUserId
        ? query.technicianUserId
        : { in: scope.technicianUserIds },
      workDate: { gte: range.fromDate, lte: range.toDate },
      endedAt: { not: null },
      ...(scope.jobIdFilter ? { jobId: scope.jobIdFilter } : {}),
      ...(query.clientId ||
      query.siteId ||
      query.teamId ||
      query.status ||
      query.priority
        ? {
            job: {
              is: {
                organizationId: ctx.organizationId,
                ...this.jobFilterWhere(query, range, true),
              },
            },
          }
        : {}),
    };
    if (
      query.technicianUserId &&
      !scope.technicianUserIds.includes(query.technicianUserId)
    ) {
      throw new NotFoundException();
    }

    const [byDay, byType, byTech, byClient] = await Promise.all([
      this.prisma.timeEntry.groupBy({
        by: ['workDate', 'type'],
        where,
        _sum: { durationMinutes: true },
        orderBy: { workDate: 'asc' },
      }),
      this.prisma.timeEntry.groupBy({
        by: ['type'],
        where,
        _sum: { durationMinutes: true },
      }),
      this.prisma.timeEntry.groupBy({
        by: ['userId'],
        where,
        _sum: { durationMinutes: true },
        orderBy: { _sum: { durationMinutes: 'desc' } },
        take: 40,
      }),
      this.prisma.timeEntry.findMany({
        where,
        select: {
          durationMinutes: true,
          type: true,
          job: {
            select: {
              id: true,
              jobNumber: true,
              client: { select: { id: true, name: true } },
              site: { select: { id: true, name: true } },
            },
          },
        },
        take: 5000,
      }),
    ]);

    const users = await this.prisma.user.findMany({
      where: { id: { in: byTech.map((row) => row.userId) } },
      select: { id: true, fullName: true },
    });
    const userName = Object.fromEntries(users.map((row) => [row.id, row.fullName]));

    const dailyMap = new Map<
      string,
      { date: string; normalMinutes: number; overtimeMinutes: number; totalMinutes: number }
    >();
    for (const row of byDay) {
      const date = row.workDate.toISOString().slice(0, 10);
      const current = dailyMap.get(date) ?? {
        date,
        normalMinutes: 0,
        overtimeMinutes: 0,
        totalMinutes: 0,
      };
      const minutes = row._sum.durationMinutes ?? 0;
      current.totalMinutes += minutes;
      if (row.type === TimeEntryType.OVERTIME) current.overtimeMinutes += minutes;
      else if (row.type === TimeEntryType.NORMAL) current.normalMinutes += minutes;
      dailyMap.set(date, current);
    }

    const clientMap = new Map<
      string,
      { clientId: string; clientName: string; minutes: number }
    >();
    const siteMap = new Map<
      string,
      { siteId: string; siteName: string; clientName: string; minutes: number }
    >();
    const jobMap = new Map<
      string,
      { jobId: string; jobNumber: string; minutes: number }
    >();
    for (const row of byClient) {
      const minutes = row.durationMinutes ?? 0;
      if (!row.job) continue;
      const clientKey = row.job.client.id;
      const client = clientMap.get(clientKey) ?? {
        clientId: clientKey,
        clientName: row.job.client.name,
        minutes: 0,
      };
      client.minutes += minutes;
      clientMap.set(clientKey, client);

      const siteKey = row.job.site.id;
      const site = siteMap.get(siteKey) ?? {
        siteId: siteKey,
        siteName: row.job.site.name,
        clientName: row.job.client.name,
        minutes: 0,
      };
      site.minutes += minutes;
      siteMap.set(siteKey, site);

      const job = jobMap.get(row.job.id) ?? {
        jobId: row.job.id,
        jobNumber: row.job.jobNumber,
        minutes: 0,
      };
      job.minutes += minutes;
      jobMap.set(row.job.id, job);
    }

    const typeTotals = {
      normalMinutes: 0,
      overtimeMinutes: 0,
      otherMinutes: 0,
      totalMinutes: 0,
    };
    for (const row of byType) {
      const minutes = row._sum.durationMinutes ?? 0;
      typeTotals.totalMinutes += minutes;
      if (row.type === TimeEntryType.NORMAL) typeTotals.normalMinutes += minutes;
      else if (row.type === TimeEntryType.OVERTIME)
        typeTotals.overtimeMinutes += minutes;
      else typeTotals.otherMinutes += minutes;
    }

    return {
      timezone: ctx.timezone,
      from: range.fromYmd,
      to: range.toYmd,
      totals: typeTotals,
      daily: [...dailyMap.values()],
      byTechnician: byTech.map((row) => ({
        userId: row.userId,
        fullName: userName[row.userId] ?? 'Unknown',
        minutes: row._sum.durationMinutes ?? 0,
      })),
      byClient: [...clientMap.values()]
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 30),
      bySite: [...siteMap.values()]
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 30),
      byJob: [...jobMap.values()]
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 30),
    };
  }

  async jobsTable(
    ctx: OrganizationContext,
    actorUserId: string,
    query: ReportFiltersDto,
  ) {
    const scope = await this.scope(ctx, actorUserId);
    const range = this.resolveRange(ctx.timezone, query);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.JobWhereInput = {
      AND: [scope.jobWhere, this.jobFilterWhere(query, range)],
    };
    const [total, rows] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          site: { select: { id: true, name: true, city: true } },
          team: { select: { id: true, name: true } },
          assignments: {
            include: { user: { select: { id: true, fullName: true } } },
          },
          timeEntries: {
            where: { endedAt: { not: null } },
            select: { durationMinutes: true, type: true },
          },
        },
        orderBy: [{ scheduledStart: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      timezone: ctx.timezone,
      from: range.fromYmd,
      to: range.toYmd,
      page,
      pageSize,
      total,
      items: rows.map((job) => ({
        id: job.id,
        jobNumber: job.jobNumber,
        title: job.title,
        status: job.status,
        priority: job.priority,
        client: job.client,
        site: job.site,
        team: job.team,
        technicians: job.assignments.map((row) => ({
          userId: row.user.id,
          fullName: row.user.fullName,
        })),
        scheduledStart: job.scheduledStart?.toISOString() ?? null,
        completedAt: job.completedAt?.toISOString() ?? null,
        labourMinutes: job.timeEntries.reduce(
          (sum, row) => sum + (row.durationMinutes ?? 0),
          0,
        ),
      })),
    };
  }

  async exportJobsCsv(
    ctx: OrganizationContext,
    actorUserId: string,
    query: ReportFiltersDto,
  ) {
    const scope = await this.scope(ctx, actorUserId);
    const range = this.resolveRange(ctx.timezone, query);
    const where: Prisma.JobWhereInput = {
      AND: [scope.jobWhere, this.jobFilterWhere(query, range)],
    };
    const rows = await this.prisma.job.findMany({
      where,
      include: {
        client: { select: { name: true } },
        site: { select: { name: true, city: true } },
        team: { select: { name: true } },
        assignments: {
          include: { user: { select: { fullName: true } } },
        },
      },
      orderBy: [{ scheduledStart: 'asc' }, { jobNumber: 'asc' }],
      take: 10_000,
    });
    const buffer = csvBuffer(
      [
        'Job Number',
        'Title',
        'Status',
        'Priority',
        'Client',
        'Site',
        'City',
        'Team',
        'Technicians',
        'Scheduled Start',
        'Expected Finish',
        'Completed At',
        'Work Order',
      ],
      rows.map((job) => [
        job.jobNumber,
        job.title,
        job.status,
        job.priority,
        job.client.name,
        job.site.name,
        job.site.city,
        job.team?.name ?? '',
        job.assignments.map((row) => row.user.fullName).join('; '),
        job.scheduledStart?.toISOString() ?? '',
        job.expectedFinish?.toISOString() ?? '',
        job.completedAt?.toISOString() ?? '',
        job.workOrderNumber ?? '',
      ]),
    );
    return {
      buffer,
      filename: `jobs-${range.fromYmd}-to-${range.toYmd}.csv`,
    };
  }

  async exportTimesheetsCsv(
    ctx: OrganizationContext,
    actorUserId: string,
    query: ReportFiltersDto,
  ) {
    const scope = await this.scope(ctx, actorUserId);
    const range = this.resolveRange(ctx.timezone, query);
    const where: Prisma.TimeEntryWhereInput = {
      organizationId: ctx.organizationId,
      userId: query.technicianUserId
        ? query.technicianUserId
        : { in: scope.technicianUserIds },
      workDate: { gte: range.fromDate, lte: range.toDate },
      ...(scope.jobIdFilter ? { jobId: scope.jobIdFilter } : {}),
      ...(query.clientId || query.siteId || query.teamId
        ? {
            job: {
              is: {
                organizationId: ctx.organizationId,
                ...(query.clientId ? { clientId: query.clientId } : {}),
                ...(query.siteId ? { siteId: query.siteId } : {}),
                ...(query.teamId ? { teamId: query.teamId } : {}),
              },
            },
          }
        : {}),
    };
    if (
      query.technicianUserId &&
      !scope.technicianUserIds.includes(query.technicianUserId)
    ) {
      throw new NotFoundException();
    }
    const rows = await this.prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { fullName: true, email: true } },
        job: {
          select: {
            jobNumber: true,
            title: true,
            client: { select: { name: true } },
            site: { select: { name: true } },
          },
        },
      },
      orderBy: [{ workDate: 'asc' }, { startedAt: 'asc' }],
      take: 20_000,
    });
    const buffer = csvBuffer(
      [
        'Work Date',
        'Technician',
        'Email',
        'Job Number',
        'Job Title',
        'Client',
        'Site',
        'Type',
        'Source',
        'Status',
        'Start',
        'End',
        'Duration Minutes',
        'Notes',
      ],
      rows.map((row) => [
        row.workDate.toISOString().slice(0, 10),
        row.user.fullName,
        row.user.email,
        row.job?.jobNumber ?? '',
        row.job?.title ?? '',
        row.job?.client.name ?? '',
        row.job?.site.name ?? '',
        row.type,
        row.source,
        row.status,
        row.startedAt.toISOString(),
        row.endedAt?.toISOString() ?? '',
        row.durationMinutes ?? '',
        row.notes ?? '',
      ]),
    );
    return {
      buffer,
      filename: `timesheets-${range.fromYmd}-to-${range.toYmd}.csv`,
    };
  }

  async exportLabourCsv(
    ctx: OrganizationContext,
    actorUserId: string,
    query: ReportFiltersDto,
  ) {
    const labour = await this.labour(ctx, actorUserId, query);
    const buffer = csvBuffer(
      ['Section', 'Key', 'Label', 'Minutes'],
      [
        ...labour.daily.map((row) => [
          'daily',
          row.date,
          `normal=${row.normalMinutes};overtime=${row.overtimeMinutes}`,
          row.totalMinutes,
        ]),
        ...labour.byTechnician.map((row) => [
          'technician',
          row.userId,
          row.fullName,
          row.minutes,
        ]),
        ...labour.byClient.map((row) => [
          'client',
          row.clientId,
          row.clientName,
          row.minutes,
        ]),
        ...labour.bySite.map((row) => [
          'site',
          row.siteId,
          `${row.clientName} / ${row.siteName}`,
          row.minutes,
        ]),
        ...labour.byJob.map((row) => [
          'job',
          row.jobId,
          row.jobNumber,
          row.minutes,
        ]),
      ],
    );
    return {
      buffer,
      filename: `labour-${labour.from}-to-${labour.to}.csv`,
    };
  }

  async jobPdf(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
  ) {
    const scope = await this.scope(ctx, actorUserId);
    const visible = await this.prisma.job.findFirst({
      where: { AND: [scope.jobWhere, { id: jobId }] },
      select: { id: true },
    });
    return this.pdf.render(ctx, jobId, actorUserId, Boolean(visible));
  }

  private async scope(ctx: OrganizationContext, actorUserId: string) {
    const visibleTeamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
    const jobWhere = jobVisibilityWhere(ctx, actorUserId, visibleTeamIds);
    let technicianUserIds: string[];
    if (canManageCrew(ctx.role)) {
      const members = await this.prisma.organizationMember.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: MembershipStatus.ACTIVE,
        },
        select: { userId: true },
      });
      technicianUserIds = members.map((row) => row.userId);
    } else if (ctx.role === OrganizationRole.SUPERVISOR) {
      if (visibleTeamIds.length === 0) {
        technicianUserIds = [actorUserId];
      } else {
        const members = await this.prisma.teamMember.findMany({
          where: {
            organizationId: ctx.organizationId,
            teamId: { in: visibleTeamIds },
          },
          select: { userId: true },
        });
        technicianUserIds = [
          ...new Set([actorUserId, ...members.map((row) => row.userId)]),
        ];
      }
    } else {
      technicianUserIds = [actorUserId];
    }

    let jobIdFilter: Prisma.StringNullableFilter | string | undefined;
    if (ctx.role === OrganizationRole.TECHNICIAN) {
      const assigned = await this.prisma.jobAssignment.findMany({
        where: { organizationId: ctx.organizationId, userId: actorUserId },
        select: { jobId: true },
      });
      jobIdFilter = { in: assigned.map((row) => row.jobId) };
    }

    return { jobWhere, technicianUserIds, jobIdFilter, visibleTeamIds };
  }

  private resolveRange(timeZone: string, query: ReportFiltersDto) {
    const today = formatYmdInZone(this.clock.now(), timeZone);
    const fromYmd = query.from && isYmd(query.from) ? query.from : addCalendarDays(today, -13);
    const toYmd = query.to && isYmd(query.to) ? query.to : today;
    if (fromYmd > toYmd) {
      throw new BadRequestException('from must be on or before to');
    }
    const fromRange = zonedDayRange(fromYmd, timeZone);
    const toRange = zonedDayRange(toYmd, timeZone);
    return {
      fromYmd,
      toYmd,
      fromUtc: fromRange.start,
      toUtcExclusive: toRange.end,
      fromDate: new Date(`${fromYmd}T00:00:00.000Z`),
      toDate: new Date(`${toYmd}T00:00:00.000Z`),
    };
  }

  private jobFilterWhere(
    query: ReportFiltersDto,
    range: { fromUtc: Date; toUtcExclusive: Date },
    skipSchedule = false,
  ): Prisma.JobWhereInput {
    const and: Prisma.JobWhereInput[] = [];
    if (!query.includeDraft) {
      and.push({ status: { not: JobStatus.DRAFT } });
    }
    if (query.clientId) and.push({ clientId: query.clientId });
    if (query.siteId) and.push({ siteId: query.siteId });
    if (query.teamId) and.push({ teamId: query.teamId });
    if (query.status) and.push({ status: query.status });
    if (query.priority) and.push({ priority: query.priority });
    if (query.technicianUserId) {
      and.push({
        assignments: { some: { userId: query.technicianUserId } },
      });
    }
    if (!skipSchedule) {
      and.push({
        OR: [
          {
            scheduledStart: {
              gte: range.fromUtc,
              lt: range.toUtcExclusive,
            },
          },
          {
            completedAt: {
              gte: range.fromUtc,
              lt: range.toUtcExclusive,
            },
          },
          {
            AND: [
              { scheduledStart: null },
              {
                createdAt: {
                  gte: range.fromUtc,
                  lt: range.toUtcExclusive,
                },
              },
            ],
          },
        ],
      });
    }
    return and.length ? { AND: and } : {};
  }
}
