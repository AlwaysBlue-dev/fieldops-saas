import { describe, expect, it } from 'vitest';
import { evaluateOvertimeAuthorization } from './overtime-validation.js';

const auth = {
  id: 'auth-1',
  organizationId: 'org-a',
  userId: 'tech-a',
  jobId: 'job-a',
  workDate: '2026-09-22',
  authorizedStart: new Date('2026-09-22T21:00:00.000Z'),
  authorizedEnd: new Date('2026-09-23T01:00:00.000Z'),
  maxMinutes: 120,
  status: 'APPROVED',
};

const valid = {
  type: 'OVERTIME',
  organizationId: 'org-a',
  technicianUserId: 'tech-a',
  jobId: 'job-a',
  workDate: '2026-09-22',
  startAt: new Date('2026-09-22T21:00:00.000Z'),
  endAt: new Date('2026-09-22T22:30:00.000Z'),
  durationMinutes: 90,
  linkedAuthorizationId: 'auth-1',
  authorization: auth,
  usedMinutes: 0,
};

function codes(overrides: Partial<typeof valid> = {}) {
  return evaluateOvertimeAuthorization({ ...valid, ...overrides }).map(
    (check) => check.code,
  );
}

describe('evaluateOvertimeAuthorization', () => {
  it('does not apply to non-overtime entries', () => {
    expect(codes({ type: 'NORMAL' })).toEqual([]);
  });

  it('blocks overtime without an authorization', () => {
    expect(
      codes({ authorization: null, linkedAuthorizationId: null }),
    ).toContain('OVERTIME_UNAUTHORIZED');
  });

  it('blocks a pending authorization', () => {
    expect(
      codes({
        authorization: { ...auth, status: 'PENDING' },
      }),
    ).toContain('OVERTIME_UNAUTHORIZED');
  });

  it('blocks the wrong technician, job, organization, and date', () => {
    expect(codes({ technicianUserId: 'tech-b' })).toContain(
      'OVERTIME_WRONG_TECHNICIAN',
    );
    expect(codes({ jobId: 'job-b' })).toContain('OVERTIME_WRONG_JOB');
    expect(codes({ organizationId: 'org-b' })).toContain(
      'OVERTIME_WRONG_ORGANIZATION',
    );
    expect(codes({ workDate: '2026-09-21' })).toContain('OVERTIME_WRONG_DATE');
  });

  it('blocks time outside the authorized window', () => {
    expect(
      codes({
        startAt: new Date('2026-09-22T20:00:00.000Z'),
        endAt: new Date('2026-09-22T22:00:00.000Z'),
      }),
    ).toContain('OVERTIME_OUTSIDE_WINDOW');
    expect(
      codes({
        startAt: new Date('2026-09-22T22:00:00.000Z'),
        endAt: new Date('2026-09-23T02:00:00.000Z'),
      }),
    ).toContain('OVERTIME_OUTSIDE_WINDOW');
  });

  it('blocks a single entry that exceeds max minutes', () => {
    expect(
      codes({
        endAt: new Date('2026-09-23T00:00:00.000Z'),
        durationMinutes: 180,
      }),
    ).toContain('OVERTIME_EXCEEDS_MAX');
  });

  it('blocks multiple entries that together exceed max minutes', () => {
    expect(codes({ usedMinutes: 60, durationMinutes: 90 })).toContain(
      'OVERTIME_EXCEEDS_MAX',
    );
    expect(codes({ usedMinutes: 30, durationMinutes: 90 })).toEqual([]);
  });

  it('requires the entry to be linked to the authorization', () => {
    expect(codes({ linkedAuthorizationId: null })).toContain(
      'OVERTIME_UNAUTHORIZED',
    );
  });

  it('accepts a matching approved authorization', () => {
    expect(evaluateOvertimeAuthorization(valid)).toEqual([]);
  });
});
