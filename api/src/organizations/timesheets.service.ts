import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_TIME_APPROVED,
  AUDIT_TIME_ENTRY_CREATED,
  AUDIT_TIME_ENTRY_REJECTED,
  AUDIT_TIME_ENTRY_SUBMITTED,
  AUDIT_TIME_ENTRY_UPDATED,
  AUDIT_TIME_RETURNED,
  TIMESHEET_MAX_FUTURE_WEEKS,
} from '../common/constants.js';
import {
  addCalendarDays,
  formatYmdInZone,
  isYmd,
  mondayOnOrBefore,
  zonedLocalToUtc,
  zonedWeekRange,
} from '../common/timezone.js';
import {
  ApprovalStatus,
  ApprovalType,
  MembershipStatus,
  OrganizationRole,
  Prisma,
  TimeEntrySource,
  TimeEntryStatus,
  TimeEntryType,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../subscription/clock.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { canManageCrew } from './crew-access.js';
import { jobVisibilityWhere } from './job-visibility.js';
import { TeamsService } from './teams.service.js';
import {
  canApproveTimesheets,
  canSelectTimesheetTechnician,
} from './timesheet-access.js';
import { evaluateOvertimeAuthorization } from './overtime-validation.js';
import {
  defaultDailyMinutes,
  defaultWeeklyMinutes,
  durationMinutesFromRange,
  evaluateTimesheetValidation,
  presentSource,
  presentStatus,
  type TimesheetValidationResult,
} from './timesheet-validation.js';
import {
  persistValidation,
  TimesheetValidationService,
} from './timesheet-validation.service.js';
import { assertNotSelfApproval } from './approval-access.js';
import { ApprovalNotificationHook } from './approval-events.js';
import { ApprovalRecordsService } from './approval-records.service.js';
import type {
  CreateTimeEntryDto,
  DecideTimeEntryDto,
  ListTimeEntriesQueryDto,
  ListTimesheetQueryDto,
  UpdateTimeEntryDto,
} from './dto/create-time-entry.dto.js';

const EDITABLE: TimeEntryStatus[] = [
  TimeEntryStatus.DRAFT,
  TimeEntryStatus.RETURNED,
];

const SUBMITTABLE: TimeEntryStatus[] = [
  TimeEntryStatus.DRAFT,
  TimeEntryStatus.RETURNED,
];

const DECIDABLE: TimeEntryStatus[] = [
  TimeEntryStatus.PENDING,
  TimeEntryStatus.SUBMITTED,
];

const COUNTED: TimeEntryStatus[] = [
  TimeEntryStatus.DRAFT,
  TimeEntryStatus.SUBMITTED,
  TimeEntryStatus.PENDING,
  TimeEntryStatus.APPROVED,
  TimeEntryStatus.RETURNED,
];

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const entryInclude = {
  user: { select: { id: true, fullName: true } },
  job: { select: { id: true, jobNumber: true, title: true, status: true, scheduledStart: true } },
  overtimeAuthorization: {
    select: {
      id: true,
      organizationId: true,
      userId: true,
      jobId: true,
      workDate: true,
      authorizedStart: true,
      authorizedEnd: true,
      maxMinutes: true,
      status: true,
    },
  },
} satisfies Prisma.TimeEntryInclude;

type EntryRow = Prisma.TimeEntryGetPayload<{ include: typeof entryInclude }>;

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly teams: TeamsService,
    private readonly validation: TimesheetValidationService,
    private readonly approvals: ApprovalRecordsService,
    private readonly approvalEvents: ApprovalNotificationHook,
    private readonly mail: MailService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async week(
    ctx: OrganizationContext,
    actorUserId: string,
    query: ListTimesheetQueryDto,
  ) {
    const settings = await this.requireSettings(ctx.organizationId);
    const visible = await this.visibleTechnicianUserIds(ctx, actorUserId);
    const requested = query.userId ?? actorUserId;
    if (!visible.includes(requested)) {
      throw new NotFoundException();
    }

    const today = formatYmdInZone(this.clock.now(), settings.timeZone);
    const currentMonday = mondayOnOrBefore(today, settings.timeZone);
    const maxMonday = addCalendarDays(
      currentMonday,
      TIMESHEET_MAX_FUTURE_WEEKS * 7,
    );
    const requestedMonday =
      query.weekStart && isYmd(query.weekStart)
        ? mondayOnOrBefore(query.weekStart, settings.timeZone)
        : currentMonday;
    const weekStart = requestedMonday > maxMonday ? maxMonday : requestedMonday;
    const week = zonedWeekRange(weekStart, settings.timeZone);
    const weekEnd = addCalendarDays(week.monday, 6);

    const [entries, technicians] = await Promise.all([
      this.prisma.timeEntry.findMany({
        where: {
          organizationId: ctx.organizationId,
          userId: requested,
          workDate: {
            gte: toWorkDate(week.monday),
            lte: toWorkDate(weekEnd),
          },
        },
        include: entryInclude,
        orderBy: [{ startedAt: 'asc' }],
      }),
      this.prisma.organizationMember.findMany({
        where: {
          organizationId: ctx.organizationId,
          userId: { in: visible },
          status: MembershipStatus.ACTIVE,
        },
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { user: { fullName: 'asc' } },
      }),
    ]);

    const recentRows = await this.prisma.timeEntry.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: requested,
      },
      include: entryInclude,
      orderBy: { startedAt: 'desc' },
      take: 12,
    });

    const presented = entries.map((row) =>
      this.serializeEntry(
        row,
        this.validationForRow(row, entries, settings, this.clock.now()),
      ),
    );
    const recent = recentRows.map((row) =>
      this.serializeEntry(
        row,
        this.asStoredValidation(row) ??
          this.validationForRow(row, recentRows, settings, this.clock.now()),
      ),
    );

    const days = WEEKDAYS.map((weekday, index) => {
      const date = addCalendarDays(week.monday, index);
      const dayEntries = presented.filter((entry) => entry.workDate === date);
      const totalMinutes = sumMinutes(dayEntries);
      return {
        date,
        weekday,
        weekdayLabel: WEEKDAY_LABELS[index],
        totalMinutes,
        normalMinutes: sumMinutes(dayEntries, (entry) => entry.type === 'NORMAL'),
        overtimeMinutes: sumMinutes(
          dayEntries,
          (entry) => entry.type === 'OVERTIME',
        ),
        entries: dayEntries,
      };
    });

    const technician = technicians.find((row) => row.userId === requested)?.user;
    return {
      weekStart: week.monday,
      weekEnd,
      timezone: settings.timeZone,
      technician: technician
        ? { userId: technician.id, fullName: technician.fullName }
        : { userId: requested, fullName: 'Technician' },
      technicians: technicians.map((row) => ({
        userId: row.user.id,
        fullName: row.user.fullName,
      })),
      days,
      totals: {
        weekMinutes: sumMinutes(presented),
        normalMinutes: sumMinutes(presented, (entry) => entry.type === 'NORMAL'),
        overtimeMinutes: sumMinutes(
          presented,
          (entry) => entry.type === 'OVERTIME',
        ),
        travelMinutes: sumMinutes(presented, (entry) => entry.type === 'TRAVEL'),
        standbyMinutes: sumMinutes(
          presented,
          (entry) => entry.type === 'STANDBY',
        ),
        pendingMinutes: sumMinutes(
          presented,
          (entry) => entry.status === 'PENDING' || entry.status === 'DRAFT',
        ),
        approvedMinutes: sumMinutes(
          presented,
          (entry) => entry.status === 'APPROVED',
        ),
      },
      recent,
      settings: {
        allowManualTime: settings.allowManualTime,
        allowOvertimeRequests: settings.allowOvertimeRequests,
        defaultDailyHoursLimit: settings.dailyHours,
        defaultWeeklyHoursLimit: settings.weeklyHours,
      },
      canCreateManual: settings.allowManualTime,
      canRequestOvertime:
        settings.allowOvertimeRequests || canApproveTimesheets(ctx.role),
      canApprove: canApproveTimesheets(ctx.role),
      canSelectTechnician: canSelectTimesheetTechnician(ctx.role),
      currentWeekStart: currentMonday,
      maxWeekStart: maxMonday,
    };
  }

  async listEntries(
    ctx: OrganizationContext,
    actorUserId: string,
    query: ListTimeEntriesQueryDto,
  ) {
    const visible = await this.visibleTechnicianUserIds(ctx, actorUserId);
    const userId = query.userId ?? actorUserId;
    if (!visible.includes(userId)) {
      throw new NotFoundException();
    }
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Prisma.TimeEntryWhereInput = {
      organizationId: ctx.organizationId,
      userId,
      ...(query.from || query.to
        ? {
            workDate: {
              ...(query.from ? { gte: toWorkDate(query.from) } : {}),
              ...(query.to ? { lte: toWorkDate(query.to) } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.timeEntry.count({ where }),
      this.prisma.timeEntry.findMany({
        where,
        include: entryInclude,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const settings = await this.requireSettings(ctx.organizationId);
    return {
      items: rows.map((row) =>
        this.serializeEntry(
          row,
          this.asStoredValidation(row) ??
            this.validationForRow(row, rows, settings, this.clock.now()),
        ),
      ),
      total,
      page,
      pageSize,
    };
  }

  async createManual(
    ctx: OrganizationContext,
    actorUserId: string,
    dto: CreateTimeEntryDto,
  ) {
    const settings = await this.requireSettings(ctx.organizationId);
    const subjectUserId = await this.resolveSubjectUser(
      ctx,
      actorUserId,
      dto.userId,
    );
    const job = await this.requireVisibleJob(ctx, actorUserId, dto.jobId);
    const range = this.rangeFromDto(
      dto.workDate,
      dto.startTime,
      dto.endTime,
      settings.timeZone,
    );
    const durationMinutes = durationMinutesFromRange(range.startAt, range.endAt);
    const validation = await this.validation.evaluate({
      organizationId: ctx.organizationId,
      userId: subjectUserId,
      source: TimeEntrySource.MANUAL,
      type: dto.type,
      startAt: range.startAt,
      endAt: range.endAt,
      workDate: dto.workDate,
      description: dto.description,
      jobId: job.id,
      now: this.clock.now(),
      overtimeAuthorizationId: dto.overtimeAuthorizationId,
      durationMinutes,
    });
    this.assertNotBlocked(validation);

    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.timeEntry.create({
        data: {
          organizationId: ctx.organizationId,
          userId: subjectUserId,
          jobId: job.id,
          workDate: toWorkDate(dto.workDate),
          startedAt: range.startAt,
          endedAt: range.endAt,
          durationMinutes,
          type: dto.type as TimeEntryType,
          source: TimeEntrySource.MANUAL,
          notes: dto.description.trim(),
          status: TimeEntryStatus.PENDING,
          validation: persistValidation(validation),
          overtimeAuthorizationId:
            dto.type === 'OVERTIME'
              ? (validation.overtimeAuthorizationId ?? null)
              : null,
        },
        include: entryInclude,
      });
      await this.audit.record(
        {
          action: AUDIT_TIME_ENTRY_CREATED,
          entityType: 'TimeEntry',
          entityId: entry.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: {
            userId: subjectUserId,
            jobId: job.id,
            workDate: dto.workDate,
            durationMinutes,
            type: dto.type,
            source: 'MANUAL',
            validation,
          },
        },
        tx,
      );
      return entry;
    });
    return this.serializeEntry(created, validation);
  }

  async updateManual(
    ctx: OrganizationContext,
    actorUserId: string,
    entryId: string,
    dto: UpdateTimeEntryDto,
  ) {
    const existing = await this.requireVisibleEntry(ctx, actorUserId, entryId);
    this.assertCanEdit(ctx, actorUserId, existing);
    if (!EDITABLE.includes(existing.status)) {
      throw new BadRequestException('Only draft or returned entries can be edited');
    }
    if (existing.source !== TimeEntrySource.MANUAL) {
      throw new BadRequestException('Clock entries cannot be edited as manual time');
    }
    const settings = await this.requireSettings(ctx.organizationId);
    const workDate = dto.workDate ?? workDateYmd(existing.workDate);
    const startTime = dto.startTime ?? timeInZone(existing.startedAt, settings.timeZone);
    const endTime =
      dto.endTime ??
      (existing.endedAt
        ? timeInZone(existing.endedAt, settings.timeZone)
        : startTime);
    const jobId = dto.jobId ?? existing.jobId;
    if (!jobId) {
      throw new BadRequestException('Job is required');
    }
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    const range = this.rangeFromDto(workDate, startTime, endTime, settings.timeZone);
    const description = (dto.description ?? existing.notes ?? '').trim();
    const type = (dto.type ?? existing.type) as TimeEntryType;
    const durationMinutes = durationMinutesFromRange(range.startAt, range.endAt);
    const validation = await this.validation.evaluate({
      organizationId: ctx.organizationId,
      userId: existing.userId,
      excludeEntryId: existing.id,
      source: TimeEntrySource.MANUAL,
      type,
      startAt: range.startAt,
      endAt: range.endAt,
      workDate,
      description,
      jobId: job.id,
      now: this.clock.now(),
      overtimeAuthorizationId:
        dto.overtimeAuthorizationId ?? existing.overtimeAuthorizationId,
      durationMinutes,
    });
    this.assertNotBlocked(validation);

    const updated = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.timeEntry.update({
        where: { id: existing.id },
        data: {
          jobId: job.id,
          workDate: toWorkDate(workDate),
          startedAt: range.startAt,
          endedAt: range.endAt,
          durationMinutes,
          type,
          notes: description,
          overtimeAuthorizationId:
            type === TimeEntryType.OVERTIME
              ? (validation.overtimeAuthorizationId ?? null)
              : null,
          status:
            existing.status === TimeEntryStatus.RETURNED
              ? TimeEntryStatus.PENDING
              : existing.status,
          validation: persistValidation(validation),
        },
        include: entryInclude,
      });
      await this.audit.record(
        {
          action: AUDIT_TIME_ENTRY_UPDATED,
          entityType: 'TimeEntry',
          entityId: entry.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { durationMinutes: existing.durationMinutes },
          newValues: { durationMinutes, workDate, validation },
        },
        tx,
      );
      return entry;
    });
    return this.serializeEntry(updated, validation);
  }

  async submit(
    ctx: OrganizationContext,
    actorUserId: string,
    entryId: string,
  ) {
    const existing = await this.requireVisibleEntry(ctx, actorUserId, entryId);
    this.assertCanEdit(ctx, actorUserId, existing);
    if (!SUBMITTABLE.includes(existing.status)) {
      throw new BadRequestException('This entry cannot be submitted');
    }
    const validation = await this.validation.evaluate({
      organizationId: ctx.organizationId,
      userId: existing.userId,
      excludeEntryId: existing.id,
      source: existing.source,
      type: existing.type,
      startAt: existing.startedAt,
      endAt: existing.endedAt,
      workDate: workDateYmd(existing.workDate),
      description: existing.notes,
      jobId: existing.jobId,
      now: this.clock.now(),
      overtimeAuthorizationId: existing.overtimeAuthorizationId,
    });
    this.assertNotBlocked(validation);
    const updated = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.timeEntry.update({
        where: { id: existing.id },
        data: {
          status: TimeEntryStatus.PENDING,
          validation: persistValidation(validation),
        },
        include: entryInclude,
      });
      await this.approvals.ensurePending(
        {
          organizationId: ctx.organizationId,
          type: ApprovalType.TIMESHEET,
          subjectType: 'TimeEntry',
          subjectId: entry.id,
          requestedByUserId: actorUserId,
          assignedApproverUserId: entry.job
            ? await this.jobSupervisorId(ctx.organizationId, entry.job.id, tx)
            : null,
          assignedRole: OrganizationRole.SUPERVISOR,
        },
        tx,
      );
      await this.audit.record(
        {
          action: AUDIT_TIME_ENTRY_SUBMITTED,
          entityType: 'TimeEntry',
          entityId: entry.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { status: existing.status },
          newValues: { status: TimeEntryStatus.PENDING, validation },
        },
        tx,
      );
      await this.approvalEvents.emit(
        {
          type: 'TIME_APPROVAL_REQUESTED',
          organizationId: ctx.organizationId,
          subjectId: entry.id,
          actorUserId,
          recipientUserIds: [
            entry.job
              ? await this.jobSupervisorId(ctx.organizationId, entry.job.id, tx)
              : null,
          ].filter((id): id is string => Boolean(id)),
          title: 'Timesheet submitted',
          body: `${entry.user.fullName} submitted time for review.`,
          payload: { status: TimeEntryStatus.PENDING },
        },
        tx,
      );
      return entry;
    });
    return this.serializeEntry(updated, validation);
  }

  async decide(
    ctx: OrganizationContext,
    actorUserId: string,
    entryId: string,
    dto: DecideTimeEntryDto,
  ) {
    if (!canApproveTimesheets(ctx.role)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    const existing = await this.requireVisibleEntry(ctx, actorUserId, entryId);
    assertNotSelfApproval(actorUserId, [existing.userId]);
    if (!DECIDABLE.includes(existing.status)) {
      throw new BadRequestException('This entry is not waiting for a decision');
    }
    const stored =
      this.asStoredValidation(existing) ?? {
        status: 'CLEAR' as const,
        checks: [],
      };
    if (dto.decision === 'APPROVED' && stored.status === 'BLOCKED') {
      throw new BadRequestException('Blocked time cannot be approved');
    }
    if (dto.decision === 'RETURNED' && !dto.comment?.trim()) {
      throw new BadRequestException('A return comment is required');
    }
    const next =
      dto.decision === 'APPROVED'
        ? TimeEntryStatus.APPROVED
        : dto.decision === 'RETURNED'
          ? TimeEntryStatus.RETURNED
          : TimeEntryStatus.REJECTED;
    const action =
      next === TimeEntryStatus.APPROVED
        ? AUDIT_TIME_APPROVED
        : next === TimeEntryStatus.RETURNED
          ? AUDIT_TIME_RETURNED
          : AUDIT_TIME_ENTRY_REJECTED;
    const approvalStatus =
      next === TimeEntryStatus.APPROVED
        ? ApprovalStatus.APPROVED
        : next === TimeEntryStatus.RETURNED
          ? ApprovalStatus.RETURNED
          : ApprovalStatus.REJECTED;
    const updated = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.timeEntry.update({
        where: { id: existing.id },
        data: { status: next },
        include: entryInclude,
      });
      await this.approvals.markDecided(
        {
          organizationId: ctx.organizationId,
          type: ApprovalType.TIMESHEET,
          subjectId: entry.id,
          status: approvalStatus,
          decision: dto.decision,
          comment: dto.comment,
          decidedByUserId: actorUserId,
          decidedAt: this.clock.now(),
        },
        tx,
      );
      await this.audit.record(
        {
          action,
          entityType: 'TimeEntry',
          entityId: entry.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { status: existing.status },
          newValues: { status: next, comment: dto.comment ?? null },
        },
        tx,
      );
      await this.approvalEvents.emit(
        {
          type:
            next === TimeEntryStatus.APPROVED
              ? 'TIME_APPROVED'
              : 'TIME_RETURNED',
          organizationId: ctx.organizationId,
          subjectId: entry.id,
          actorUserId,
          recipientUserIds: [entry.userId],
          title:
            next === TimeEntryStatus.APPROVED
              ? 'Time approved'
              : 'Time returned',
          body:
            next === TimeEntryStatus.APPROVED
              ? 'Your timesheet was approved.'
              : `Your timesheet was returned${dto.comment ? `: ${dto.comment}` : '.'}`,
          payload: { status: next, comment: dto.comment ?? null },
        },
        tx,
      );
      return entry;
    });
    if (next === TimeEntryStatus.RETURNED && dto.comment?.trim()) {
      const user = await this.prisma.user.findUnique({
        where: { id: updated.userId },
        select: { email: true, fullName: true },
      });
      if (user) {
        await this.mail.sendTimesheetReturned({
          to: user.email,
          recipientName: user.fullName,
          organizationName: ctx.name,
          orgSlug: ctx.slug,
          workDate: workDateYmd(updated.workDate),
          reason: dto.comment.trim(),
        });
      }
    }
    return this.serializeEntry(
      updated,
      this.asStoredValidation(updated) ?? {
        status: 'CLEAR',
        checks: [],
      },
    );
  }

  async getEntry(
    ctx: OrganizationContext,
    actorUserId: string,
    entryId: string,
  ) {
    const entry = await this.requireVisibleEntry(ctx, actorUserId, entryId);
    const settings = await this.requireSettings(ctx.organizationId);
    return this.serializeEntry(
      entry,
      this.asStoredValidation(entry) ??
        this.validationForRow(entry, [entry], settings, this.clock.now()),
    );
  }

  private serializeEntry(
    row: EntryRow,
    validation: TimesheetValidationResult,
  ) {
    const authorization = row.overtimeAuthorization;
    return {
      id: row.id,
      organizationId: row.organizationId,
      technician: { userId: row.user.id, fullName: row.user.fullName },
      job: row.job
        ? {
            id: row.job.id,
            jobNumber: row.job.jobNumber,
            title: row.job.title,
          }
        : null,
      workDate: workDateYmd(row.workDate),
      startAt: row.startedAt.toISOString(),
      endAt: row.endedAt?.toISOString() ?? null,
      durationMinutes: row.durationMinutes,
      type: row.type,
      source: presentSource(row.source),
      description: row.notes,
      status: presentStatus(row.status),
      validation,
      clockSessionId: row.clockSessionId,
      overtimeAuthorization: authorization
        ? {
            id: authorization.id,
            status: authorization.status,
            maxMinutes: authorization.maxMinutes,
          }
        : null,
    };
  }

  private validationForRow(
    row: EntryRow,
    siblings: EntryRow[],
    settings: Awaited<ReturnType<TimesheetsService['requireSettings']>>,
    now: Date,
  ): TimesheetValidationResult {
    const workDate = workDateYmd(row.workDate);
    const others = siblings.filter(
      (item) => item.id !== row.id && COUNTED.includes(item.status),
    );
    const week = zonedWeekRange(workDate, settings.timeZone);
    const existingDayMinutes = others
      .filter((item) => workDateYmd(item.workDate) === workDate)
      .reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0);
    const existingWeekMinutes = others
      .filter((item) => {
        const ymd = workDateYmd(item.workDate);
        return ymd >= week.monday && ymd <= addCalendarDays(week.monday, 6);
      })
      .reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0);
    const rowEnd = row.endedAt;
    const overlaps = Boolean(
      rowEnd &&
        others.some((item) => {
          if (item.endedAt == null) return false;
          return (
            row.startedAt.getTime() < item.endedAt.getTime() &&
            item.startedAt.getTime() < rowEnd.getTime()
          );
        }),
    );
    const usedMinutes = others
      .filter(
        (item) =>
          item.overtimeAuthorizationId &&
          item.overtimeAuthorizationId === row.overtimeAuthorizationId,
      )
      .reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0);
    const overtimeChecks = evaluateOvertimeAuthorization({
      type: row.type,
      organizationId: row.organizationId,
      technicianUserId: row.userId,
      jobId: row.jobId,
      workDate,
      startAt: row.startedAt,
      endAt: row.endedAt,
      durationMinutes: row.durationMinutes,
      linkedAuthorizationId: row.overtimeAuthorizationId,
      authorization: row.overtimeAuthorization
        ? {
            id: row.overtimeAuthorization.id,
            organizationId: row.overtimeAuthorization.organizationId,
            userId: row.overtimeAuthorization.userId,
            jobId: row.overtimeAuthorization.jobId,
            workDate: workDateYmd(row.overtimeAuthorization.workDate),
            authorizedStart: row.overtimeAuthorization.authorizedStart,
            authorizedEnd: row.overtimeAuthorization.authorizedEnd,
            maxMinutes: row.overtimeAuthorization.maxMinutes,
            status: row.overtimeAuthorization.status,
          }
        : null,
      usedMinutes,
    });
    return evaluateTimesheetValidation({
      source: presentSource(row.source),
      type: row.type,
      startAt: row.startedAt,
      endAt: row.endedAt,
      workDate,
      description: row.notes,
      allowManualTime: settings.allowManualTime,
      now,
      timeZone: settings.timeZone,
      dailyMinutesLimit: defaultDailyMinutes(settings.dailyHours),
      weeklyMinutesLimit: defaultWeeklyMinutes(settings.weeklyHours),
      existingDayMinutes,
      existingWeekMinutes,
      overlaps,
      jobStatus: row.job?.status ?? null,
      jobScheduledDate: row.job?.scheduledStart
        ? formatYmdInZone(row.job.scheduledStart, settings.timeZone)
        : null,
      overtimeChecks,
    });
  }

  private asStoredValidation(row: { validation: Prisma.JsonValue | null }) {
    if (!row.validation || typeof row.validation !== 'object') return null;
    const payload = row.validation as TimesheetValidationResult;
    if (!payload.status || !Array.isArray(payload.checks)) return null;
    return payload;
  }

  private rangeFromDto(
    workDate: string,
    startTime: string,
    endTime: string,
    timeZone: string,
  ) {
    const start = normalizeTime(startTime);
    const finish = normalizeTime(endTime);
    const startAt = zonedLocalToUtc(workDate, start, timeZone);
    const endAt = zonedLocalToUtc(workDate, finish, timeZone);
    return { startAt, endAt };
  }

  private assertNotBlocked(validation: TimesheetValidationResult) {
    if (validation.status !== 'BLOCKED') return;
    const first =
      validation.checks.find((check) => check.severity === 'ERROR')?.message ??
      'Time entry is blocked';
    throw new BadRequestException({
      statusCode: 400,
      error: 'TIMESHEET_BLOCKED',
      message: first,
      validation,
    });
  }

  private async requireSettings(organizationId: string) {
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId },
    });
    return {
      timeZone: settings?.timezone ?? 'UTC',
      allowManualTime: settings?.allowManualTime ?? false,
      allowOvertimeRequests: settings?.allowOvertimeRequests ?? true,
      dailyHours: settings ? Number(settings.defaultDailyHoursLimit) : 8,
      weeklyHours: settings ? Number(settings.defaultWeeklyHoursLimit) : 40,
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
      if (teamIds.length === 0) {
        return [actorUserId];
      }
      const members = await this.prisma.teamMember.findMany({
        where: {
          organizationId: ctx.organizationId,
          teamId: { in: teamIds },
        },
        select: { userId: true },
      });
      return [...new Set([actorUserId, ...members.map((row) => row.userId)])];
    }
    return [actorUserId];
  }

  private async resolveSubjectUser(
    ctx: OrganizationContext,
    actorUserId: string,
    requestedUserId?: string,
  ) {
    const subject = requestedUserId ?? actorUserId;
    const visible = await this.visibleTechnicianUserIds(ctx, actorUserId);
    if (!visible.includes(subject)) {
      throw new NotFoundException();
    }
    return subject;
  }

  private async jobSupervisorId(
    organizationId: string,
    jobId: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const job = await db.job.findFirst({
      where: { id: jobId, organizationId },
      select: { supervisorUserId: true },
    });
    return job?.supervisorUserId ?? null;
  }

  private async requireVisibleEntry(
    ctx: OrganizationContext,
    actorUserId: string,
    entryId: string,
  ) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { id: entryId, organizationId: ctx.organizationId },
      include: entryInclude,
    });
    if (!entry) {
      throw new NotFoundException();
    }
    const visible = await this.visibleTechnicianUserIds(ctx, actorUserId);
    if (!visible.includes(entry.userId)) {
      throw new NotFoundException();
    }
    return entry;
  }

  private async requireVisibleJob(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
  ) {
    const visibleTeamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
    const job = await this.prisma.job.findFirst({
      where: {
        AND: [
          jobVisibilityWhere(ctx, actorUserId, visibleTeamIds),
          { id: jobId },
        ],
      },
      select: { id: true, status: true },
    });
    if (!job) {
      throw new NotFoundException();
    }
    return job;
  }

  private assertCanEdit(
    ctx: OrganizationContext,
    actorUserId: string,
    entry: { userId: string },
  ) {
    if (entry.userId === actorUserId) return;
    if (canManageCrew(ctx.role) || ctx.role === OrganizationRole.SUPERVISOR) {
      return;
    }
    throw new ForbiddenException('Insufficient organization role');
  }
}

function toWorkDate(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function workDateYmd(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeTime(value: string) {
  return value.length === 5 ? `${value}:00` : value;
}

function timeInZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(value);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = bag.hour === '24' ? '00' : bag.hour;
  return `${hour}:${bag.minute}:00`;
}

function sumMinutes<T extends { durationMinutes: number | null }>(
  rows: T[],
  predicate?: (row: T) => boolean,
) {
  return rows
    .filter((row) => (predicate ? predicate(row) : true))
    .reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);
}
