import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JobFileType } from '../generated/prisma/client.js';
import {
  AUDIT_JOB_MATERIAL,
  AUDIT_JOB_PHOTO,
  AUDIT_JOB_SIGNATURE,
  AUDIT_JOB_WORK_LOG,
} from '../common/constants.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../subscription/clock.js';
import { Inject } from '@nestjs/common';
import type { OrganizationContext } from '../tenancy/request-context.js';
import type {
  CreateJobMaterialDto,
  CreateJobPhotoDto,
  CreateJobSignatureDto,
  CreateWorkLogDto,
} from './dto/job-field-action.dto.js';
import {
  assertAllowedImageMime,
  decodeImagePayload,
  detectImageMime,
  extensionForMime,
  sanitizeFileName,
} from './image-bytes.js';
import { JobWorkflowService } from './job-workflow.service.js';
import { jobVisibilityWhere } from './job-visibility.js';
import { ObjectStorageService } from './object-storage.service.js';
import { TeamsService } from './teams.service.js';
import { emptyToNull } from './dto/text.util.js';

@Injectable()
export class JobFieldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workflow: JobWorkflowService,
    private readonly teams: TeamsService,
    private readonly storage: ObjectStorageService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async addWorkLog(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: CreateWorkLogDto,
  ) {
    const job = await this.requireCaptureJob(ctx, actorUserId, jobId);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobWorkLog.create({
        data: {
          organizationId: ctx.organizationId,
          jobId: job.id,
          authorUserId: actorUserId,
          body: dto.body.trim(),
        },
      });
      await this.audit.record(
        {
          action: AUDIT_JOB_WORK_LOG,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: { workLogId: row.id },
        },
        tx,
      );
      return row;
    });
    return {
      id: created.id,
      body: created.body,
      loggedAt: created.loggedAt.toISOString(),
    };
  }

  async addMaterial(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: CreateJobMaterialDto,
  ) {
    const job = await this.requireCaptureJob(ctx, actorUserId, jobId);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobMaterial.create({
        data: {
          organizationId: ctx.organizationId,
          jobId: job.id,
          name: dto.name.trim(),
          quantity: dto.quantity,
          unit: dto.unit.trim(),
          notes: emptyToNull(dto.notes),
          addedByUserId: actorUserId,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_JOB_MATERIAL,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: { materialId: row.id, name: row.name },
        },
        tx,
      );
      return row;
    });
    return {
      id: created.id,
      name: created.name,
      quantity: created.quantity.toString(),
      unit: created.unit,
      notes: created.notes,
    };
  }

  async addPhoto(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: CreateJobPhotoDto,
  ) {
    const job = await this.requireCaptureJob(ctx, actorUserId, jobId);
    const buffer = decodeImagePayload(dto.contentBase64);
    const mimeType = detectImageMime(buffer);
    assertAllowedImageMime(mimeType);
    const fileId = randomUUID();
    const fileName = sanitizeFileName(dto.fileName);
    const objectKey = `org/${ctx.organizationId}/jobs/${job.id}/photos/${fileId}.${extensionForMime(mimeType)}`;
    await this.storage.put(objectKey, buffer, mimeType);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobFile.create({
        data: {
          id: fileId,
          organizationId: ctx.organizationId,
          jobId: job.id,
          objectKey,
          originalName: fileName,
          mimeType,
          sizeBytes: BigInt(buffer.length),
          type: JobFileType.PHOTO,
          uploadedById: actorUserId,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_JOB_PHOTO,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: { fileId: row.id, mimeType },
        },
        tx,
      );
      return row;
    });
    return {
      id: created.id,
      originalName: created.originalName,
      mimeType: created.mimeType,
      sizeBytes: created.sizeBytes.toString(),
      type: created.type,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async addSignature(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: CreateJobSignatureDto,
  ) {
    const job = await this.requireSignOffJob(ctx, actorUserId, jobId);
    const existing = await this.prisma.jobSignature.findFirst({
      where: { organizationId: ctx.organizationId, jobId: job.id },
    });
    if (existing) {
      throw new BadRequestException('Client sign-off is already captured');
    }
    const buffer = decodeImagePayload(dto.imageBase64);
    const mimeType = detectImageMime(buffer);
    if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') {
      throw new BadRequestException('Sign-off image must be PNG or JPEG');
    }
    const signatureId = randomUUID();
    const objectKey = `org/${ctx.organizationId}/jobs/${job.id}/signatures/${signatureId}.${extensionForMime(mimeType)}`;
    await this.storage.put(objectKey, buffer, mimeType);
    const signedAt = this.clock.now();
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobSignature.create({
        data: {
          id: signatureId,
          organizationId: ctx.organizationId,
          jobId: job.id,
          signerName: dto.signerName.trim(),
          signerTitle: emptyToNull(dto.signerTitle),
          signedAt,
          objectKey,
          mimeType,
          capturedByUserId: actorUserId,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_JOB_SIGNATURE,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: { signatureId: row.id, signerName: row.signerName },
        },
        tx,
      );
      return row;
    });
    return {
      id: created.id,
      signerName: created.signerName,
      signerTitle: created.signerTitle,
      signedAt: created.signedAt.toISOString(),
    };
  }

  private async requireCaptureJob(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
  ) {
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    const assigned = job.assignments.some((row) => row.userId === actorUserId);
    if (!this.workflow.canFieldCapture(ctx.role, assigned, job.status)) {
      throw new ForbiddenException('Work capture is not available for this job');
    }
    return job;
  }

  private async requireSignOffJob(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
  ) {
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    const assigned = job.assignments.some((row) => row.userId === actorUserId);
    if (!this.workflow.canSignOff(ctx.role, assigned, job.status)) {
      throw new ForbiddenException('Client sign-off is not available for this job');
    }
    if (!job.requireClientSignOff) {
      throw new BadRequestException('This job does not require client sign-off');
    }
    return job;
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
