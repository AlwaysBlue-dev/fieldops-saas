import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AUDIT_CLIENT_SIGNATURE_CAPTURED,
  AUDIT_CLIENT_SIGNOFF_UPDATED,
  AUDIT_FILE_DELETED,
  AUDIT_FILE_UPLOADED,
} from '../common/constants.js';
import {
  JobFileType,
  JobStatus,
  OrganizationRole,
  StorageUploadPurpose,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, type Clock } from '../subscription/clock.js';
import { Inject } from '@nestjs/common';
import { StorageQuotaService } from '../storage/storage-quota.service.js';
import {
  assertAllowedMime,
  categoryFolder,
  decodeBase64Payload,
  detectObjectMime,
  extensionForMime,
  maxBytesFor,
  sanitizeOriginalName,
} from '../storage/file-bytes.js';
import { belongsToOrganization, jobObjectKey } from '../storage/object-key.js';
import { StorageService } from '../storage/storage.service.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { emptyToNull } from './dto/text.util.js';
import type { CreateJobPhotoDto, CreateJobSignatureDto } from './dto/job-field-action.dto.js';
import type { CreateJobSignOffDto, UploadJobFileDto } from './dto/job-file.dto.js';
import { JobExecutionService } from './job-execution.service.js';
import { executionRecordsLocked } from './job-execution.js';
import { JobWorkflowService } from './job-workflow.service.js';
import { jobVisibilityWhere } from './job-visibility.js';
import { TeamsService } from './teams.service.js';

@Injectable()
export class JobFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly execution: JobExecutionService,
    private readonly workflow: JobWorkflowService,
    private readonly teams: TeamsService,
    private readonly storageQuota: StorageQuotaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async uploadMultipart(
    ctx: OrganizationContext,
    user: AuthUser,
    jobId: string,
    file: { buffer: Buffer; originalname: string; size: number } | undefined,
    dto: UploadJobFileDto,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A file is required');
    }
    const type = dto.category ?? JobFileType.DOCUMENT;
    return this.storeFile({
      ctx,
      actorUserId: user.id,
      jobId,
      type,
      buffer: file.buffer,
      originalName: file.originalname,
      caption: dto.caption,
      capturedAt: dto.capturedAt,
    });
  }

  async addPhoto(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: CreateJobPhotoDto,
  ) {
    const buffer = decodeBase64Payload(dto.contentBase64, maxBytesFor(JobFileType.PHOTO));
    return this.storeFile({
      ctx,
      actorUserId,
      jobId,
      type: JobFileType.PHOTO,
      buffer,
      originalName: dto.fileName,
      caption: dto.caption,
      capturedAt: dto.capturedAt,
    });
  }

  async addSignature(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: CreateJobSignatureDto | CreateJobSignOffDto,
  ) {
    const job = await this.requireSignableJob(ctx, actorUserId, jobId);
    const existing = await this.prisma.jobSignature.findFirst({
      where: { organizationId: ctx.organizationId, jobId: job.id },
    });
    if (existing) {
      throw new BadRequestException('Client sign-off is already captured');
    }
    const representativeName = (
      ('representativeName' in dto ? dto.representativeName : undefined) ??
      dto.signerName ??
      ''
    ).trim();
    if (!representativeName) {
      throw new BadRequestException('Representative name is required');
    }
    const representativeRole = emptyToNull(
      ('representativeRole' in dto ? dto.representativeRole : undefined) ??
        dto.signerTitle,
    );
    const clientAccepted =
      'clientAccepted' in dto ? Boolean(dto.clientAccepted ?? true) : true;
    const clientComments =
      'clientComments' in dto ? emptyToNull(dto.clientComments) : null;
    const buffer = decodeBase64Payload(
      dto.imageBase64,
      maxBytesFor(JobFileType.SIGNATURE),
    );
    const mimeType = detectObjectMime(buffer);
    assertAllowedMime(JobFileType.SIGNATURE, mimeType);

    const fileId = randomUUID();
    const objectKey = jobObjectKey({
      organizationId: ctx.organizationId,
      jobId: job.id,
      category: 'signatures',
      fileId,
      extension: extensionForMime(mimeType),
    });
    const reservation = await this.storageQuota.reserveUpload({
      organizationId: ctx.organizationId,
      userId: actorUserId,
      objectKey,
      originalName: 'client-signature.png',
      mimeType,
      sizeBytes: buffer.length,
      purpose: StorageUploadPurpose.JOB_FILE,
      jobId: job.id,
      actorUserId,
    });
    try {
      await this.storage.put(objectKey, buffer, mimeType);
    } catch (error) {
      await this.storageQuota.failReservation(reservation.id, ctx.organizationId);
      throw error;
    }
    const signedAt = this.clock.now();

    const created = await this.prisma.$transaction(async (tx) => {
      const file = await tx.jobFile.create({
        data: {
          id: fileId,
          organizationId: ctx.organizationId,
          jobId: job.id,
          objectKey,
          originalName: 'client-signature.png',
          mimeType,
          sizeBytes: BigInt(buffer.length),
          type: JobFileType.SIGNATURE,
          uploadedById: actorUserId,
        },
      });
      await this.storageQuota.completeReservation(
        reservation.id,
        ctx.organizationId,
        file.id,
        tx,
      );
      const signature = await tx.jobSignature.create({
        data: {
          id: fileId,
          organizationId: ctx.organizationId,
          jobId: job.id,
          signerName: representativeName,
          signerTitle: representativeRole,
          signedAt,
          objectKey,
          mimeType,
          capturedByUserId: actorUserId,
        },
      });
      await tx.job.update({
        where: { id: job.id },
        data: {
          clientAccepted,
          clientComments,
          signedAt,
          clientRepName: representativeName,
          clientRepTitle: representativeRole,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_CLIENT_SIGNATURE_CAPTURED,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: { signatureId: signature.id, fileId: file.id },
        },
        tx,
      );
      await this.audit.record(
        {
          action: AUDIT_CLIENT_SIGNOFF_UPDATED,
          entityType: 'Job',
          entityId: job.id,
          organizationId: ctx.organizationId,
          actorUserId,
          newValues: { clientAccepted, hasComments: Boolean(clientComments) },
        },
        tx,
      );
      return signature;
    });

    return {
      id: created.id,
      representativeName: created.signerName,
      representativeRole: created.signerTitle,
      signerName: created.signerName,
      signerTitle: created.signerTitle,
      signedAt: created.signedAt.toISOString(),
      clientAccepted,
    };
  }

  async getById(ctx: OrganizationContext, actorUserId: string, fileId: string) {
    const file = await this.prisma.jobFile.findFirst({
      where: {
        id: fileId,
        organizationId: ctx.organizationId,
      },
    });
    if (!file) {
      throw new NotFoundException();
    }
    await this.requireVisibleJob(ctx, actorUserId, file.jobId);
    return {
      id: file.id,
      organizationId: file.organizationId,
      jobId: file.jobId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes.toString(),
      type: file.type,
      createdAt: file.createdAt,
    };
  }

  async list(ctx: OrganizationContext, actorUserId: string, jobId: string) {
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    const rows = await this.prisma.jobFile.findMany({
      where: { organizationId: ctx.organizationId, jobId: job.id },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.present(row, ctx.organizationId, job.id)));
  }

  async getAccess(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    fileId: string,
  ) {
    const file = await this.requireFile(ctx, actorUserId, jobId, fileId);
    return this.present(file, ctx.organizationId, jobId);
  }

  async stream(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    fileId: string,
  ) {
    const file = await this.requireFile(ctx, actorUserId, jobId, fileId);
    const object = await this.storage.get(file.objectKey);
    if (!object) {
      throw new NotFoundException();
    }
    return {
      buffer: object.body,
      mimeType: file.mimeType,
      originalName: file.originalName,
    };
  }

  async remove(
    ctx: OrganizationContext,
    user: AuthUser,
    jobId: string,
    fileId: string,
  ) {
    const job = await this.execution.requireMutableCapture(ctx, user.id, jobId);
    const file = await this.prisma.jobFile.findFirst({
      where: {
        id: fileId,
        organizationId: ctx.organizationId,
        jobId: job.id,
      },
    });
    if (!file) {
      throw new NotFoundException();
    }
    if (executionRecordsLocked(job.status) || job.status === JobStatus.COMPLETED) {
      throw new BadRequestException('Submitted evidence cannot be deleted');
    }
    const editorRoles: OrganizationRole[] = [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
      OrganizationRole.OPERATIONS_MANAGER,
      OrganizationRole.SUPERVISOR,
    ];
    const editor = editorRoles.includes(ctx.role);
    if (!editor && file.uploadedById !== user.id) {
      throw new ForbiddenException('Only the uploader can delete this file');
    }
    if (file.type === JobFileType.SIGNATURE) {
      throw new BadRequestException('Client signatures cannot be deleted from Files');
    }
    await this.storage.delete(file.objectKey, { required: true });
    await this.prisma.$transaction(async (tx) => {
      await tx.jobFile.delete({ where: { id: file.id } });
      await this.audit.record(
        {
          action: AUDIT_FILE_DELETED,
          entityType: 'JobFile',
          entityId: file.id,
          organizationId: ctx.organizationId,
          actorUserId: user.id,
          oldValues: { jobId: job.id, type: file.type },
        },
        tx,
      );
    });
    return { id: file.id };
  }

  serializeFile(row: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: bigint;
    type: JobFileType;
    caption?: string | null;
    capturedAt?: Date | null;
    uploadedById: string;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes.toString(),
      type: row.type,
      category: row.type,
      caption: row.caption ?? null,
      capturedAt: row.capturedAt?.toISOString() ?? null,
      uploadedById: row.uploadedById,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async storeFile(input: {
    ctx: OrganizationContext;
    actorUserId: string;
    jobId: string;
    type: JobFileType;
    buffer: Buffer;
    originalName: string;
    caption?: string;
    capturedAt?: string;
  }) {
    const job = await this.execution.requireMutableCapture(
      input.ctx,
      input.actorUserId,
      input.jobId,
    );
    if (input.buffer.length > maxBytesFor(input.type)) {
      throw new BadRequestException('File exceeds the allowed size');
    }
    const mimeType = detectObjectMime(input.buffer);
    assertAllowedMime(input.type, mimeType);

    const fileId = randomUUID();
    const objectKey = jobObjectKey({
      organizationId: input.ctx.organizationId,
      jobId: job.id,
      category: categoryFolder(input.type),
      fileId,
      extension: extensionForMime(mimeType),
    });
    const reservation = await this.storageQuota.reserveUpload({
      organizationId: input.ctx.organizationId,
      userId: input.actorUserId,
      objectKey,
      originalName: sanitizeOriginalName(input.originalName, 'file'),
      mimeType,
      sizeBytes: input.buffer.length,
      purpose: StorageUploadPurpose.JOB_FILE,
      jobId: job.id,
      actorUserId: input.actorUserId,
    });
    try {
      await this.storage.put(objectKey, input.buffer, mimeType);
    } catch (error) {
      await this.storageQuota.failReservation(
        reservation.id,
        input.ctx.organizationId,
      );
      throw error;
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobFile.create({
        data: {
          id: fileId,
          organizationId: input.ctx.organizationId,
          jobId: job.id,
          objectKey,
          originalName: sanitizeOriginalName(input.originalName, 'file'),
          mimeType,
          sizeBytes: BigInt(input.buffer.length),
          type: input.type,
          caption: emptyToNull(input.caption),
          capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
          uploadedById: input.actorUserId,
        },
      });
      await this.storageQuota.completeReservation(
        reservation.id,
        input.ctx.organizationId,
        row.id,
        tx,
      );
      await this.audit.record(
        {
          action: AUDIT_FILE_UPLOADED,
          entityType: 'JobFile',
          entityId: row.id,
          organizationId: input.ctx.organizationId,
          actorUserId: input.actorUserId,
          newValues: { jobId: job.id, type: row.type, mimeType, sizeBytes: row.sizeBytes.toString() },
        },
        tx,
      );
      return row;
    });
    return this.present(created, input.ctx.organizationId, job.id);
  }

  private async present(
    file: {
      id: string;
      organizationId: string;
      jobId: string;
      objectKey: string;
      originalName: string;
      mimeType: string;
      sizeBytes: bigint;
      type: JobFileType;
      caption?: string | null;
      capturedAt?: Date | null;
      uploadedById: string;
      createdAt: Date;
    },
    organizationId: string,
    jobId: string,
  ) {
    if (
      file.organizationId !== organizationId ||
      !belongsToOrganization(file.objectKey, organizationId)
    ) {
      throw new NotFoundException();
    }
    const contentPath = `/api/organizations/${organizationId}/jobs/${jobId}/files/${file.id}/content`;
    const ttlSeconds = this.storage.getPresignGetExpirySeconds();
    let downloadUrl = `${process.env.APP_URL ?? 'http://localhost:4000'}${contentPath}`;
    let expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    let mode: 'stream' | 'presign' = 'stream';
    if (this.storage.isConfigured()) {
      try {
        const signed = await this.storage.presignGet(file.objectKey);
        downloadUrl = signed.url;
        expiresAt = signed.expiresAt;
        mode = 'presign';
      } catch {
        mode = 'stream';
      }
    }
    return {
      ...this.serializeFile(file),
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
      accessMode: mode,
      expiresInSeconds: ttlSeconds,
    };
  }

  private async requireFile(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    fileId: string,
  ) {
    await this.requireVisibleJob(ctx, actorUserId, jobId);
    const file = await this.prisma.jobFile.findFirst({
      where: {
        id: fileId,
        organizationId: ctx.organizationId,
        jobId,
      },
    });
    if (!file) {
      throw new NotFoundException();
    }
    return file;
  }

  private async requireSignableJob(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
  ) {
    const job = await this.requireVisibleJob(ctx, actorUserId, jobId);
    const assigned = job.assignments.some((row) => row.userId === actorUserId);
    if (!this.workflow.canSignOff(ctx.role, assigned, job.status)) {
      throw new ForbiddenException('Client sign-off is not available for this job');
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
