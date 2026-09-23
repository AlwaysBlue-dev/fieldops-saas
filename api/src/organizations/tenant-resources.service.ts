import { Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { withTenant } from '../tenancy/tenant-scope.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import type { DecideApprovalDto } from './dto/decide-approval.dto.js';

@Injectable()
export class TenantResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getJob(organizationId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: withTenant(organizationId, { id: jobId }),
      select: {
        id: true,
        organizationId: true,
        jobNumber: true,
        title: true,
        status: true,
        priority: true,
        jobType: true,
        clientId: true,
        siteId: true,
        scheduledStart: true,
        expectedFinish: true,
        updatedAt: true,
      },
    });
    if (!job) {
      throw new NotFoundException();
    }
    return job;
  }

  async getClient(organizationId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: withTenant(organizationId, { id: clientId }),
      select: {
        id: true,
        organizationId: true,
        name: true,
        accountCode: true,
        email: true,
        phone: true,
        status: true,
      },
    });
    if (!client) {
      throw new NotFoundException();
    }
    return {
      ...client,
      clientCode: client.accountCode,
    };
  }

  async getFile(organizationId: string, fileId: string) {
    const file = await this.prisma.jobFile.findFirst({
      where: withTenant(organizationId, { id: fileId }),
      select: {
        id: true,
        organizationId: true,
        jobId: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        type: true,
        createdAt: true,
      },
    });
    if (!file) {
      throw new NotFoundException();
    }
    return {
      ...file,
      sizeBytes: file.sizeBytes.toString(),
    };
  }

  async decideApproval(
    ctx: OrganizationContext,
    approvalId: string,
    dto: DecideApprovalDto,
    actorUserId: string,
  ) {
    const approval = await this.prisma.approval.findFirst({
      where: withTenant(ctx.organizationId, { id: approvalId }),
    });
    if (!approval) {
      throw new NotFoundException();
    }

    const updated = await this.prisma.approval.update({
      where: { id: approval.id },
      data: {
        status:
          dto.decision === 'APPROVED'
            ? ApprovalStatus.APPROVED
            : ApprovalStatus.REJECTED,
        comment: dto.comment,
        decidedByUserId: actorUserId,
        decidedAt: new Date(),
      },
      select: {
        id: true,
        organizationId: true,
        type: true,
        status: true,
        comment: true,
        decidedAt: true,
      },
    });

    await this.audit.record({
      action: 'approval.decided',
      entityType: 'Approval',
      entityId: updated.id,
      organizationId: ctx.organizationId,
      actorUserId,
      metadata: { decision: dto.decision },
    });

    return updated;
  }
}
