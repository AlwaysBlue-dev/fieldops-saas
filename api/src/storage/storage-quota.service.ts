import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AUDIT_PLAN_LIMIT_BLOCKED,
  FILE_PRESIGN_TTL_SECONDS,
} from '../common/constants.js';
import {
  Prisma,
  StorageUploadPurpose,
  StorageUploadStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntitlementService } from '../subscription/entitlement.service.js';
import { formatStorageBytes } from '../subscription/plan-catalog.js';
import { throwPlanLimitReached } from '../subscription/plan-limit.exception.js';

export type StorageBreakdown = {
  jobPhotosBytes: bigint;
  jobDocumentsBytes: bigint;
  signaturesBytes: bigint;
  otherAttachmentsBytes: bigint;
  brandingBytes: bigint;
};

type Tx = Prisma.TransactionClient;

@Injectable()
export class StorageQuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
  ) {}

  reservationTtlSeconds() {
    return FILE_PRESIGN_TTL_SECONDS;
  }

  async confirmedStorageUsage(organizationId: string, tx?: Tx): Promise<bigint> {
    const db = tx ?? this.prisma;
    const [files, org] = await Promise.all([
      db.jobFile.aggregate({
        where: { organizationId },
        _sum: { sizeBytes: true },
      }),
      db.organization.findFirst({
        where: { id: organizationId },
        select: { logoSizeBytes: true },
      }),
    ]);
    return (files._sum.sizeBytes ?? 0n) + (org?.logoSizeBytes ?? 0n);
  }

  async reservedPendingBytes(organizationId: string, tx?: Tx): Promise<bigint> {
    const db = tx ?? this.prisma;
    const now = new Date();
    const reserved = await db.storageUpload.aggregate({
      where: {
        organizationId,
        status: StorageUploadStatus.PENDING,
        expiresAt: { gt: now },
      },
      _sum: { sizeBytes: true },
    });
    return reserved._sum.sizeBytes ?? 0n;
  }

  async breakdown(organizationId: string): Promise<StorageBreakdown> {
    const [byType, org] = await Promise.all([
      this.prisma.jobFile.groupBy({
        by: ['type'],
        where: { organizationId },
        _sum: { sizeBytes: true },
      }),
      this.prisma.organization.findFirst({
        where: { id: organizationId },
        select: { logoSizeBytes: true },
      }),
    ]);
    const sumFor = (type: string) =>
      byType.find((row) => row.type === type)?._sum.sizeBytes ?? 0n;
    return {
      jobPhotosBytes: sumFor('PHOTO'),
      jobDocumentsBytes: sumFor('DOCUMENT'),
      signaturesBytes: sumFor('SIGNATURE'),
      otherAttachmentsBytes: sumFor('OTHER'),
      brandingBytes: org?.logoSizeBytes ?? 0n,
    };
  }

  /**
   * Locks the organization row, checks confirmed + reserved + requested against
   * plan maxStorageBytes, and creates a PENDING StorageUpload reservation.
   */
  async reserveUpload(input: {
    organizationId: string;
    userId: string;
    objectKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number | bigint;
    purpose: StorageUploadPurpose;
    jobId?: string | null;
    /** Bytes already counted in confirmed usage that this upload will replace (e.g. current logo). */
    replacingBytes?: number | bigint;
    actorUserId?: string | null;
  }) {
    const sizeBytes = BigInt(input.sizeBytes);
    const replacingBytes = BigInt(input.replacingBytes ?? 0);
    const netAdditional =
      sizeBytes > replacingBytes ? sizeBytes - replacingBytes : 0n;
    const entitlement = await this.entitlements.evaluate(input.organizationId);
    const limit = BigInt(entitlement.plan.maxStorageBytes);
    const expiresAt = new Date(
      Date.now() + this.reservationTtlSeconds() * 1000,
    );
    const id = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "Organization" WHERE id = ${input.organizationId}::uuid FOR UPDATE
      `;
      const confirmed = await this.confirmedStorageUsage(
        input.organizationId,
        tx,
      );
      const reserved = await this.reservedPendingBytes(
        input.organizationId,
        tx,
      );
      if (confirmed + reserved + netAdditional > limit) {
        const usedDisplay = confirmed + reserved;
        await this.recordLimitBlocked({
          organizationId: input.organizationId,
          actorUserId: input.actorUserId ?? input.userId,
          used: usedDisplay.toString(),
          limit: limit.toString(),
          planCode: entitlement.plan.code,
          incomingBytes: Number(sizeBytes),
        });
        throwPlanLimitReached({
          limitType: 'STORAGE',
          used: usedDisplay.toString(),
          limit: limit.toString(),
          planCode: entitlement.plan.code,
          planName: entitlement.plan.name,
          message: `Storage limit reached. Your organization has used ${formatStorageBytes(usedDisplay)} of its ${formatStorageBytes(limit)} allowance.`,
        });
      }

      return tx.storageUpload.create({
        data: {
          id,
          organizationId: input.organizationId,
          userId: input.userId,
          objectKey: input.objectKey,
          originalName: input.originalName,
          mimeType: input.mimeType,
          sizeBytes,
          status: StorageUploadStatus.PENDING,
          purpose: input.purpose,
          jobId: input.jobId ?? null,
          expiresAt,
        },
      });
    });
  }

  async completeReservation(
    reservationId: string,
    organizationId: string,
    jobFileId: string | null,
    tx?: Tx,
  ) {
    const db = tx ?? this.prisma;
    const updated = await db.storageUpload.updateMany({
      where: {
        id: reservationId,
        organizationId,
        status: StorageUploadStatus.PENDING,
      },
      data: {
        status: StorageUploadStatus.COMPLETED,
        completedAt: new Date(),
        jobFileId,
      },
    });
    return updated.count === 1;
  }

  async failReservation(reservationId: string, organizationId: string) {
    await this.prisma.storageUpload.updateMany({
      where: {
        id: reservationId,
        organizationId,
        status: StorageUploadStatus.PENDING,
      },
      data: {
        status: StorageUploadStatus.FAILED,
        completedAt: new Date(),
      },
    });
  }

  async cancelReservation(reservationId: string, organizationId: string) {
    await this.prisma.storageUpload.updateMany({
      where: {
        id: reservationId,
        organizationId,
        status: StorageUploadStatus.PENDING,
      },
      data: {
        status: StorageUploadStatus.CANCELLED,
        completedAt: new Date(),
      },
    });
  }

  /** Soft-expire stale PENDING rows so they stop counting (lazy, no worker required). */
  async expireStaleReservations(organizationId: string) {
    await this.prisma.storageUpload.updateMany({
      where: {
        organizationId,
        status: StorageUploadStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: { status: StorageUploadStatus.EXPIRED, completedAt: new Date() },
    });
  }

  private async recordLimitBlocked(input: {
    organizationId: string;
    actorUserId?: string | null;
    used: string;
    limit: string;
    planCode: string;
    incomingBytes: number;
  }) {
    try {
      await this.audit.record({
        action: AUDIT_PLAN_LIMIT_BLOCKED,
        entityType: 'Organization',
        entityId: input.organizationId,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        newValues: {
          limitType: 'STORAGE',
          used: input.used,
          limit: input.limit,
          planCode: input.planCode,
          incomingBytes: input.incomingBytes,
        },
      });
    } catch {
      // Never fail the request because audit write failed.
    }
  }
}
