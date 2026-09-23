import {
  DEFAULT_DAILY_HOURS_LIMIT,
  DEFAULT_WEEKLY_HOURS_LIMIT,
  MANUAL_TIME_DESCRIPTION_MIN,
  MANUAL_TIME_MIN_MINUTES,
} from '../common/constants.js';
import { formatYmdInZone } from '../common/timezone.js';

export const TIMESHEET_VALIDATION_STATUSES = ['CLEAR', 'REVIEW', 'BLOCKED'] as const;
export type TimesheetValidationStatus =
  (typeof TIMESHEET_VALIDATION_STATUSES)[number];

export const TIMESHEET_CHECK_SEVERITIES = ['WARNING', 'ERROR'] as const;
export type TimesheetCheckSeverity = (typeof TIMESHEET_CHECK_SEVERITIES)[number];

export type TimesheetCheck = {
  code: string;
  severity: TimesheetCheckSeverity;
  message: string;
};

export type TimesheetValidationResult = {
  status: TimesheetValidationStatus;
  checks: TimesheetCheck[];
  overtimeAuthorizationId?: string | null;
};

export type TimesheetEntrySource = 'CLOCK' | 'CLOCK_SESSION' | 'MANUAL';
export type TimesheetEntryType = 'NORMAL' | 'OVERTIME' | 'TRAVEL' | 'STANDBY';

export type TimesheetValidationInput = {
  source: TimesheetEntrySource;
  type: TimesheetEntryType;
  startAt: Date | null;
  endAt: Date | null;
  workDate: string | null;
  description: string | null;
  allowManualTime: boolean;
  now: Date;
  timeZone: string;
  dailyMinutesLimit: number;
  weeklyMinutesLimit: number;
  existingDayMinutes: number;
  existingWeekMinutes: number;
  overlaps: boolean;
  jobStatus?: string | null;
  jobScheduledDate?: string | null;
  overtimeChecks?: TimesheetCheck[];
};

export function durationMinutesFromRange(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

export function hoursToMinutes(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) {
    return hoursToMinutes(DEFAULT_DAILY_HOURS_LIMIT);
  }
  return Math.round(hours * 60);
}

export function defaultDailyMinutes(hours?: number | null) {
  return hoursToMinutes(hours ?? DEFAULT_DAILY_HOURS_LIMIT);
}

export function defaultWeeklyMinutes(hours?: number | null) {
  if (!Number.isFinite(hours ?? NaN) || (hours ?? 0) <= 0) {
    return Math.round(DEFAULT_WEEKLY_HOURS_LIMIT * 60);
  }
  return Math.round((hours as number) * 60);
}

export function isManualSource(source: TimesheetEntrySource) {
  return source === 'MANUAL';
}

export function presentSource(
  source: TimesheetEntrySource | string,
): 'CLOCK' | 'MANUAL' {
  return source === 'MANUAL' ? 'MANUAL' : 'CLOCK';
}

export function presentStatus(status: string) {
  return status === 'SUBMITTED' ? 'PENDING' : status;
}

export function evaluateTimesheetValidation(
  input: TimesheetValidationInput,
): TimesheetValidationResult {
  const checks: TimesheetCheck[] = [];
  const manual = isManualSource(input.source);
  const startAt = input.startAt;
  const endAt = input.endAt;

  if (!startAt) {
    checks.push({
      code: 'START_REQUIRED',
      severity: 'ERROR',
      message: 'Start time is required.',
    });
  }
  if (!endAt) {
    checks.push({
      code: 'FINISH_REQUIRED',
      severity: 'ERROR',
      message: 'Finish time is required.',
    });
  }

  let duration: number | null = null;
  if (startAt && endAt) {
    duration = durationMinutesFromRange(startAt, endAt);
    if (endAt.getTime() <= startAt.getTime()) {
      checks.push({
        code: 'INVALID_RANGE',
        severity: 'ERROR',
        message: 'Finish must be after start.',
      });
    }
    if (duration < 0) {
      checks.push({
        code: 'NEGATIVE_DURATION',
        severity: 'ERROR',
        message: 'Duration cannot be negative.',
      });
    }
  }

  if (manual && !input.allowManualTime) {
    checks.push({
      code: 'MANUAL_DISABLED',
      severity: 'ERROR',
      message: 'Manual time is not enabled for this organization.',
    });
  }

  if (manual && !input.workDate) {
    checks.push({
      code: 'WORK_DATE_REQUIRED',
      severity: 'ERROR',
      message: 'Work date is required.',
    });
  }

  if (manual && input.workDate) {
    const today = formatYmdInZone(input.now, input.timeZone);
    if (input.workDate > today) {
      checks.push({
        code: 'FUTURE_WORK_DATE',
        severity: 'ERROR',
        message: 'Manual time cannot be recorded for a future date.',
      });
    }
  }

  if (manual && duration != null && duration >= 0 && duration < MANUAL_TIME_MIN_MINUTES) {
    checks.push({
      code: 'MIN_DURATION',
      severity: 'ERROR',
      message: `Manual time must be at least ${MANUAL_TIME_MIN_MINUTES} minutes.`,
    });
  }

  if (manual) {
    const description = input.description?.trim() ?? '';
    if (description.length < MANUAL_TIME_DESCRIPTION_MIN) {
      checks.push({
        code: 'MANUAL_DESCRIPTION',
        severity: 'ERROR',
        message: 'Manual time requires a meaningful work description.',
      });
    }
  }

  if (input.overlaps) {
    checks.push({
      code: 'OVERLAP',
      severity: manual ? 'ERROR' : 'WARNING',
      message: manual
        ? 'This entry overlaps another time entry for the same technician.'
        : 'Clocked time overlaps another entry for the same technician.',
    });
  }

  if (duration != null && duration >= 0) {
    const dayTotal = input.existingDayMinutes + duration;
    if (dayTotal > input.dailyMinutesLimit) {
      checks.push({
        code: 'LONG_SHIFT',
        severity: 'WARNING',
        message: 'Total captured time exceeds configured normal daily hours.',
      });
    }
    const weekTotal = input.existingWeekMinutes + duration;
    if (weekTotal > input.weeklyMinutesLimit) {
      checks.push({
        code: 'WEEKLY_LIMIT',
        severity: 'WARNING',
        message: 'Total captured time exceeds configured normal weekly hours.',
      });
    }
  }

  if (
    manual &&
    (input.jobStatus === 'COMPLETED' || input.jobStatus === 'CANCELLED')
  ) {
    checks.push({
      code: 'COMPLETED_JOB',
      severity: 'ERROR',
      message: 'Manual time cannot be added to a completed or cancelled job.',
    });
  }

  if (
    input.workDate &&
    input.jobScheduledDate &&
    input.workDate !== input.jobScheduledDate
  ) {
    checks.push({
      code: 'SCHEDULE_MISMATCH',
      severity: 'WARNING',
      message: 'Work date does not match the job scheduled date.',
    });
  }

  if (input.overtimeChecks?.length) {
    checks.push(...input.overtimeChecks);
  }

  const blocked = checks.some((check) => check.severity === 'ERROR');
  const review = checks.some((check) => check.severity === 'WARNING');
  return {
    status: blocked ? 'BLOCKED' : review ? 'REVIEW' : 'CLEAR',
    checks,
  };
}
