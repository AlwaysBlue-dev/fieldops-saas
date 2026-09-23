import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  ApprovalType,
  JobStatus,
  MembershipStatus,
  OrganizationRole,
  OvertimeAuthorizationStatus,
  Prisma,
  TimeEntryStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { ApprovalRecordsService } from './approval-records.service.js';
import { canManageCrew } from './crew-access.js';
import type {
  BulkTimesheetApprovalsDto,
  DecideApprovalDto,
  ListApprovalsQueryDto,
} from './dto/decide-approval.dto.js';
import { jobVisibilityWhere } from './job-visibility.js';
import { JobsService } from './jobs.service.js';
import { OvertimeService } from './overtime.service.js';
import { TeamsService } from './teams.service.js';
import { canApproveTimesheets } from './timesheet-access.js';
import { TimesheetsService } from './timesheets.service.js';
import { zonedWeekRange } from '../common/timezone.js';

const INBOX_TYPES: ApprovalType[] = [
  ApprovalType.JOB_COMPLETION,
  ApprovalType.TIMESHEET,
  ApprovalType.OVERTIME,
];

const approvalInclude = {
  requestedBy: { select: { id: true, fullName: true } },
  assignedApprover: { select: { id: true, fullName: true } },
  decidedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ApprovalInclude;

type ApprovalRow = Prisma.ApprovalGetPayload<{ include: typeof approvalInclude }>;

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: ApprovalRecordsService,
    private readonly teams: TeamsService,
    private readonly jobs: JobsService,
    private readonly timesheets: TimesheetsService,
    private readonly overtime: OvertimeService,
  ) {}

  async list(
    ctx: OrganizationContext,
    actorUserId: string,
    query: ListApprovalsQueryDto,
  ) {
    await this.syncPendingRecords(ctx, actorUserId);
    const canDecide = this.canDecide(ctx.role);
    const types = query.type
      ? [query.type as ApprovalType]
      : INBOX_TYPES;
    const status = (query.status as ApprovalStatus | undefined) ??
      (canDecide ? ApprovalStatus.PENDING : undefined);
    const visible = await this.visibleWhere(ctx, actorUserId, canDecide);
    const where: Prisma.ApprovalWhereInput = {
      organizationId: ctx.organizationId,
      type: { in: types },
      AND: [visible],
      ...(status ? { status } : {}),
    };
    const rows = await this.prisma.approval.findMany({
      where,
      include: approvalInclude,
      orderBy: { requestedAt: 'desc' },
      take: 80,
    });
    const items = [];
    for (const row of rows) {
      const subject = await this.subjectSummary(ctx, actorUserId, row);
      if (!subject) continue;
      items.push(this.serialize(row, subject, canDecide));
    }
    return {
      items,
      counts: await this.counts(ctx, actorUserId, canDecide),
      canDecide,
    };
  }

  async get(ctx: OrganizationContext, actorUserId: string, approvalId: string) {
    const row = await this.requireVisible(ctx, actorUserId, approvalId);
    const canDecide = this.canDecide(ctx.role);
    const subject = await this.subjectDetail(ctx, actorUserId, row);
    if (!subject) {
      throw new NotFoundException();
    }
    return this.serialize(row, subject, canDecide);
  }

  async decide(
    ctx: OrganizationContext,
    actorUserId: string,
    approvalId: string,
    dto: DecideApprovalDto,
  ) {
    if (!this.canDecide(ctx.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    const row = await this.requireVisible(ctx, actorUserId, approvalId);
    if (row.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('This approval has already been decided');
    }
    if (row.type === ApprovalType.JOB_COMPLETION) {
      if (dto.decision === 'REJECTED') {
        throw new BadRequestException('Return a job instead of rejecting it');
      }
      if (dto.decision === 'APPROVED') {
        await this.jobs.complete(ctx, actorUserId, row.subjectId);
      } else {
        if (!dto.comment?.trim()) {
          throw new BadRequestException('A return comment is required');
        }
        await this.jobs.returnJob(ctx, actorUserId, row.subjectId, {
          reason: dto.comment.trim(),
        });
      }
    } else if (row.type === ApprovalType.TIMESHEET) {
      if (dto.decision === 'REJECTED') {
        throw new BadRequestException('Return a timesheet instead of rejecting it');
      }
      await this.timesheets.decide(ctx, actorUserId, row.subjectId, {
        decision: dto.decision,
        comment: dto.comment,
      });
    } else if (row.type === ApprovalType.OVERTIME) {
      if (dto.decision === 'RETURNED') {
        throw new BadRequestException('Reject overtime instead of returning it');
      }
      await this.overtime.decide(ctx, actorUserId, row.subjectId, {
        decision: dto.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        comment: dto.comment,
      });
    } else {
      throw new BadRequestException('This approval type is not decided here');
    }
    return this.get(ctx, actorUserId, row.id);
  }

  async bulkApproveTimesheets(
    ctx: OrganizationContext,
    actorUserId: string,
    dto: BulkTimesheetApprovalsDto,
  ) {
    if (!this.canDecide(ctx.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    const results: Array<{
      approvalId: string;
      status: 'APPROVED' | 'SKIPPED' | 'FAILED';
      message?: string;
    }> = [];
    const uniqueIds = [...new Set(dto.approvalIds)];
    for (const approvalId of uniqueIds) {
      try {
        const row = await this.prisma.approval.findFirst({
          where: {
            id: approvalId,
            organizationId: ctx.organizationId,
          },
        });
        if (!row) {
          results.push({
            approvalId,
            status: 'FAILED',
            message: 'Approval not found',
          });
          continue;
        }
        if (row.type !== ApprovalType.TIMESHEET) {
          results.push({
            approvalId,
            status: 'SKIPPED',
            message: 'Not a timesheet approval',
          });
          continue;
        }
        if (row.status !== ApprovalStatus.PENDING) {
          results.push({
            approvalId,
            status: 'SKIPPED',
            message: 'No longer pending',
          });
          continue;
        }
        const entry = await this.prisma.timeEntry.findFirst({
          where: { id: row.subjectId, organizationId: ctx.organizationId },
          select: { id: true, status: true, validation: true },
        });
        if (!entry) {
          results.push({
            approvalId,
            status: 'FAILED',
            message: 'Timesheet not found',
          });
          continue;
        }
        const validation = asValidation(entry.validation);
        if (validation.status !== 'CLEAR') {
          results.push({
            approvalId,
            status: 'SKIPPED',
            message: `Validation is ${validation.status}`,
          });
          continue;
        }
        if (
          entry.status !== TimeEntryStatus.PENDING &&
          entry.status !== TimeEntryStatus.SUBMITTED
        ) {
          results.push({
            approvalId,
            status: 'SKIPPED',
            message: 'Timesheet is not pending',
          });
          continue;
        }
        await this.timesheets.decide(ctx, actorUserId, entry.id, {
          decision: 'APPROVED',
        });
        results.push({ approvalId, status: 'APPROVED' });
      } catch (error) {
        results.push({
          approvalId,
          status: 'FAILED',
          message:
            error instanceof Error ? error.message : 'Unable to approve',
        });
      }
    }
    return { results };
  }

  private canDecide(role: OrganizationRole) {
    return canApproveTimesheets(role);
  }

  private async requireVisible(
    ctx: OrganizationContext,
    actorUserId: string,
    approvalId: string,
  ) {
    const canDecide = this.canDecide(ctx.role);
    const visible = await this.visibleWhere(ctx, actorUserId, canDecide);
    const row = await this.prisma.approval.findFirst({
      where: {
        id: approvalId,
        organizationId: ctx.organizationId,
        AND: [visible],
      },
      include: approvalInclude,
    });
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  private async visibleWhere(
    ctx: OrganizationContext,
    actorUserId: string,
    canDecide: boolean,
  ): Promise<Prisma.ApprovalWhereInput> {
    if (canManageCrew(ctx.role)) {
      return {};
    }
    if (canDecide && ctx.role === OrganizationRole.SUPERVISOR) {
      const scope = await this.supervisorSubjectIds(ctx, actorUserId);
      return {
        OR: [
          { assignedApproverUserId: actorUserId },
          {
            type: ApprovalType.JOB_COMPLETION,
            subjectId: { in: scope.jobIds },
          },
          {
            type: ApprovalType.TIMESHEET,
            subjectId: { in: scope.timeIds },
          },
          {
            type: ApprovalType.OVERTIME,
            subjectId: { in: scope.overtimeIds },
          },
        ],
      };
    }
    return { requestedByUserId: actorUserId };
  }

  private async supervisorSubjectIds(
    ctx: OrganizationContext,
    actorUserId: string,
  ) {
    const visibleTeamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
    const visibility = jobVisibilityWhere(ctx, actorUserId, visibleTeamIds);
    const jobs = await this.prisma.job.findMany({
      where: visibility,
      select: { id: true },
    });
    const jobIds = jobs.map((row) => row.id);
    const technicians = await this.visibleTechnicianUserIds(ctx, actorUserId);
    const [timeRows, overtimeRows] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: {
          organizationId: ctx.organizationId,
          userId: { in: technicians },
        },
        select: { id: true },
      }),
      this.prisma.overtimeAuthorization.findMany({
        where: {
          organizationId: ctx.organizationId,
          userId: { in: technicians },
        },
        select: { id: true },
      }),
    ]);
    return {
      jobIds,
      timeIds: timeRows.map((row) => row.id),
      overtimeIds: overtimeRows.map((row) => row.id),
    };
  }

  private async visibleTechnicianUserIds(
    ctx: OrganizationContext,
    actorUserId: string,
  ) {
    if (canManageCrew(ctx.role)) {
      const members = await this.prisma.organizationMember.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: MembershipStatus.ACTIVE,
        },
        select: { userId: true },
      });
      return members.map((row) => row.userId);
    }
    if (ctx.role === OrganizationRole.SUPERVISOR) {
      const teamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
      if (teamIds.length === 0) return [actorUserId];
      const members = await this.prisma.teamMember.findMany({
        where: { organizationId: ctx.organizationId, teamId: { in: teamIds } },
        select: { userId: true },
      });
      return [...new Set([actorUserId, ...members.map((row) => row.userId)])];
    }
    return [actorUserId];
  }

  private async syncPendingRecords(
    ctx: OrganizationContext,
    actorUserId: string,
  ) {
    const visibleTeamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
    const visibility = jobVisibilityWhere(ctx, actorUserId, visibleTeamIds);
    const technicians = await this.visibleTechnicianUserIds(ctx, actorUserId);
    const [jobs, entries, overtime] = await Promise.all([
      this.prisma.job.findMany({
        where: {
          AND: [visibility, { status: JobStatus.PENDING_APPROVAL }],
        },
        select: {
          id: true,
          supervisorUserId: true,
          assignments: { select: { userId: true }, take: 1 },
        },
      }),
      this.prisma.timeEntry.findMany({
        where: {
          organizationId: ctx.organizationId,
          userId: { in: technicians },
          status: { in: [TimeEntryStatus.PENDING, TimeEntryStatus.SUBMITTED] },
        },
        select: {
          id: true,
          userId: true,
          job: { select: { supervisorUserId: true } },
        },
      }),
      this.prisma.overtimeAuthorization.findMany({
        where: {
          organizationId: ctx.organizationId,
          userId: { in: technicians },
          status: OvertimeAuthorizationStatus.PENDING,
        },
        select: {
          id: true,
          requestedByUserId: true,
          job: { select: { supervisorUserId: true } },
        },
      }),
    ]);
    for (const job of jobs) {
      await this.records.ensurePending({
        organizationId: ctx.organizationId,
        type: ApprovalType.JOB_COMPLETION,
        subjectType: 'Job',
        subjectId: job.id,
        requestedByUserId: job.assignments[0]?.userId ?? actorUserId,
        assignedApproverUserId: job.supervisorUserId,
        assignedRole: job.supervisorUserId
          ? OrganizationRole.SUPERVISOR
          : null,
      });
    }
    for (const entry of entries) {
      await this.records.ensurePending({
        organizationId: ctx.organizationId,
        type: ApprovalType.TIMESHEET,
        subjectType: 'TimeEntry',
        subjectId: entry.id,
        requestedByUserId: entry.userId,
        assignedApproverUserId: entry.job?.supervisorUserId ?? null,
        assignedRole: OrganizationRole.SUPERVISOR,
      });
    }
    for (const row of overtime) {
      await this.records.ensurePending({
        organizationId: ctx.organizationId,
        type: ApprovalType.OVERTIME,
        subjectType: 'OvertimeAuthorization',
        subjectId: row.id,
        requestedByUserId: row.requestedByUserId,
        assignedApproverUserId: row.job.supervisorUserId,
        assignedRole: OrganizationRole.SUPERVISOR,
      });
    }
  }

  private async counts(
    ctx: OrganizationContext,
    actorUserId: string,
    canDecide: boolean,
  ) {
    const visible = await this.visibleWhere(ctx, actorUserId, canDecide);
    const groups = await this.prisma.approval.groupBy({
      by: ['type'],
      where: {
        organizationId: ctx.organizationId,
        status: ApprovalStatus.PENDING,
        type: { in: INBOX_TYPES },
        AND: [visible],
      },
      _count: { _all: true },
    });
    const map = Object.fromEntries(
      groups.map((row) => [row.type, row._count._all]),
    );
    return {
      JOB_COMPLETION: map[ApprovalType.JOB_COMPLETION] ?? 0,
      TIMESHEET: map[ApprovalType.TIMESHEET] ?? 0,
      OVERTIME: map[ApprovalType.OVERTIME] ?? 0,
    };
  }

  private async subjectSummary(
    ctx: OrganizationContext,
    actorUserId: string,
    row: ApprovalRow,
  ) {
    try {
      return await this.subjectDetail(ctx, actorUserId, row, true);
    } catch {
      return null;
    }
  }

  private async subjectDetail(
    ctx: OrganizationContext,
    actorUserId: string,
    row: ApprovalRow,
    summaryOnly = false,
  ) {
    if (row.type === ApprovalType.JOB_COMPLETION) {
      const job = await this.jobs.get(ctx, actorUserId, row.subjectId);
      if (summaryOnly) {
        return {
          kind: 'JOB_COMPLETION' as const,
          job: {
            id: job.id,
            jobNumber: job.jobNumber,
            title: job.title,
            status: job.status,
            client: job.client,
            site: { id: job.site.id, name: job.site.name, city: job.site.city },
            team: job.team,
            technicians: job.technicians,
            workPerformed: job.workPerformed,
            outcome: job.outcome,
            safetySatisfied: job.execution?.safetySatisfied ?? false,
            hasSignature: job.signatures.length > 0,
            hoursMinutes: job.timeEntries.reduce(
              (sum, item) => sum + (item.durationMinutes ?? 0),
              0,
            ),
          },
        };
      }
      return { kind: 'JOB_COMPLETION' as const, job };
    }
    if (row.type === ApprovalType.TIMESHEET) {
      const entry = await this.timesheets.getEntry(ctx, actorUserId, row.subjectId);
      const settings = await this.prisma.organizationSettings.findUnique({
        where: { organizationId: ctx.organizationId },
        select: { timezone: true },
      });
      const timeZone = settings?.timezone ?? ctx.timezone;
      const week = zonedWeekRange(entry.workDate, timeZone);
      return {
        kind: 'TIMESHEET' as const,
        entry,
        weekStart: week.monday,
        weekEnd: addDays(week.monday, 6),
      };
    }
    if (row.type === ApprovalType.OVERTIME) {
      const authorization = await this.overtime.get(
        ctx,
        actorUserId,
        row.subjectId,
      );
      return { kind: 'OVERTIME' as const, authorization };
    }
    return null;
  }

  private serialize(
    row: ApprovalRow,
    subject: unknown,
    canDecide: boolean,
  ) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      type: row.type,
      status: row.status,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      requestedBy: {
        userId: row.requestedBy.id,
        fullName: row.requestedBy.fullName,
      },
      requestedAt: row.requestedAt.toISOString(),
      assignedApprover: row.assignedApprover
        ? {
            userId: row.assignedApprover.id,
            fullName: row.assignedApprover.fullName,
          }
        : null,
      assignedRole: row.assignedRole,
      decidedBy: row.decidedBy
        ? { userId: row.decidedBy.id, fullName: row.decidedBy.fullName }
        : null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decision: row.decision,
      comment: row.comment,
      canDecide: canDecide && row.status === ApprovalStatus.PENDING,
      subject,
    };
  }
}

function asValidation(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { status: 'CLEAR' as const, checks: [] };
  }
  const record = value as { status?: string };
  if (
    record.status === 'CLEAR' ||
    record.status === 'REVIEW' ||
    record.status === 'BLOCKED'
  ) {
    return { status: record.status, checks: [] };
  }
  return { status: 'CLEAR' as const, checks: [] };
}

function addDays(ymd: string, days: number) {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
