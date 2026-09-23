import { JobOutcome, JobStatus } from '../generated/prisma/client.js';
import {
  SAFETY_CONTROL_CODES,
  WORK_PERFORMED_MIN_LENGTH,
  type SafetyControlCode,
} from '../common/constants.js';

export type SafetyControlStatus = 'NOT_REQUIRED' | 'PENDING' | 'CONFIRMED';

export const EXECUTION_LOCKED_STATUSES: JobStatus[] = [
  JobStatus.PENDING_APPROVAL,
  JobStatus.COMPLETED,
  JobStatus.CANCELLED,
];

export const OUTCOMES_REQUIRING_REASON: JobOutcome[] = [
  JobOutcome.FOLLOW_UP_REQUIRED,
  JobOutcome.UNABLE_TO_COMPLETE,
];

export const SAFETY_CONTROL_DEFS: Array<{
  code: SafetyControlCode;
  title: string;
  flag: 'requireRiskAssessment' | 'requirePermit' | 'requireLoto';
}> = [
  {
    code: 'RISK_ASSESSMENT',
    title: 'Pre-task risk assessment',
    flag: 'requireRiskAssessment',
  },
  {
    code: 'PERMIT',
    title: 'Permit-to-work',
    flag: 'requirePermit',
  },
  {
    code: 'LOTO',
    title: 'LOTO / isolation',
    flag: 'requireLoto',
  },
];

export function isSafetyControlCode(value: string): value is SafetyControlCode {
  return (SAFETY_CONTROL_CODES as readonly string[]).includes(value);
}

export function safetyControlStatus(control: {
  isRequired: boolean;
  completedAt: Date | null;
}): SafetyControlStatus {
  if (!control.isRequired) return 'NOT_REQUIRED';
  return control.completedAt ? 'CONFIRMED' : 'PENDING';
}

export function requiredSafetySatisfied(
  controls: Array<{ isRequired: boolean; completedAt: Date | null }>,
) {
  return controls
    .filter((row) => row.isRequired)
    .every((row) => row.completedAt != null);
}

export function executionRecordsLocked(status: JobStatus) {
  return EXECUTION_LOCKED_STATUSES.includes(status);
}

export function isMeaningfulWorkPerformed(value?: string | null) {
  return (value?.trim().length ?? 0) >= WORK_PERFORMED_MIN_LENGTH;
}

export function outcomeNeedsReason(outcome?: JobOutcome | null) {
  return outcome != null && OUTCOMES_REQUIRING_REASON.includes(outcome);
}

export function toActivityType(action: string) {
  switch (action) {
    case 'JOB_COMPLETED':
      return 'JOB_APPROVED';
    case 'JOB_WORK_LOG':
    case 'WORK_LOG_ADDED':
      return 'WORK_LOG_ADDED';
    case 'JOB_MATERIAL':
    case 'MATERIAL_ADDED':
      return 'MATERIAL_ADDED';
    case 'SAFETY_CONTROL_CONFIRMED':
      return 'SAFETY_CONFIRMED';
    default:
      return action;
  }
}
