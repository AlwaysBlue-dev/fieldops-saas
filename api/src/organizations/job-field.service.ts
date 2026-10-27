import { BadRequestException, Injectable } from '@nestjs/common';
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
import {
  asRecordId,
  isUniqueViolation,
  rejectCrossTenantReplay,
} from './client-operation-id.js';

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
    const recordId = asRecordId(dto.clientOperationId);
    if (recordId) {
      const existing = await this.prisma.jobWorkLog.findFirst({
        where: { id: recordId },
      });
      if (existing) {
        if (
          existing.organizationId !== ctx.organizationId ||
          existing.jobId !== job.id
        ) {
          rejectCrossTenantReplay();
        }
        return this.serializeWorkLog(existing);
      }
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.jobWorkLog.create({
          data: {
            ...(recordId ? { id: recordId } : {}),
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
            newValues: {
              workLogId: row.id,
              clientOperationId: recordId ?? null,
            },
          },
          tx,
        );
        return row;
      });
      return this.serializeWorkLog(created);
    } catch (error) {
      if (recordId && isUniqueViolation(error)) {
        const existing = await this.prisma.jobWorkLog.findFirst({
          where: {
            id: recordId,
            organizationId: ctx.organizationId,
            jobId: job.id,
          },
        });
        if (existing) return this.serializeWorkLog(existing);
      }
      throw error;
    }
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
    const recordId = asRecordId(dto.clientOperationId);
    if (recordId) {
      const existing = await this.prisma.jobMaterial.findFirst({
        where: { id: recordId },
        include: { addedBy: { select: { id: true, fullName: true } } },
      });
      if (existing) {
        if (
          existing.organizationId !== ctx.organizationId ||
          existing.jobId !== job.id
        ) {
          rejectCrossTenantReplay();
        }
        return this.execution.serializeMaterial(existing);
      }
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.jobMaterial.create({
          data: {
            ...(recordId ? { id: recordId } : {}),
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
            newValues: {
              materialId: row.id,
              name: row.name,
              clientOperationId: recordId ?? null,
            },
          },
          tx,
        );
        return row;
      });
      return this.execution.serializeMaterial(created);
    } catch (error) {
      if (recordId && isUniqueViolation(error)) {
        const existing = await this.prisma.jobMaterial.findFirst({
          where: {
            id: recordId,
            organizationId: ctx.organizationId,
            jobId: job.id,
          },
          include: { addedBy: { select: { id: true, fullName: true } } },
        });
        if (existing) return this.execution.serializeMaterial(existing);
      }
      throw error;
    }
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

  private serializeWorkLog(row: {
    id: string;
    body: string;
    createdAt: Date;
    loggedAt: Date;
  }) {
    return {
      id: row.id,
      text: row.body,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      loggedAt: row.loggedAt.toISOString(),
    };
  }
}
