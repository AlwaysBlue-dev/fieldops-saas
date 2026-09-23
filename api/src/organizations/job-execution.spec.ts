import { JobOutcome, JobStatus } from '../generated/prisma/client.js';
import {
  executionRecordsLocked,
  isMeaningfulWorkPerformed,
  isSafetyControlCode,
  outcomeNeedsReason,
  requiredSafetySatisfied,
  safetyControlStatus,
  toActivityType,
} from './job-execution.js';

describe('job execution domain', () => {
  it('derives safety statuses from required + confirmed state', () => {
    expect(safetyControlStatus({ isRequired: false, completedAt: null })).toBe(
      'NOT_REQUIRED',
    );
    expect(safetyControlStatus({ isRequired: true, completedAt: null })).toBe(
      'PENDING',
    );
    expect(
      safetyControlStatus({ isRequired: true, completedAt: new Date() }),
    ).toBe('CONFIRMED');
  });

  it('requires every required control to be confirmed', () => {
    expect(
      requiredSafetySatisfied([
        { isRequired: false, completedAt: null },
        { isRequired: true, completedAt: new Date() },
      ]),
    ).toBe(true);
    expect(
      requiredSafetySatisfied([{ isRequired: true, completedAt: null }]),
    ).toBe(false);
  });

  it('locks records after submission or close', () => {
    expect(executionRecordsLocked(JobStatus.IN_PROGRESS)).toBe(false);
    expect(executionRecordsLocked(JobStatus.PENDING_APPROVAL)).toBe(true);
    expect(executionRecordsLocked(JobStatus.COMPLETED)).toBe(true);
    expect(executionRecordsLocked(JobStatus.RETURNED)).toBe(false);
  });

  it('requires meaningful work and a reason for follow-up outcomes', () => {
    expect(isMeaningfulWorkPerformed('short')).toBe(false);
    expect(isMeaningfulWorkPerformed('Replaced contactor')).toBe(true);
    expect(outcomeNeedsReason(JobOutcome.COMPLETED)).toBe(false);
    expect(outcomeNeedsReason(JobOutcome.FOLLOW_UP_REQUIRED)).toBe(true);
    expect(outcomeNeedsReason(JobOutcome.UNABLE_TO_COMPLETE)).toBe(true);
  });

  it('maps persisted audit actions to activity types', () => {
    expect(toActivityType('JOB_COMPLETED')).toBe('JOB_APPROVED');
    expect(toActivityType('SAFETY_CONTROL_CONFIRMED')).toBe('SAFETY_CONFIRMED');
    expect(toActivityType('JOB_WORK_LOG')).toBe('WORK_LOG_ADDED');
    expect(isSafetyControlCode('LOTO')).toBe(true);
    expect(isSafetyControlCode('UNKNOWN')).toBe(false);
  });
});
