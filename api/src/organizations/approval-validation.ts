import { JobStatus } from '../generated/prisma/client.js';

export type JobApprovalIssue = {
  code: string;
  message: string;
};

export type JobApprovalIntegrityInput = {
  status: JobStatus;
  requireClientSignOff: boolean;
  orgRequireClientSignature: boolean;
  hasSignature: boolean;
  safetySatisfied: boolean;
  openClock: boolean;
  incompleteTimeEntries: boolean;
  requireGps: boolean;
  clockSessionsMissingGps: boolean;
};

export function evaluateJobApprovalIntegrity(
  input: JobApprovalIntegrityInput,
): JobApprovalIssue[] {
  const issues: JobApprovalIssue[] = [];
  if (input.status !== JobStatus.PENDING_APPROVAL) {
    issues.push({
      code: 'JOB_NOT_PENDING_APPROVAL',
      message: 'This job is not waiting for approval',
    });
  }
  if (input.openClock) {
    issues.push({
      code: 'OPEN_CLOCK',
      message: 'Clock out of this job before approving it',
    });
  }
  if (!input.safetySatisfied) {
    issues.push({
      code: 'SAFETY_INCOMPLETE',
      message: 'Required safety controls are incomplete',
    });
  }
  const signatureRequired =
    input.requireClientSignOff || input.orgRequireClientSignature;
  if (signatureRequired && !input.hasSignature) {
    issues.push({
      code: 'SIGNATURE_MISSING',
      message: 'A required client signature is missing',
    });
  }
  if (input.incompleteTimeEntries) {
    issues.push({
      code: 'TIME_INCOMPLETE',
      message: 'A time record on this job is incomplete',
    });
  }
  if (input.requireGps && input.clockSessionsMissingGps) {
    issues.push({
      code: 'GPS_MISSING',
      message: 'Clock evidence is missing required GPS coordinates',
    });
  }
  return issues;
}
