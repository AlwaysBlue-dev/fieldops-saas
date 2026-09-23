import { Injectable } from '@nestjs/common';
import type { OrganizationContext } from '../tenancy/request-context.js';
import type {
  CreateJobMaterialDto,
  CreateJobPhotoDto,
  CreateJobSignatureDto,
  CreateWorkLogDto,
} from './dto/job-field-action.dto.js';
import { JobExecutionService } from './job-execution.service.js';
import { JobFilesService } from './job-files.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AUDIT_JOB_MATERIAL, AUDIT_JOB_WORK_LOG } from '../common/constants.js';
import { emptyToNull } from './dto/text.util.js';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class JobFieldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly execution: JobExecutionService,
    private readonly files: JobFilesService,
  ) {}

  async addWorkLog(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: CreateWorkLogDto,
  ) {
    const job = await this.execution.requireMutableCapture(ctx, actorUserId, jobId);
    const text = (dto.text ?? dto.body ?? '').trim();
    if (!text) {
      throw new BadRequestException('Work log text is required');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobWorkLog.create({
        data: {
          organizationId: ctx.organizationId,
          jobId: job.id,
          authorUserId: actorUserId,
          body: text,
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
      text: created.body,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
      loggedAt: created.loggedAt.toISOString(),
    };
  }

  async addMaterial(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: CreateJobMaterialDto,
  ) {
    const job = await this.execution.requireMutableCapture(ctx, actorUserId, jobId);
    const itemName = (dto.itemName ?? dto.name ?? '').trim();
    if (!itemName) {
      throw new BadRequestException('Material item name is required');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobMaterial.create({
        data: {
          organizationId: ctx.organizationId,
          jobId: job.id,
          name: itemName,
          sku: emptyToNull(dto.partNumber),
          quantity: dto.quantity,
          unit: dto.unit,
          notes: emptyToNull(dto.notes),
          addedByUserId: actorUserId,
        },
        include: { addedBy: { select: { id: true, fullName: true } } },
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
    return this.execution.serializeMaterial(created);
  }

  addPhoto(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: CreateJobPhotoDto,
  ) {
    return this.files.addPhoto(ctx, actorUserId, jobId, dto);
  }

  addSignature(
    ctx: OrganizationContext,
    actorUserId: string,
    jobId: string,
    dto: CreateJobSignatureDto,
  ) {
    return this.files.addSignature(ctx, actorUserId, jobId, dto);
  }
}
