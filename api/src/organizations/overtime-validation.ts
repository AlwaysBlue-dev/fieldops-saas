import { durationMinutesFromRange, type TimesheetCheck } from './timesheet-validation.js';

export type OvertimeAuthorizationView = {
  id: string;
  organizationId: string;
  userId: string;
  jobId: string;
  workDate: string;
  authorizedStart: Date;
  authorizedEnd: Date;
  maxMinutes: number;
  status: string;
};

export type OvertimeValidationInput = {
  type: string;
  organizationId: string;
  technicianUserId: string;
  jobId: string | null;
  workDate: string | null;
  startAt: Date | null;
  endAt: Date | null;
  durationMinutes: number | null;
  linkedAuthorizationId: string | null;
  authorization: OvertimeAuthorizationView | null;
  usedMinutes: number;
};

export function evaluateOvertimeAuthorization(
  input: OvertimeValidationInput,
): TimesheetCheck[] {
  if (input.type !== 'OVERTIME') {
    return [];
  }

  if (!input.authorization) {
    return [
      {
        code: 'OVERTIME_UNAUTHORIZED',
        severity: 'ERROR',
        message:
          'An approved overtime authorization is required for this technician, job, and work date.',
      },
    ];
  }

  const checks: TimesheetCheck[] = [];
  const auth = input.authorization;

  if (auth.status !== 'APPROVED') {
    checks.push({
      code: 'OVERTIME_UNAUTHORIZED',
      severity: 'ERROR',
      message: 'Only an approved overtime authorization can cover overtime time.',
    });
  }

  if (
    input.linkedAuthorizationId &&
    input.linkedAuthorizationId !== auth.id
  ) {
    checks.push({
      code: 'OVERTIME_UNAUTHORIZED',
      severity: 'ERROR',
      message: 'Time entry must be linked to the matching overtime authorization.',
    });
  }

  if (!input.linkedAuthorizationId) {
    checks.push({
      code: 'OVERTIME_UNAUTHORIZED',
      severity: 'ERROR',
      message: 'Overtime time must be linked to an approved authorization.',
    });
  }

  if (auth.organizationId !== input.organizationId) {
    checks.push({
      code: 'OVERTIME_WRONG_ORGANIZATION',
      severity: 'ERROR',
      message: 'Overtime authorization belongs to another organization.',
    });
  }

  if (auth.userId !== input.technicianUserId) {
    checks.push({
      code: 'OVERTIME_WRONG_TECHNICIAN',
      severity: 'ERROR',
      message: 'Overtime authorization is for a different technician.',
    });
  }

  if (!input.jobId || auth.jobId !== input.jobId) {
    checks.push({
      code: 'OVERTIME_WRONG_JOB',
      severity: 'ERROR',
      message: 'Overtime authorization is for a different job.',
    });
  }

  if (!input.workDate || auth.workDate !== input.workDate) {
    checks.push({
      code: 'OVERTIME_WRONG_DATE',
      severity: 'ERROR',
      message: 'Overtime authorization is for a different work date.',
    });
  }

  if (input.startAt && input.endAt) {
    if (
      input.startAt.getTime() < auth.authorizedStart.getTime() ||
      input.endAt.getTime() > auth.authorizedEnd.getTime()
    ) {
      checks.push({
        code: 'OVERTIME_OUTSIDE_WINDOW',
        severity: 'ERROR',
        message: 'Overtime must fall entirely within the authorized window.',
      });
    }
  }

  const duration =
    input.durationMinutes ??
    (input.startAt && input.endAt
      ? durationMinutesFromRange(input.startAt, input.endAt)
      : 0);
  if (duration + input.usedMinutes > auth.maxMinutes) {
    checks.push({
      code: 'OVERTIME_EXCEEDS_MAX',
      severity: 'ERROR',
      message: 'Overtime exceeds the authorized maximum minutes.',
    });
  }

  return checks;
}
