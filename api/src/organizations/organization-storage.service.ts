import { Injectable, NotFoundException } from '@nestjs/common';
import { JobFileType, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageQuotaService } from '../storage/storage-quota.service.js';
import { EntitlementService } from '../subscription/entitlement.service.js';
import { formatStorageBytes } from '../subscription/plan-catalog.js';
import type { OrganizationContext } from '../tenancy/request-context.js';
import type { ListStorageFilesQueryDto } from './dto/list-storage-files-query.dto.js';

@Injectable()
export class OrganizationStorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageQuota: StorageQuotaService,
    private readonly entitlements: EntitlementService,
  ) {}

  async usage(ctx: OrganizationContext) {
    await this.storageQuota.expireStaleReservations(ctx.organizationId);
    const entitlement = await this.entitlements.evaluate(ctx.organizationId);
    const limitBytes = BigInt(entitlement.plan.maxStorageBytes);
    const [usedBytes, reservedBytes, breakdown] = await Promise.all([
      this.storageQuota.confirmedStorageUsage(ctx.organizationId),
      this.storageQuota.reservedPendingBytes(ctx.organizationId),
      this.storageQuota.breakdown(ctx.organizationId),
    ]);
    const remainingBytes =
      limitBytes > usedBytes + reservedBytes
        ? limitBytes - usedBytes - reservedBytes
        : 0n;
    const percentageUsed =
      limitBytes === 0n
        ? 100
        : Math.min(
            100,
            Number((usedBytes * 10000n) / limitBytes) / 100,
          );
    const level =
      percentageUsed >= 100
        ? 'limit_reached'
        : percentageUsed >= 90
          ? 'high'
          : percentageUsed >= 80
            ? 'warning'
            : 'normal';

    return {
      usedBytes: usedBytes.toString(),
      reservedBytes: reservedBytes.toString(),
      remainingBytes: remainingBytes.toString(),
      limitBytes: limitBytes.toString(),
      percentageUsed,
      level,
      usedLabel: formatStorageBytes(usedBytes),
      reservedLabel: formatStorageBytes(reservedBytes),
      remainingLabel: formatStorageBytes(remainingBytes),
      limitLabel: formatStorageBytes(limitBytes),
      planCode: entitlement.plan.code,
      planName: entitlement.plan.name,
      breakdown: {
        jobPhotos: {
          bytes: breakdown.jobPhotosBytes.toString(),
          label: formatStorageBytes(breakdown.jobPhotosBytes),
        },
        jobDocuments: {
          bytes: breakdown.jobDocumentsBytes.toString(),
          label: formatStorageBytes(breakdown.jobDocumentsBytes),
        },
        signatures: {
          bytes: breakdown.signaturesBytes.toString(),
          label: formatStorageBytes(breakdown.signaturesBytes),
        },
        otherAttachments: {
          bytes: breakdown.otherAttachmentsBytes.toString(),
          label: formatStorageBytes(breakdown.otherAttachmentsBytes),
        },
        branding: {
          bytes: breakdown.brandingBytes.toString(),
          label: formatStorageBytes(breakdown.brandingBytes),
        },
      },
    };
  }

  async listFiles(ctx: OrganizationContext, query: ListStorageFilesQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const order = query.order === 'asc' ? 'asc' : 'desc';
    const sort = query.sort ?? 'createdAt';

    if (query.category === 'BRANDING') {
      const org = await this.prisma.organization.findFirst({
        where: { id: ctx.organizationId },
        select: {
          logoObjectKey: true,
          logoSizeBytes: true,
          updatedAt: true,
          name: true,
        },
      });
      if (!org?.logoObjectKey || !org.logoSizeBytes) {
        return { items: [], page, pageSize, total: 0, totalPages: 0 };
      }
      return {
        items: [
          {
            id: `branding-${ctx.organizationId}`,
            category: 'BRANDING' as const,
            originalName: 'Organization logo',
            sizeBytes: org.logoSizeBytes.toString(),
            sizeLabel: formatStorageBytes(org.logoSizeBytes),
            relatedRecord: {
              type: 'ORGANIZATION' as const,
              id: ctx.organizationId,
              label: org.name,
              hrefHint: 'settings',
            },
            uploadedBy: null,
            uploadedAt: org.updatedAt.toISOString(),
            openRecordPath: null,
            canDeleteHere: false,
          },
        ],
        page: 1,
        pageSize,
        total: 1,
        totalPages: 1,
      };
    }

    const where: Prisma.JobFileWhereInput = {
      organizationId: ctx.organizationId,
    };
    if (query.category) {
      where.type = query.category as JobFileType;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { originalName: { contains: term, mode: 'insensitive' } },
        { job: { jobNumber: { contains: term, mode: 'insensitive' } } },
        { job: { title: { contains: term, mode: 'insensitive' } } },
      ];
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }

    const [total, rows] = await Promise.all([
      this.prisma.jobFile.count({ where }),
      this.prisma.jobFile.findMany({
        where,
        include: {
          job: { select: { id: true, jobNumber: true, title: true } },
          uploadedBy: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { [sort]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        category: row.type,
        originalName: row.originalName,
        sizeBytes: row.sizeBytes.toString(),
        sizeLabel: formatStorageBytes(row.sizeBytes),
        relatedRecord: {
          type: 'JOB' as const,
          id: row.job.id,
          label: `${row.job.jobNumber} · ${row.job.title}`,
          hrefHint: `jobs/${row.job.id}`,
        },
        uploadedBy: {
          id: row.uploadedBy.id,
          fullName: row.uploadedBy.fullName,
          email: row.uploadedBy.email,
        },
        uploadedAt: row.createdAt.toISOString(),
        openRecordPath: `jobs/${row.job.id}`,
        canDeleteHere: false,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  async requireOrg(organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) throw new NotFoundException();
  }
}
