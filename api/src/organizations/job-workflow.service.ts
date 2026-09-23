import { BadRequestException, Injectable } from '@nestjs/common';
import { JobStatus, OrganizationRole } from '../generated/prisma/client.js';
import { canEditSchedule, canManageSchedule } from './job-visibility.js';

/**
 * Job status machine (MVP).
 *
 * DRAFT → SCHEDULED | CANCELLED
 * SCHEDULED → DISPATCHED | CANCELLED
 * DISPATCHED → IN_PROGRESS | CANCELLED
 * IN_PROGRESS → PENDING_APPROVAL | CANCELLED
 * PENDING_APPROVAL → COMPLETED | RETURNED
 * RETURNED → IN_PROGRESS | CANCELLED
 * COMPLETED / CANCELLED → (none)
 *
 * Cancellation:
 * - Allowed from DRAFT, SCHEDULED, DISPATCHED, IN_PROGRESS, RETURNED.
 * - Blocked from PENDING_APPROVAL (complete or return first), COMPLETED, CANCELLED.
 * - IN_PROGRESS cancel requires a reason.
 * - Sets cancelledAt; never deletes operational history.
 */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.DRAFT]: [JobStatus.SCHEDULED, JobStatus.CANCELLED],
  [JobStatus.SCHEDULED]: [JobStatus.DISPATCHED, JobStatus.CANCELLED],
  [JobStatus.DISPATCHED]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.IN_PROGRESS]: [JobStatus.PENDING_APPROVAL, JobStatus.CANCELLED],
  [JobStatus.PENDING_APPROVAL]: [JobStatus.COMPLETED, JobStatus.RETURNED],
  [JobStatus.RETURNED]: [JobStatus.IN_PROGRESS, JobStatus.CANCELLED],
  [JobStatus.COMPLETED]: [],
  [JobStatus.CANCELLED]: [],
};

export const FIELD_CAPTURE_STATUSES: JobStatus[] = [
  JobStatus.DISPATCHED,
  JobStatus.IN_PROGRESS,
  JobStatus.RETURNED,
];

export const CLOCKABLE_STATUSES: JobStatus[] = FIELD_CAPTURE_STATUSES;

export const SIGN_OFF_STATUSES: JobStatus[] = [
  JobStatus.IN_PROGRESS,
  JobStatus.PENDING_APPROVAL,
];

export const CANCELABLE_STATUSES: JobStatus[] = [
  JobStatus.DRAFT,
  JobStatus.SCHEDULED,
  JobStatus.DISPATCHED,
  JobStatus.IN_PROGRESS,
  JobStatus.RETURNED,
];

@Injectable()
export class JobWorkflowService {
  allowedTargets(status: JobStatus) {
    return JOB_TRANSITIONS[status];
  }

  canTransition(from: JobStatus, to: JobStatus) {
    return JOB_TRANSITIONS[from].includes(to);
  }

  assertTransition(from: JobStatus, to: JobStatus) {
    if (from === to) return;
    if (!this.canTransition(from, to)) {
      throw new BadRequestException(
        `Cannot move a job from ${from} to ${to}`,
      );
    }
  }

  assertCancel(from: JobStatus, reason?: string | null) {
    this.assertTransition(from, JobStatus.CANCELLED);
    if (from === JobStatus.IN_PROGRESS && !reason?.trim()) {
      throw new BadRequestException(
        'A reason is required to cancel work already in progress',
      );
    }
  }

  canCreate(role: OrganizationRole) {
    return canEditSchedule(role);
  }

  canEditFields(role: OrganizationRole, status: JobStatus) {
    if (!canEditSchedule(role)) return false;
    return status !== JobStatus.COMPLETED && status !== JobStatus.CANCELLED;
  }

  canDispatch(role: OrganizationRole) {
    return canEditSchedule(role);
  }

  canCancel(role: OrganizationRole) {
    return canEditSchedule(role);
  }

  canApprove(role: OrganizationRole) {
    return canManageSchedule(role) || role === OrganizationRole.SUPERVISOR;
  }

  canFieldAdvance(role: OrganizationRole, assigned: boolean) {
    if (canEditSchedule(role)) return true;
    return role === OrganizationRole.TECHNICIAN && assigned;
  }

  canFieldCapture(role: OrganizationRole, assigned: boolean, status: JobStatus) {
    if (!this.canFieldAdvance(role, assigned)) return false;
    return FIELD_CAPTURE_STATUSES.includes(status);
  }

  canClockAgainst(role: OrganizationRole, assigned: boolean, status: JobStatus) {
    if (!this.canFieldAdvance(role, assigned)) return false;
    return CLOCKABLE_STATUSES.includes(status);
  }

  canSignOff(role: OrganizationRole, assigned: boolean, status: JobStatus) {
    if (!this.canFieldAdvance(role, assigned)) return false;
    return SIGN_OFF_STATUSES.includes(status);
  }
}
