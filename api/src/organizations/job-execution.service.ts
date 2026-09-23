import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_COMPLETION_SUMMARY_UPDATED,
  AUDIT_JOB_MATERIAL_REMOVED,
  AUDIT_JOB_MATERIAL_UPDATED,
  AUDIT_JOB_SUBMITTED,
  AUDIT_JOB_WORK_LOG_UPDATED,
  AUDIT_SAFETY_CONTROL_CONFIRMED,
} from '../common/constants.js';
import {
  ApprovalType,
  ClockSessionStatus,
  JobOutcome,
  JobStatus,
  OrganizationRole,
  Prisma,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../subscription/clock.js';
import { Inject } from '@nestjs/common';
import type { OrganizationContext } from '../tenancy/request-context.js';
import { emptyToNull } from './dto/text.util.js';
import type {
  ConfirmSafetyControlDto,
  UpdateCompletionSummaryDto,
  UpdateJobClientContactDto,
  UpdateJobMaterialDto,
  UpdateWorkLogDto,
} from './dto/job-execution.dto.js';
import {
  executionRecordsLocked,
  isMeaningfulWorkPerformed,
  isSafetyControlCode,
  outcomeNeedsReason,
  requiredSafetySatisfied,
  SAFETY_CONTROL_DEFS,
  safetyControlStatus,
  toActivityType,
} from './job-execution.js';
import { jobVisibilityWhere } from './job-visibility.js';
import { JobWorkflowService } from './job-workflow.service.js';
import { canEditSchedule } from './job-visibility.js';
import { TeamsService } from './teams.service.js';
import { ApprovalNotificationHook } from './approval-events.js';
import { ApprovalRecordsService } from './approval-records.service.js';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class JobExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workflow: JobWorkflowService,
    private readonly teams: TeamsService,
    private readonly approvals: ApprovalRecordsService,
    private readonly approvalEvents: ApprovalNotificationHook,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async syncSafetyControls(
    db: Db,
    input: {
      organizationId: string;
      jobId: string;
      requireRiskAssessment: boolean;
      requirePermit: boolean;
      requireLoto: boolean;
    },
  ) {
    const flags = {
      requireRiskAssessment: input.requireRiskAssessment,
      requirePermit: input.requirePermit,
      requireLoto: input.requireLoto,
    };
    for (const def of SAFETY_CONTROL_DEFS) {
      await db.jobSafetyControl.upsert({
        where: { jobId_code: { jobId: input.jobId, code: def.code } },
        update: {
          title: def.title,
          isRequired: flags[def.flag],
        },
        create: {
          organizationId: input.organizationId,
          jobId: input.jobId,
          code: def.code,
          title: def.title,
          isRequired: flags[def.flag],
        },
      });
    }
  }

  async confirmSafety(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    code: string,
    dto: ConfirmSafetyControlDto,
  ) {
    if (!isSafetyControlCode(code)) {
      throw new BadRequestException('Unknown safety control');
    }
    const job = await this.requireMutableCapture(ctx, actorUserId, jobId);
    await this.syncSafetyControls(this.prisma, {
      organizationId: ctx.organizationId,
      jobId: job.id,
      requireRiskAssessment: job.requireRiskAssessment,
      requirePermit: job.requirePermit,
      requireLoto: job.requireLoto,
    });
    const control = await this.prisma.jobSafetyControl.findFirst({
      where: { organizationId: ctx.organizationId, jobId: job.id, code },
    });
    if (!control) {
      throw new NotFoundException();
    }
    if (!control.isRequired) {
      throw new BadRequestException('This safety control is not required');
    }
    if (control.completedAt) {
      throw new BadRequestException('This safety control is already confirmed');
    }
    const now = this.clock.now();
    const note = emptyToNull(dto.note);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobSafetyControl.update({
        where: { id: control.id },
        data: {
          completedAt: now,
          completedByUserId: actorUserId,
          notes: note,
        },
        include: { completedBy: { select: { id: true, fullName: true } } },
      });
      await this.audit.record(
        {
          action: AUDIT_SAFETY_CONTROL_CONFIRMED,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: { code, note },
        },
        tx,
      );
      return row;
    });
    return this.serializeSafety(updated);
  }

  async updateClientContact(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: UpdateJobClientContactDto,
  ) {
    const job = await this.requireMutableCapture(ctx, actorUserId, jobId);
    await this.prisma.job.update({
      where: { id: job.id },
      data: {
        clientRepName:
          dto.representativeName === undefined
            ? undefined
            : emptyToNull(dto.representativeName),
        clientRepTitle:
          dto.representativeRole === undefined
            ? undefined
            : emptyToNull(dto.representativeRole),
        clientRepPhone:
          dto.representativePhone === undefined
            ? undefined
            : emptyToNull(dto.representativePhone),
        clientRepEmail:
          dto.representativeEmail === undefined
            ? undefined
            : emptyToNull(dto.representativeEmail),
      },
    });
    return { ok: true };
  }

  async updateCompletion(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: UpdateCompletionSummaryDto,
  ) {
    const job = await this.requireMutableCapture(ctx, actorUserId, jobId);
    this.assertCompletion(dto.workPerformed, dto.outcome, dto.outcomeReason);
    await this.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: job.id },
        data: {
          workPerformed: dto.workPerformed.trim(),
          completionNotes: emptyToNull(dto.completionNotes),
          outcome: dto.outcome,
          outcomeReason: emptyToNull(dto.outcomeReason),
        },
      });
      await this.audit.record(
        {
          action: AUDIT_COMPLETION_SUMMARY_UPDATED,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: { outcome: dto.outcome },
        },
        tx,
      );
    });
    return { ok: true };
  }

  async updateWorkLog(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    workLogId: string,
    dto: UpdateWorkLogDto,
  ) {
    const job = await this.requireMutableCapture(ctx, actorUserId, jobId);
    const row = await this.prisma.jobWorkLog.findFirst({
      where: {
        id: workLogId,
        jobId: job.id,
        organizationId: ctx.organizationId,
      },
    });
    if (!row) {
      throw new NotFoundException();
    }
    if (row.authorUserId !== actorUserId && !canEditSchedule(ctx.role)) {
      throw new ForbiddenException('You can only edit your own work notes');
    }
    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException('Work log text is required');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.jobWorkLog.update({
        where: { id: row.id },
        data: { body: text },
        include: { author: { select: { id: true, fullName: true } } },
      });
      await this.audit.record(
        {
          action: AUDIT_JOB_WORK_LOG_UPDATED,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { workLogId: row.id, body: row.body },
          newValues: { workLogId: row.id, body: text },
        },
        tx,
      );
      return next;
    });
    return {
      id: updated.id,
      text: updated.body,
      body: updated.body,
      createdAt: updated.createdAt.toISOString(),
      loggedAt: updated.loggedAt.toISOString(),
      author: { userId: updated.author.id, fullName: updated.author.fullName },
    };
  }

  async updateMaterial(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    materialId: string,
    dto: UpdateJobMaterialDto,
  ) {
    const job = await this.requireMutableCapture(ctx, actorUserId, jobId);
    const row = await this.requireOwnMaterial(ctx, actorUserId, job.id, materialId);
    const itemName = dto.itemName?.trim();
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.jobMaterial.update({
        where: { id: row.id },
        data: {
          name: itemName || undefined,
          sku:
            dto.partNumber === undefined ? undefined : emptyToNull(dto.partNumber),
          quantity: dto.quantity,
          unit: dto.unit,
          notes: dto.notes === undefined ? undefined : emptyToNull(dto.notes),
        },
        include: { addedBy: { select: { id: true, fullName: true } } },
      });
      await this.audit.record(
        {
          action: AUDIT_JOB_MATERIAL_UPDATED,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: { materialId: row.id, name: next.name },
        },
        tx,
      );
      return next;
    });
    return this.serializeMaterial(updated);
  }

  async removeMaterial(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    materialId: string,
  ) {
    const job = await this.requireMutableCapture(ctx, actorUserId, jobId);
    const row = await this.requireOwnMaterial(ctx, actorUserId, job.id, materialId);
    await this.prisma.$transaction(async (tx) => {
      await tx.jobMaterial.delete({ where: { id: row.id } });
      await this.audit.record(
        {
          action: AUDIT_JOB_MATERIAL_REMOVED,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { materialId: row.id, name: row.name },
        },
        tx,
      );
    });
    return { id: row.id };
  }

  async submit(ctx: OrganizationContext, actorUserId: string, jobId: string) {
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    const assigned = job.assignments.some((row) => row.userId === actorUserId);
    if (!this.workflow.canFieldAdvance(ctx.role, assigned)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    this.workflow.assertTransition(job.status, JobStatus.PENDING_APPROVAL);
    if (executionRecordsLocked(job.status)) {
      throw new BadRequestException('This job can no longer be submitted');
    }

    const openClock = await this.prisma.clockSession.findFirst({
      where: {
        organizationId: ctx.organizationId,
        technicianUserId: actorUserId,
        jobId: job.id,
        status: ClockSessionStatus.OPEN,
      },
      select: { id: true },
    });
    if (openClock) {
      throw new BadRequestException(
        'Clock out of this job before submitting it for approval',
      );
    }

    await this.syncSafetyControls(this.prisma, {
      organizationId: ctx.organizationId,
      jobId: job.id,
      requireRiskAssessment: job.requireRiskAssessment,
      requirePermit: job.requirePermit,
      requireLoto: job.requireLoto,
    });
    const controls = await this.prisma.jobSafetyControl.findMany({
      where: { organizationId: ctx.organizationId, jobId: job.id },
    });
    if (!requiredSafetySatisfied(controls)) {
      throw new BadRequestException(
        'Confirm required safety controls before submitting this job',
      );
    }

    this.assertCompletion(job.workPerformed, job.outcome, job.outcomeReason);

    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { requireClientSignature: true },
    });
    const signatureRequired =
      job.requireClientSignOff || Boolean(settings?.requireClientSignature);
    if (signatureRequired) {
      const signature = await this.prisma.jobSignature.findFirst({
        where: { organizationId: ctx.organizationId, jobId: job.id },
        select: { id: true },
      });
      if (!signature) {
        throw new BadRequestException(
          'Capture a client signature before submitting this job',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.job.updateMany({
        where: {
          id: job.id,
          organizationId: ctx.organizationId,
          status: job.status,
        },
        data: { status: JobStatus.PENDING_APPROVAL },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Job status changed concurrently');
      }
      await this.approvals.ensurePending(
        {
          organizationId: ctx.organizationId,
          type: ApprovalType.JOB_COMPLETION,
          subjectType: 'Job',
          subjectId: job.id,
          requestedByUserId: actorUserId,
          assignedApproverUserId: job.supervisorUserId,
          assignedRole: job.supervisorUserId
            ? OrganizationRole.SUPERVISOR
            : null,
        },
        tx,
      );
      await this.audit.record(
        {
          action: AUDIT_JOB_SUBMITTED,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          oldValues: { status: job.status },
          newValues: { status: JobStatus.PENDING_APPROVAL },
        },
        tx,
      );
      await this.approvalEvents.emit(
        {
          type: 'JOB_APPROVAL_REQUESTED',
          organizationId: ctx.organizationId,
          subjectId: job.id,
          actorUserId,
          recipientUserIds: [job.supervisorUserId].filter(
            (id): id is string => Boolean(id),
          ),
          title: 'Job ready for approval',
          body: `${job.jobNumber} was submitted for approval.`,
          payload: { status: JobStatus.PENDING_APPROVAL },
        },
        tx,
      );
    });
  }

  async listActivity(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
  ) {
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    return this.listActivityForJob(ctx.organizationId, job.id);
  }

  async listActivityForJob(organizationId: string, jobId: string) {
    const sessions = await this.prisma.clockSession.findMany({
      where: { organizationId, jobId },
      select: { id: true },
    });
    const sessionIds = sessions.map((row) => row.id);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        OR: [
          { entityType: 'Job', entityId: jobId },
          ...(sessionIds.length
            ? [{ entityType: 'ClockSession', entityId: { in: sessionIds } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: {
        id: true,
        action: true,
        actorUserId: true,
        createdAt: true,
        newValues: true,
      },
    });
    const actorIds = [
      ...new Set(rows.map((row) => row.actorUserId).filter(Boolean)),
    ] as string[];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(actors.map((row) => [row.id, row.fullName]));
    return rows.map((row) => ({
      id: row.id,
      action: toActivityType(row.action),
      actorName: row.actorUserId ? (names.get(row.actorUserId) ?? null) : null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  serializeSafety(row: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    isRequired: boolean;
    completedAt: Date | null;
    notes: string | null;
    completedBy: { id: string; fullName: string } | null;
  }) {
    return {
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description,
      isRequired: row.isRequired,
      status: safetyControlStatus(row),
      confirmedBy: row.completedBy
        ? { userId: row.completedBy.id, fullName: row.completedBy.fullName }
        : null,
      confirmedAt: row.completedAt?.toISOString() ?? null,
      note: row.notes,
    };
  }

  serializeMaterial(row: {
    id: string;
    name: string;
    sku: string | null;
    quantity: Prisma.Decimal | { toString(): string };
    unit: string;
    notes: string | null;
    createdAt: Date;
    addedByUserId: string;
    addedBy?: { id: string; fullName: string } | null;
  }) {
    return {
      id: row.id,
      itemName: row.name,
      name: row.name,
      partNumber: row.sku,
      quantity: row.quantity.toString(),
      unit: row.unit,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      addedBy: row.addedBy
        ? { userId: row.addedBy.id, fullName: row.addedBy.fullName }
        : { userId: row.addedByUserId, fullName: '' },
    };
  }

  assertCompletion(
    workPerformed?: string | null,
    outcome?: JobOutcome | null,
    outcomeReason?: string | null,
  ) {
    if (!isMeaningfulWorkPerformed(workPerformed)) {
      throw new BadRequestException(
        'Describe the work performed before submitting this job',
      );
    }
    if (!outcome) {
      throw new BadRequestException('Choose a completion outcome');
    }
    if (outcomeNeedsReason(outcome) && !outcomeReason?.trim()) {
      throw new BadRequestException(
        'A reason is required for follow-up or unable-to-complete outcomes',
      );
    }
  }

  async requireMutableCapture(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
  ) {
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    if (executionRecordsLocked(job.status)) {
      throw new BadRequestException(
        'Submitted and closed jobs cannot be changed',
      );
    }
    const assigned = job.assignments.some((row) => row.userId === actorUserId);
    if (!this.workflow.canFieldCapture(ctx.role, assigned, job.status)) {
      throw new ForbiddenException('Work capture is not available for this job');
    }
    return job;
  }

  private async requireOwnMaterial(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    materialId: string,
  ) {
    const row = await this.prisma.jobMaterial.findFirst({
      where: {
        id: materialId,
        jobId,
        organizationId: ctx.organizationId,
      },
    });
    if (!row) {
      throw new NotFoundException();
    }
    if (row.addedByUserId !== actorUserId && !canEditSchedule(ctx.role)) {
      throw new ForbiddenException('You can only change materials you added');
    }
    return row;
  }

  private async requireVisibleJob(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
  ) {
    const visibleTeamIds = await this.teams.listVisibleTeamIds(ctx, actorUserId);
    const job = await this.prisma.job.findFirst({
      where: {
        AND: [jobVisibilityWhere(ctx, actorUserId, visibleTeamIds), { id: jobId }],
      },
      include: { assignments: { select: { userId: true } } },
    });
    if (!job) {
      throw new NotFoundException();
    }
    return job;
  }
}
