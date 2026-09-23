import { JobStatus } from '../generated/prisma/client.js';
import { evaluateJobApprovalIntegrity } from './approval-validation.js';

describe('job approval integrity', () => {
  const clear = {
    status: JobStatus.PENDING_APPROVAL,
    requireClientSignOff: false,
    orgRequireClientSignature: false,
    hasSignature: false,
    safetySatisfied: true,
    openClock: false,
    incompleteTimeEntries: false,
    requireGps: false,
    clockSessionsMissingGps: false,
  };

  it('accepts a pending job that already passed submit checks', () => {
    expect(evaluateJobApprovalIntegrity(clear)).toEqual([]);
  });

  it('rejects a job that is no longer pending approval', () => {
    const issues = evaluateJobApprovalIntegrity({
      ...clear,
      status: JobStatus.IN_PROGRESS,
    });
    expect(issues.map((item) => item.code)).toContain('JOB_NOT_PENDING_APPROVAL');
  });

  it('rejects a missing required signature', () => {
    const issues = evaluateJobApprovalIntegrity({
      ...clear,
      requireClientSignOff: true,
      hasSignature: false,
    });
    expect(issues.map((item) => item.code)).toContain('SIGNATURE_MISSING');
  });

  it('rejects incomplete required safety', () => {
    const issues = evaluateJobApprovalIntegrity({
      ...clear,
      safetySatisfied: false,
    });
    expect(issues.map((item) => item.code)).toContain('SAFETY_INCOMPLETE');
  });

  it('rejects incomplete time when a record is still open', () => {
    const issues = evaluateJobApprovalIntegrity({
      ...clear,
      incompleteTimeEntries: true,
    });
    expect(issues.map((item) => item.code)).toContain('TIME_INCOMPLETE');
  });
});
