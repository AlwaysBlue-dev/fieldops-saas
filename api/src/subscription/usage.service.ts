import { Injectable } from '@nestjs/common';
import { AUDIT_PLAN_LIMIT_BLOCKED } from '../common/constants.js';
import {
  InvitationStatus,
  MembershipStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageQuotaService } from '../storage/storage-quota.service.js';
import { EntitlementService } from './entitlement.service.js';
import { formatStorageBytes } from './plan-catalog.js';
import { throwPlanLimitReached } from './plan-limit.exception.js';

@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
    private readonly storageQuota: StorageQuotaService,
  ) {}

  async countActiveMembers(organizationId: string) {
    return this.prisma.organizationMember.count({
      where: { organizationId, status: MembershipStatus.ACTIVE },
    });
  }

  async countPendingInvites(organizationId: string) {
    return this.prisma.organizationInvitation.count({
      where: { organizationId, status: InvitationStatus.PENDING },
    });
  }

  /** Confirmed metered bytes (job files + organization logo). */
  async storageUsedBytes(organizationId: string): Promise<bigint> {
    return this.storageQuota.confirmedStorageUsage(organizationId);
  }

  async jobsCreatedThisMonth(organizationId: string, now = new Date()) {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    return this.prisma.job.count({
      where: { organizationId, createdAt: { gte: start } },
    });
  }

  /**
   * Usage nested in subscription DTOs (legacy shape).
   */
  async usageForSubscription(organizationId: string) {
    const limits = await this.entitlements.getLimits(organizationId);
    const [usedUsers, usedBytes] = await Promise.all([
      this.countActiveMembers(organizationId),
      this.storageUsedBytes(organizationId),
    ]);
    return {
      users: { used: usedUsers, included: limits.maxUsers },
      storage: {
        usedBytes: usedBytes.toString(),
        includedBytes: limits.maxStorageBytes,
      },
    };
  }

  async getSummary(organizationId: string) {
    const entitlement = await this.entitlements.evaluate(organizationId);
    const plan = entitlement.plan;
    const [membersUsed, pendingInvites, storageUsed, jobsThisMonth] =
      await Promise.all([
        this.countActiveMembers(organizationId),
        this.countPendingInvites(organizationId),
        this.storageUsedBytes(organizationId),
        this.jobsCreatedThisMonth(organizationId),
      ]);

    return {
      plan: {
        code: plan.code,
        name: plan.name,
        priceLabel: plan.priceLabel,
        contactSales: plan.contactSales,
      },
      subscription: {
        status: entitlement.status,
        effectiveStatus: entitlement.effectiveStatus,
        accessUntil: this.entitlements.accessUntil(entitlement),
        trialEndsAt: entitlement.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: entitlement.currentPeriodEnd?.toISOString() ?? null,
        canMutate: entitlement.canMutate,
        readOnly: entitlement.readOnly,
      },
      members: {
        used: membersUsed,
        pendingInvites,
        limit: plan.maxUsers,
      },
      storage: {
        usedBytes: storageUsed.toString(),
        limitBytes: plan.maxStorageBytes,
      },
      jobsThisMonth,
      features: this.entitlements.featureList(plan),
    };
  }

  async assertSeatAvailable(
    organizationId: string,
    options: {
      reservingInvite?: boolean;
      actorUserId?: string | null;
    } = {},
  ) {
    const reservingInvite = options.reservingInvite ?? true;
    const entitlement = await this.entitlements.evaluate(organizationId);
    const [used, pending] = await Promise.all([
      this.countActiveMembers(organizationId),
      reservingInvite
        ? this.countPendingInvites(organizationId)
        : Promise.resolve(0),
    ]);
    const next = used + pending + 1;
    const limit = entitlement.plan.maxUsers;
    if (next > limit) {
      await this.recordLimitBlocked({
        organizationId,
        actorUserId: options.actorUserId,
        limitType: 'USERS',
        used,
        limit,
        planCode: entitlement.plan.code,
        pendingInvites: pending,
      });
      throwPlanLimitReached({
        limitType: 'USERS',
        used,
        limit,
        planCode: entitlement.plan.code,
        planName: entitlement.plan.name,
        message: `You've reached the ${limit}-user limit on your ${entitlement.plan.name} plan.`,
      });
    }
  }

  /**
   * Prefer StorageQuotaService.reserveUpload for uploads (concurrency-safe).
   * Kept for callers that need a preflight check without a reservation.
   */
  async assertStorageAvailable(
    organizationId: string,
    incomingBytes: number,
    options: { actorUserId?: string | null } = {},
  ) {
    await this.storageQuota.expireStaleReservations(organizationId);
    const entitlement = await this.entitlements.evaluate(organizationId);
    const limit = BigInt(entitlement.plan.maxStorageBytes);
    const used = await this.storageUsedBytes(organizationId);
    const reserved =
      await this.storageQuota.reservedPendingBytes(organizationId);
    if (used + reserved + BigInt(incomingBytes) > limit) {
      const displayUsed = used + reserved;
      await this.recordLimitBlocked({
        organizationId,
        actorUserId: options.actorUserId,
        limitType: 'STORAGE',
        used: displayUsed.toString(),
        limit: limit.toString(),
        planCode: entitlement.plan.code,
        incomingBytes,
      });
      throwPlanLimitReached({
        limitType: 'STORAGE',
        used: displayUsed.toString(),
        limit: limit.toString(),
        planCode: entitlement.plan.code,
        planName: entitlement.plan.name,
        message: `Storage limit reached. Your organization has used ${formatStorageBytes(displayUsed)} of its ${formatStorageBytes(limit)} allowance.`,
      });
    }
  }

  private async recordLimitBlocked(input: {
    organizationId: string;
    actorUserId?: string | null;
    limitType: 'USERS' | 'STORAGE';
    used: number | string;
    limit: number | string;
    planCode: string;
    pendingInvites?: number;
    incomingBytes?: number;
  }) {
    try {
      await this.audit.record({
        action: AUDIT_PLAN_LIMIT_BLOCKED,
        entityType: 'Organization',
        entityId: input.organizationId,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId ?? null,
        newValues: {
          limitType: input.limitType,
          used: input.used,
          limit: input.limit,
          planCode: input.planCode,
          pendingInvites: input.pendingInvites ?? null,
          incomingBytes: input.incomingBytes ?? null,
        },
      });
    } catch {
      // Never fail the request because audit write failed.
    }
  }
}
