import { BadRequestException } from '@nestjs/common';
import { JobStatus, OrganizationRole } from '../generated/prisma/client.js';
import { JobWorkflowService } from './job-workflow.service.js';

describe('JobWorkflowService', () => {
  const workflow = new JobWorkflowService();

  it('allows the documented happy path', () => {
    expect(workflow.canTransition(JobStatus.DRAFT, JobStatus.SCHEDULED)).toBe(true);
    expect(workflow.canTransition(JobStatus.SCHEDULED, JobStatus.DISPATCHED)).toBe(true);
    expect(workflow.canTransition(JobStatus.DISPATCHED, JobStatus.IN_PROGRESS)).toBe(true);
    expect(workflow.canTransition(JobStatus.IN_PROGRESS, JobStatus.PENDING_APPROVAL)).toBe(true);
    expect(workflow.canTransition(JobStatus.PENDING_APPROVAL, JobStatus.COMPLETED)).toBe(true);
    expect(workflow.canTransition(JobStatus.PENDING_APPROVAL, JobStatus.RETURNED)).toBe(true);
    expect(workflow.canTransition(JobStatus.RETURNED, JobStatus.IN_PROGRESS)).toBe(true);
  });

  it('rejects arbitrary jumps', () => {
    expect(() =>
      workflow.assertTransition(JobStatus.DRAFT, JobStatus.COMPLETED),
    ).toThrow(BadRequestException);
    expect(() =>
      workflow.assertTransition(JobStatus.COMPLETED, JobStatus.IN_PROGRESS),
    ).toThrow(BadRequestException);
    expect(() =>
      workflow.assertTransition(JobStatus.PENDING_APPROVAL, JobStatus.CANCELLED),
    ).toThrow(BadRequestException);
  });

  it('requires a reason to cancel in-progress work', () => {
    expect(() => workflow.assertCancel(JobStatus.IN_PROGRESS, '')).toThrow(
      BadRequestException,
    );
    expect(() => workflow.assertCancel(JobStatus.IN_PROGRESS, 'Weather')).not.toThrow();
    expect(() => workflow.assertCancel(JobStatus.DRAFT)).not.toThrow();
  });

  it('gates field capture and sign-off by assignment and status', () => {
    expect(
      workflow.canFieldCapture(OrganizationRole.TECHNICIAN, true, JobStatus.IN_PROGRESS),
    ).toBe(true);
    expect(
      workflow.canFieldCapture(OrganizationRole.TECHNICIAN, false, JobStatus.IN_PROGRESS),
    ).toBe(false);
    expect(
      workflow.canFieldCapture(OrganizationRole.TECHNICIAN, true, JobStatus.DRAFT),
    ).toBe(false);
    expect(
      workflow.canSignOff(OrganizationRole.TECHNICIAN, true, JobStatus.PENDING_APPROVAL),
    ).toBe(true);
    expect(
      workflow.canSignOff(OrganizationRole.TECHNICIAN, true, JobStatus.DISPATCHED),
    ).toBe(false);
  });

  it('lets technicians advance only assigned jobs', () => {
    expect(
      workflow.canFieldAdvance(OrganizationRole.TECHNICIAN, true),
    ).toBe(true);
    expect(
      workflow.canFieldAdvance(OrganizationRole.TECHNICIAN, false),
    ).toBe(false);
    expect(
      workflow.canCreate(OrganizationRole.TECHNICIAN),
    ).toBe(false);
  });
});
