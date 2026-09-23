import { describe, expect, it } from 'vitest';
import {
  defaultDailyMinutes,
  defaultWeeklyMinutes,
  durationMinutesFromRange,
  evaluateTimesheetValidation,
  presentSource,
  presentStatus,
  type TimesheetValidationInput,
} from './timesheet-validation.js';

const now = new Date('2026-09-23T15:00:00.000Z');

function base(
  overrides: Partial<TimesheetValidationInput> = {},
): TimesheetValidationInput {
  return {
    source: 'MANUAL',
    type: 'NORMAL',
    startAt: new Date('2026-09-22T13:00:00.000Z'),
    endAt: new Date('2026-09-22T21:00:00.000Z'),
    workDate: '2026-09-22',
    description: 'Panel inspection and breaker replacement.',
    allowManualTime: true,
    now,
    timeZone: 'America/Chicago',
    dailyMinutesLimit: defaultDailyMinutes(8),
    weeklyMinutesLimit: defaultWeeklyMinutes(40),
    existingDayMinutes: 0,
    existingWeekMinutes: 0,
    overlaps: false,
    jobStatus: 'IN_PROGRESS',
    jobScheduledDate: '2026-09-22',
    overtimeChecks: [],
    ...overrides,
  };
}

function codes(input: Partial<TimesheetValidationInput> = {}) {
  return evaluateTimesheetValidation(base(input)).checks.map((check) => check.code);
}

describe('evaluateTimesheetValidation', () => {
  it('returns CLEAR for a valid manual entry', () => {
    const result = evaluateTimesheetValidation(base());
    expect(result.status).toBe('CLEAR');
    expect(result.checks).toEqual([]);
  });

  it('blocks missing start and finish', () => {
    const result = evaluateTimesheetValidation(
      base({ startAt: null, endAt: null }),
    );
    expect(result.status).toBe('BLOCKED');
    expect(codes({ startAt: null, endAt: null })).toEqual(
      expect.arrayContaining(['START_REQUIRED', 'FINISH_REQUIRED']),
    );
  });

  it('blocks an invalid range and negative duration', () => {
    const startAt = new Date('2026-09-22T21:00:00.000Z');
    const endAt = new Date('2026-09-22T13:00:00.000Z');
    const result = evaluateTimesheetValidation(base({ startAt, endAt }));
    expect(result.status).toBe('BLOCKED');
    expect(result.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining(['INVALID_RANGE', 'NEGATIVE_DURATION']),
    );
    expect(durationMinutesFromRange(startAt, endAt)).toBeLessThan(0);
  });

  it('blocks a future manual work date', () => {
    const result = evaluateTimesheetValidation(
      base({
        workDate: '2026-09-24',
        startAt: new Date('2026-09-24T13:00:00.000Z'),
        endAt: new Date('2026-09-24T21:00:00.000Z'),
        jobScheduledDate: '2026-09-24',
      }),
    );
    expect(result.status).toBe('BLOCKED');
    expect(result.checks.map((check) => check.code)).toContain('FUTURE_WORK_DATE');
  });

  it('allows today in the organization timezone', () => {
    const result = evaluateTimesheetValidation(
      base({
        workDate: '2026-09-23',
        startAt: new Date('2026-09-23T13:00:00.000Z'),
        endAt: new Date('2026-09-23T21:00:00.000Z'),
        jobScheduledDate: '2026-09-23',
      }),
    );
    expect(result.checks.map((check) => check.code)).not.toContain(
      'FUTURE_WORK_DATE',
    );
  });

  it('blocks manual entries shorter than 15 minutes', () => {
    const result = evaluateTimesheetValidation(
      base({
        startAt: new Date('2026-09-22T13:00:00.000Z'),
        endAt: new Date('2026-09-22T13:10:00.000Z'),
      }),
    );
    expect(result.status).toBe('BLOCKED');
    expect(result.checks.map((check) => check.code)).toContain('MIN_DURATION');
  });

  it('does not apply the 15-minute minimum to clock entries', () => {
    const result = evaluateTimesheetValidation(
      base({
        source: 'CLOCK',
        startAt: new Date('2026-09-22T13:00:00.000Z'),
        endAt: new Date('2026-09-22T13:05:00.000Z'),
        description: null,
      }),
    );
    expect(result.checks.map((check) => check.code)).not.toContain('MIN_DURATION');
  });

  it('blocks overlapping manual entries and reviews overlapping clock entries', () => {
    const manual = evaluateTimesheetValidation(base({ overlaps: true }));
    expect(manual.status).toBe('BLOCKED');
    expect(manual.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'OVERLAP', severity: 'ERROR' }),
      ]),
    );

    const clock = evaluateTimesheetValidation(
      base({ source: 'CLOCK_SESSION', overlaps: true, description: null }),
    );
    expect(clock.status).toBe('REVIEW');
    expect(clock.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'OVERLAP', severity: 'WARNING' }),
      ]),
    );
  });

  it('reviews daily totals above the configured limit', () => {
    const result = evaluateTimesheetValidation(
      base({
        existingDayMinutes: 60,
        dailyMinutesLimit: defaultDailyMinutes(8),
      }),
    );
    expect(result.status).toBe('REVIEW');
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'LONG_SHIFT',
          severity: 'WARNING',
          message: 'Total captured time exceeds configured normal daily hours.',
        }),
      ]),
    );
  });

  it('reviews weekly totals above the configured limit', () => {
    const result = evaluateTimesheetValidation(
      base({
        existingWeekMinutes: 33 * 60,
        weeklyMinutesLimit: defaultWeeklyMinutes(40),
      }),
    );
    expect(result.status).toBe('REVIEW');
    expect(result.checks.map((check) => check.code)).toContain('WEEKLY_LIMIT');
  });

  it('blocks manual time when organization policy disables it', () => {
    const result = evaluateTimesheetValidation(base({ allowManualTime: false }));
    expect(result.status).toBe('BLOCKED');
    expect(result.checks.map((check) => check.code)).toContain('MANUAL_DISABLED');
  });

  it('blocks a short or empty manual description', () => {
    expect(
      evaluateTimesheetValidation(base({ description: '  done  ' })).status,
    ).toBe('BLOCKED');
    expect(
      evaluateTimesheetValidation(base({ description: null })).checks.map(
        (check) => check.code,
      ),
    ).toContain('MANUAL_DESCRIPTION');
  });

  it('blocks manual time on completed or cancelled jobs', () => {
    expect(
      evaluateTimesheetValidation(base({ jobStatus: 'COMPLETED' })).checks.map(
        (check) => check.code,
      ),
    ).toContain('COMPLETED_JOB');
    expect(
      evaluateTimesheetValidation(base({ jobStatus: 'CANCELLED' })).status,
    ).toBe('BLOCKED');
  });

  it('reviews a schedule/date mismatch instead of blocking', () => {
    const result = evaluateTimesheetValidation(
      base({ jobScheduledDate: '2026-09-20' }),
    );
    expect(result.status).toBe('REVIEW');
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SCHEDULE_MISMATCH',
          severity: 'WARNING',
        }),
      ]),
    );
  });

  it('blocks overtime when authorization checks fail', () => {
    const result = evaluateTimesheetValidation(
      base({
        type: 'OVERTIME',
        overtimeChecks: [
          {
            code: 'OVERTIME_UNAUTHORIZED',
            severity: 'ERROR',
            message: 'An approved overtime authorization is required.',
          },
        ],
      }),
    );
    expect(result.status).toBe('BLOCKED');
    expect(result.checks.map((check) => check.code)).toContain(
      'OVERTIME_UNAUTHORIZED',
    );
  });

  it('uses centralized hour defaults when settings are missing', () => {
    expect(defaultDailyMinutes(undefined)).toBe(8 * 60);
    expect(defaultWeeklyMinutes(undefined)).toBe(40 * 60);
  });

  it('presents clock-session conversion as CLOCK without renaming the stored source', () => {
    expect(presentSource('CLOCK_SESSION')).toBe('CLOCK');
    expect(presentSource('CLOCK')).toBe('CLOCK');
    expect(presentSource('MANUAL')).toBe('MANUAL');
    expect(presentStatus('SUBMITTED')).toBe('PENDING');
    expect(presentStatus('DRAFT')).toBe('DRAFT');
  });
});
