import { BadRequestException, Injectable } from '@nestjs/common';
import { ClockSessionStatus, JobStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { requiredSafetySatisfied } from './job-execution.js';
import { evaluateJobApprovalIntegrity } from './approval-validation.js';

@Injectable()
export class JobApprovalValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertApprovable(organizationId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, organizationId },
      select: {
        id: true,
        status: true,
        requireClientSignOff: true,
        requireRiskAssessment: true,
        requirePermit: true,
        requireLoto: true,
        safetyControls: {
          select: { isRequired: true, completedAt: true },
        },
        signatures: { select: { id: true } },
        clockSessions: {
          select: {
            status: true,
            clockInLatitude: true,
            clockInLongitude: true,
            clockOutAt: true,
            clockOutLatitude: true,
            clockOutLongitude: true,
          },
        },
        timeEntries: {
          select: { endedAt: true },
        },
      },
    });
    if (!job) {
      throw new BadRequestException('This job is not waiting for approval');
    }
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { requireClientSignature: true, requireGps: true },
    });
    const issues = evaluateJobApprovalIntegrity({
      status: job.status,
      requireClientSignOff: job.requireClientSignOff,
      orgRequireClientSignature: Boolean(settings?.requireClientSignature),
      hasSignature: job.signatures.length > 0,
      safetySatisfied: requiredSafetySatisfied(job.safetyControls),
      openClock: job.clockSessions.some(
        (row) => row.status === ClockSessionStatus.OPEN,
      ),
      incompleteTimeEntries: job.timeEntries.some((row) => row.endedAt == null),
      requireGps: Boolean(settings?.requireGps),
      clockSessionsMissingGps: job.clockSessions.some(
        (row) =>
          row.clockInLatitude == null ||
          row.clockInLongitude == null ||
          (row.clockOutAt != null &&
            (row.clockOutLatitude == null || row.clockOutLongitude == null)),
      ),
    });
    if (issues.length > 0) {
      throw new BadRequestException(issues[0].message);
    }
    return job;
  }

  assertPendingStatus(status: JobStatus) {
    if (status !== JobStatus.PENDING_APPROVAL) {
      throw new BadRequestException('This job is not waiting for approval');
    }
  }
}
