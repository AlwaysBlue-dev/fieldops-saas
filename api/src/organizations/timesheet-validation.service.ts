import { Injectable } from '@nestjs/common';
import {
  TimeEntrySource,
  TimeEntryStatus,
  TimeEntryType,
} from '../generated/prisma/client.js';
import {
  formatYmdInZone,
  windowsOverlap,
  zonedWeekRange,
} from '../common/timezone.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OvertimeValidationService } from './overtime-validation.service.js';
import {
  defaultDailyMinutes,
  defaultWeeklyMinutes,
  durationMinutesFromRange,
  evaluateTimesheetValidation,
  presentSource,
  type TimesheetEntrySource,
  type TimesheetEntryType,
  type TimesheetValidationResult,
} from './timesheet-validation.js';

const COUNTED_STATUSES: TimeEntryStatus[] = [
  TimeEntryStatus.DRAFT,
  TimeEntryStatus.SUBMITTED,
  TimeEntryStatus.PENDING,
  TimeEntryStatus.APPROVED,
  TimeEntryStatus.RETURNED,
];

export type TimesheetValidationContext = {
  organizationId: string;
  userId: string;
  excludeEntryId?: string | null;
  source: TimesheetEntrySource | TimeEntrySource;
  type: TimesheetEntryType | TimeEntryType;
  startAt: Date | null;
  endAt: Date | null;
  workDate: string | null;
  description: string | null;
  jobId?: string | null;
  now: Date;
  overtimeAuthorizationId?: string | null;
  durationMinutes?: number | null;
};

@Injectable()
export class TimesheetValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly overtime: OvertimeValidationService,
  ) {}

  async evaluate(
    input: TimesheetValidationContext,
  ): Promise<TimesheetValidationResult> {
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId: input.organizationId },
    });
    const timeZone = settings?.timezone ?? 'UTC';
    const workDate = input.workDate;
    const siblings =
      workDate && input.startAt && input.endAt
        ? await this.prisma.timeEntry.findMany({
            where: {
              organizationId: input.organizationId,
              userId: input.userId,
              status: { in: COUNTED_STATUSES },
              ...(input.excludeEntryId
                ? { id: { not: input.excludeEntryId } }
                : {}),
            },
            select: {
              id: true,
              workDate: true,
              startedAt: true,
              endedAt: true,
              durationMinutes: true,
            },
          })
        : [];

    const week = workDate ? zonedWeekRange(workDate, timeZone) : null;
    const existingDayMinutes = siblings
      .filter((row) => workDateYmd(row.workDate) === workDate)
      .reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);
    const existingWeekMinutes = siblings
      .filter((row) => {
        const ymd = workDateYmd(row.workDate);
        return week ? ymd >= week.monday && ymd < addDays(week.monday, 7) : false;
      })
      .reduce((sum, row) => sum + (row.durationMinutes ?? 0), 0);

    const overlaps =
      Boolean(input.startAt && input.endAt) &&
      siblings.some(
        (row) =>
          row.endedAt != null &&
          windowsOverlap(
            { start: input.startAt as Date, end: input.endAt as Date },
            { start: row.startedAt, end: row.endedAt },
          ),
      );

    const job = input.jobId
      ? await this.prisma.job.findFirst({
          where: { id: input.jobId, organizationId: input.organizationId },
          select: { status: true, scheduledStart: true },
        })
      : null;

    const durationMinutes =
      input.durationMinutes ??
      (input.startAt && input.endAt
        ? durationMinutesFromRange(input.startAt, input.endAt)
        : null);
    const overtime = await this.overtime.evaluateForEntry({
      organizationId: input.organizationId,
      technicianUserId: input.userId,
      jobId: input.jobId ?? null,
      workDate,
      startAt: input.startAt,
      endAt: input.endAt,
      durationMinutes,
      type: input.type,
      preferredAuthorizationId: input.overtimeAuthorizationId,
      excludeEntryId: input.excludeEntryId,
    });

    return {
      ...evaluateTimesheetValidation({
        source: presentSource(input.source),
        type: input.type,
        startAt: input.startAt,
        endAt: input.endAt,
        workDate,
        description: input.description,
        allowManualTime: settings?.allowManualTime ?? false,
        now: input.now,
        timeZone,
        dailyMinutesLimit: defaultDailyMinutes(
          settings ? Number(settings.defaultDailyHoursLimit) : null,
        ),
        weeklyMinutesLimit: defaultWeeklyMinutes(
          settings ? Number(settings.defaultWeeklyHoursLimit) : null,
        ),
        existingDayMinutes,
        existingWeekMinutes,
        overlaps,
        jobStatus: job?.status ?? null,
        jobScheduledDate: job?.scheduledStart
          ? formatYmdInZone(job.scheduledStart, timeZone)
          : null,
        overtimeChecks: overtime.checks,
      }),
      overtimeAuthorizationId: overtime.authorization?.id ?? null,
    };
  }
}

export function persistValidation(result: TimesheetValidationResult) {
  return {
    status: result.status,
    checks: result.checks,
  };
}

function workDateYmd(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number) {
  const [year, month, day] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}
