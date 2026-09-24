import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTIVATION_REQUEST_UPDATED,
  AUDIT_ORGANIZATION_ACTIVATED,
  AUDIT_ORGANIZATION_CANCELLED,
  AUDIT_ORGANIZATION_REACTIVATED,
  AUDIT_ORGANIZATION_SUSPENDED,
  AUDIT_PLAN_CHANGED,
  AUDIT_TRIAL_EXTENDED,
  TRIAL_GRACE_DAYS,
  TRIAL_PLAN_CODE,
} from '../common/constants.js';
import {
  ActivationRequestStatus,
  CommercialRequestType,
  MembershipStatus,
  OrganizationRole,
  OrganizationStatus,
  PlanStatus,
  Prisma,
  SubscriptionStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageQuotaService } from '../storage/storage-quota.service.js';
import { CLOCK, addUtcDays, type Clock } from '../subscription/clock.js';
import type { ActivateSubscriptionDto } from '../subscription/dto/activate-subscription.dto.js';
import type { ChangePlanDto } from '../subscription/dto/change-plan.dto.js';
import type { ExtendTrialDto } from '../subscription/dto/extend-trial.dto.js';
import type { RenewSubscriptionDto } from '../subscription/dto/renew-subscription.dto.js';
import type { UpdateCommercialRequestDto } from '../subscription/dto/update-commercial-request.dto.js';
import { toSubscriptionDto } from '../subscription/entitlement.js';
import { resolveActivationPeriod, resolveRenewalPeriod } from '../subscription/period.js';
import { SubscriptionAccessService } from '../subscription/subscription-access.service.js';
import { SubscriptionNotificationService } from '../subscription/subscription-notification.service.js';
import type {
  ListPlatformOrganizationsQueryDto,
  SetSubscriptionPeriodDto,
  SuspendOrganizationDto,
} from './dto/platform-admin.dto.js';

const AUDIT_SUBSCRIPTION_PERIOD_SET = 'SUBSCRIPTION_PERIOD_SET';
const AUDIT_SUBSCRIPTION_RENEWED = 'SUBSCRIPTION_RENEWED';

@Injectable()
export class PlatformSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SubscriptionAccessService,
    private readonly audit: AuditService,
    private readonly notifications: SubscriptionNotificationService,
    private readonly storageQuota: StorageQuotaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getDashboard() {
    const now = this.clock.now();
    const [
      organizations,
      totalUsers,
      totalJobs,
      activationRequestCount,
      recentSignups,
    ] = await Promise.all([
      this.prisma.organization.findMany({
        select: { id: true },
      }),
      this.prisma.user.count(),
      this.prisma.job.count(),
      this.prisma.activationRequest.count({
        where: {
          requestType: CommercialRequestType.ACTIVATION,
          status: {
            in: [ActivationRequestStatus.OPEN, ActivationRequestStatus.CONTACTED],
          },
        },
      }),
      this.prisma.organization.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          email: true,
          subscription: {
            select: {
              status: true,
              plan: { select: { code: true, name: true } },
            },
          },
        },
      }),
    ]);

    const counts = {
      totalOrganizations: organizations.length,
      trialOrganizations: 0,
      graceOrganizations: 0,
      activeOrganizations: 0,
      expiredTrials: 0,
      suspendedOrganizations: 0,
    };

    await Promise.all(
      organizations.map(async (org) => {
        const entitlement = await this.access.evaluate(org.id, now);
        switch (entitlement.effectiveStatus) {
          case 'TRIALING':
            counts.trialOrganizations += 1;
            break;
          case 'GRACE':
          case 'PAID_GRACE':
            counts.graceOrganizations += 1;
            break;
          case 'ACTIVE':
            counts.activeOrganizations += 1;
            break;
          case 'TRIAL_EXPIRED':
            counts.expiredTrials += 1;
            break;
          case 'SUSPENDED':
            counts.suspendedOrganizations += 1;
            break;
          default:
            break;
        }
      }),
    );

    const recentWithStatus = await Promise.all(
      recentSignups.map(async (row) => {
        const entitlement = row.subscription
          ? await this.access.evaluate(row.id, now)
          : null;
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          email: row.email,
          createdAt: row.createdAt.toISOString(),
          planCode: row.subscription?.plan.code ?? null,
          planName: row.subscription?.plan.name ?? null,
          effectiveStatus: entitlement?.effectiveStatus ?? null,
        };
      }),
    );

    return {
      ...counts,
      totalUsers,
      totalJobs,
      activationRequests: activationRequestCount,
      recentSignups: recentWithStatus,
    };
  }

  async listOrganizations(query: ListPlatformOrganizationsQueryDto = {}) {
    const now = this.clock.now();
    const where: Prisma.OrganizationWhereInput = {};

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
      ];
    }
    if (query.status) {
      where.status = query.status as OrganizationStatus;
    }
    if (query.planCode) {
      where.subscription = {
        is: {
          plan: { code: query.planCode },
        },
      };
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) {
        where.createdAt.gte = new Date(query.createdFrom);
      }
      if (query.createdTo) {
        const end = new Date(query.createdTo);
        end.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const rows = await this.prisma.organization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: { include: { plan: true } },
        members: {
          where: {
            role: OrganizationRole.OWNER,
            status: MembershipStatus.ACTIVE,
          },
          take: 1,
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const mapped = await Promise.all(
      rows.map(async (row) => {
        const entitlement = row.subscription
          ? await this.access.evaluate(row.id, now)
          : null;
        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          status: row.status,
          timezone: row.timezone,
          createdAt: row.createdAt.toISOString(),
          owner: row.members[0]
            ? {
                id: row.members[0].user.id,
                fullName: row.members[0].user.fullName,
                email: row.members[0].user.email,
              }
            : null,
          subscription: entitlement ? toSubscriptionDto(entitlement) : null,
        };
      }),
    );

    if (query.subscriptionStatus) {
      return mapped.filter(
        (row) => row.subscription?.effectiveStatus === query.subscriptionStatus,
      );
    }
    return mapped;
  }

  async getOrganization(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      include: {
        members: {
          where: {
            role: OrganizationRole.OWNER,
            status: MembershipStatus.ACTIVE,
          },
          take: 1,
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        subscription: { include: { plan: true } },
      },
    });
    if (!organization) {
      throw new NotFoundException();
    }

    const entitlement = organization.subscription
      ? await this.access.evaluate(organizationId)
      : null;

    const [memberCount, jobCount, storageBytes] = await Promise.all([
      this.prisma.organizationMember.count({
        where: { organizationId, status: MembershipStatus.ACTIVE },
      }),
      this.prisma.job.count({ where: { organizationId } }),
      this.storageQuota.confirmedStorageUsage(organizationId),
    ]);

    const ownerUser = organization.members[0]?.user ?? null;
    let ownerTrialUsedAt: Date | null = null;
    if (ownerUser) {
      try {
        const trialRows = await this.prisma.$queryRaw<
          Array<{ trialUsedAt: Date | null }>
        >`
          SELECT "trialUsedAt" FROM "User" WHERE id = ${ownerUser.id}::uuid
        `;
        ownerTrialUsedAt = trialRows[0]?.trialUsedAt ?? null;
      } catch {
        ownerTrialUsedAt = null;
      }
    }

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      email: organization.email,
      phone: organization.phone,
      status: organization.status,
      timezone: organization.timezone,
      createdAt: organization.createdAt.toISOString(),
      owner: ownerUser
        ? {
            id: ownerUser.id,
            fullName: ownerUser.fullName,
            email: ownerUser.email,
            trialUsed: ownerTrialUsedAt != null,
            trialUsedAt: ownerTrialUsedAt?.toISOString() ?? null,
          }
        : null,
      subscription: entitlement ? toSubscriptionDto(entitlement) : null,
      usage: {
        members: memberCount,
        jobs: jobCount,
        storageBytes: storageBytes.toString(),
        storageIncludedBytes: entitlement?.plan.maxStorageBytes ?? null,
      },
    };
  }

  async activate(
    organizationId: string,
    actorUserId: string,
    dto: ActivateSubscriptionDto,
  ) {
    const subscription = await this.requireSubscription(organizationId);
    const plan = await this.resolvePlan(dto.planId, dto.planCode ?? TRIAL_PLAN_CODE);
    const now = this.clock.now();
    const { currentPeriodStart, currentPeriodEnd } = resolveActivationPeriod(
      now,
      dto.currentPeriodStart,
      dto.currentPeriodEnd,
    );
    if (currentPeriodEnd.getTime() <= currentPeriodStart.getTime()) {
      throw new BadRequestException('currentPeriodEnd must be after currentPeriodStart');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          planId: plan.id,
          currentPeriodStart,
          currentPeriodEnd,
          activatedAt: now,
          activatedByUserId: actorUserId,
          cancelAtPeriodEnd: false,
        },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { status: OrganizationStatus.ACTIVE },
      });

      const openRequests = await tx.activationRequest.findMany({
        where: {
          organizationId,
          requestType: CommercialRequestType.ACTIVATION,
          status: {
            in: [ActivationRequestStatus.OPEN, ActivationRequestStatus.CONTACTED],
          },
        },
      });
      if (openRequests.length > 0) {
        await tx.activationRequest.updateMany({
          where: { id: { in: openRequests.map((r) => r.id) } },
          data: { status: ActivationRequestStatus.CLOSED },
        });
        for (const request of openRequests) {
          await this.audit.record(
            {
              action: AUDIT_ACTIVATION_REQUEST_UPDATED,
              entityType: 'ActivationRequest',
              entityId: request.id,
              organizationId,
              actorUserId,
              oldValues: { status: request.status },
              newValues: {
                status: ActivationRequestStatus.CLOSED,
                reason: 'closed_on_activation',
              },
            },
            tx,
          );
        }
      }

      await this.audit.record(
        {
          action: AUDIT_ORGANIZATION_ACTIVATED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: {
            status: subscription.status,
            planId: subscription.planId,
          },
          newValues: {
            status: SubscriptionStatus.ACTIVE,
            planId: plan.id,
            planCode: plan.code,
            currentPeriodStart: currentPeriodStart.toISOString(),
            currentPeriodEnd: currentPeriodEnd.toISOString(),
            activatedAt: now.toISOString(),
            activatedBy: actorUserId,
          },
        },
        tx,
      );
    });

    const organization = await this.prisma.organization.findFirstOrThrow({
      where: { id: organizationId },
    });
    await this.notifications.sendActivated({
      organizationId,
      organizationName: organization.name,
      planName: plan.name,
      currentPeriodEnd,
    });

    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  async renew(
    organizationId: string,
    actorUserId: string,
    dto: RenewSubscriptionDto,
  ) {
    const subscription = await this.requireSubscription(organizationId);
    const plan = dto.planId || dto.planCode
      ? await this.resolvePlan(dto.planId, dto.planCode)
      : await this.prisma.plan.findFirstOrThrow({ where: { id: subscription.planId } });
    const now = this.clock.now();
    const { currentPeriodStart, currentPeriodEnd } = resolveRenewalPeriod(
      now,
      subscription.currentPeriodEnd,
      subscription.currentPeriodStart,
      dto.currentPeriodStart,
      dto.currentPeriodEnd,
    );
    if (currentPeriodEnd.getTime() <= currentPeriodStart.getTime()) {
      throw new BadRequestException('currentPeriodEnd must be after currentPeriodStart');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          planId: plan.id,
          currentPeriodStart,
          currentPeriodEnd,
          activatedAt: subscription.activatedAt ?? now,
          activatedByUserId: actorUserId,
          cancelAtPeriodEnd: false,
        },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { status: OrganizationStatus.ACTIVE },
      });
      await this.audit.record(
        {
          action: AUDIT_SUBSCRIPTION_RENEWED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: {
            status: subscription.status,
            planId: subscription.planId,
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          },
          newValues: {
            status: SubscriptionStatus.ACTIVE,
            planId: plan.id,
            currentPeriodStart: currentPeriodStart.toISOString(),
            currentPeriodEnd: currentPeriodEnd.toISOString(),
          },
        },
        tx,
      );
    });

    const organization = await this.prisma.organization.findFirstOrThrow({
      where: { id: organizationId },
    });
    await this.notifications.sendRenewed({
      organizationId,
      organizationName: organization.name,
      planName: plan.name,
      currentPeriodEnd,
    });

    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  async changePlan(
    organizationId: string,
    actorUserId: string,
    dto: ChangePlanDto,
  ) {
    const subscription = await this.requireSubscription(organizationId);
    const plan = await this.resolvePlan(dto.planId, dto.planCode);
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { planId: plan.id },
      });
      await this.audit.record(
        {
          action: AUDIT_PLAN_CHANGED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: { planId: subscription.planId },
          newValues: { planId: plan.id, planCode: plan.code },
        },
        tx,
      );
    });
    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  async setPeriod(
    organizationId: string,
    actorUserId: string,
    dto: SetSubscriptionPeriodDto,
  ) {
    const subscription = await this.requireSubscription(organizationId);
    const currentPeriodStart = new Date(dto.currentPeriodStart);
    const currentPeriodEnd = new Date(dto.currentPeriodEnd);
    if (Number.isNaN(currentPeriodStart.getTime()) || Number.isNaN(currentPeriodEnd.getTime())) {
      throw new BadRequestException('Invalid period dates');
    }
    if (currentPeriodEnd.getTime() <= currentPeriodStart.getTime()) {
      throw new BadRequestException('currentPeriodEnd must be after currentPeriodStart');
    }
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart,
          currentPeriodEnd,
          status:
            subscription.status === SubscriptionStatus.SUSPENDED
              ? subscription.status
              : SubscriptionStatus.ACTIVE,
          activatedAt: subscription.activatedAt ?? now,
          activatedByUserId: subscription.activatedByUserId ?? actorUserId,
          cancelAtPeriodEnd: false,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_SUBSCRIPTION_PERIOD_SET,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: {
            currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          },
          newValues: {
            currentPeriodStart: currentPeriodStart.toISOString(),
            currentPeriodEnd: currentPeriodEnd.toISOString(),
          },
        },
        tx,
      );
    });
    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  async extendTrial(
    organizationId: string,
    actorUserId: string,
    dto: ExtendTrialDto,
  ) {
    const subscription = await this.requireSubscription(organizationId);
    const now = this.clock.now();

    let trialEndsAt: Date;
    let days: number | null = null;
    if (dto.trialEndsAt) {
      trialEndsAt = new Date(dto.trialEndsAt);
      if (Number.isNaN(trialEndsAt.getTime())) {
        throw new BadRequestException('Invalid trialEndsAt');
      }
      if (trialEndsAt.getTime() <= now.getTime()) {
        throw new BadRequestException('trialEndsAt must be in the future');
      }
    } else {
      days = dto.days ?? 14;
      const base =
        subscription.trialEndsAt && subscription.trialEndsAt.getTime() > now.getTime()
          ? subscription.trialEndsAt
          : now;
      trialEndsAt = addUtcDays(base, days);
    }

    const graceEndsAt = addUtcDays(trialEndsAt, TRIAL_GRACE_DAYS);
    const trialStartedAt = subscription.trialStartedAt ?? now;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.TRIALING,
          trialStartedAt,
          trialEndsAt,
          graceEndsAt,
          cancelAtPeriodEnd: false,
        },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { status: OrganizationStatus.ACTIVE },
      });
      await this.audit.record(
        {
          action: AUDIT_TRIAL_EXTENDED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: {
            trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
            graceEndsAt: subscription.graceEndsAt?.toISOString() ?? null,
          },
          newValues: {
            days,
            trialEndsAt: trialEndsAt.toISOString(),
            graceEndsAt: graceEndsAt.toISOString(),
          },
        },
        tx,
      );
    });

    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  async suspend(
    organizationId: string,
    actorUserId: string,
    dto: SuspendOrganizationDto,
  ) {
    const subscription = await this.requireSubscription(organizationId);
    const reason = dto.reason.trim();
    if (reason.length < 3) {
      throw new BadRequestException('Suspension reason is required');
    }
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.SUSPENDED },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { status: OrganizationStatus.SUSPENDED },
      });
      await this.audit.record(
        {
          action: AUDIT_ORGANIZATION_SUSPENDED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: {
            status: subscription.status,
            organizationStatus: OrganizationStatus.ACTIVE,
          },
          newValues: {
            status: SubscriptionStatus.SUSPENDED,
            organizationStatus: OrganizationStatus.SUSPENDED,
            reason,
          },
        },
        tx,
      );
    });
    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  async reactivate(organizationId: string, actorUserId: string) {
    const subscription = await this.requireSubscription(organizationId);
    const now = this.clock.now();
    const nextStatus = subscription.activatedAt
      ? SubscriptionStatus.ACTIVE
      : SubscriptionStatus.TRIALING;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: nextStatus,
          cancelAtPeriodEnd: false,
        },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { status: OrganizationStatus.ACTIVE },
      });
      await this.audit.record(
        {
          action: AUDIT_ORGANIZATION_REACTIVATED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: { status: subscription.status },
          newValues: { status: nextStatus },
        },
        tx,
      );
    });

    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  async cancel(organizationId: string, actorUserId: string) {
    const subscription = await this.requireSubscription(organizationId);
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelAtPeriodEnd: true,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_ORGANIZATION_CANCELLED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId,
          actorUserId,
          oldValues: { status: subscription.status },
          newValues: { status: SubscriptionStatus.CANCELLED },
        },
        tx,
      );
    });
    return toSubscriptionDto(await this.access.evaluate(organizationId, now));
  }

  async listRequests(filters: {
    requestType?: CommercialRequestType;
    status?: ActivationRequestStatus;
  }) {
    const rows = await this.prisma.activationRequest.findMany({
      where: {
        requestType: filters.requestType,
        status: filters.status,
      },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        requestedBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.serializeRequest(row));
  }

  async updateRequest(
    requestId: string,
    actorUserId: string,
    dto: UpdateCommercialRequestDto,
  ) {
    const request = await this.prisma.activationRequest.findFirst({
      where: { id: requestId },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        requestedBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!request) {
      throw new NotFoundException();
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.activationRequest.update({
        where: { id: request.id },
        data: { status: dto.status },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          requestedBy: { select: { id: true, fullName: true, email: true } },
        },
      });
      await this.audit.record(
        {
          action: AUDIT_ACTIVATION_REQUEST_UPDATED,
          entityType: 'ActivationRequest',
          entityId: next.id,
          organizationId: next.organizationId,
          actorUserId,
          oldValues: { status: request.status },
          newValues: { status: next.status },
        },
        tx,
      );
      return next;
    });
    return this.serializeRequest(updated);
  }

  private serializeRequest(row: {
    id: string;
    organizationId: string;
    requestType: CommercialRequestType;
    status: ActivationRequestStatus;
    message: string | null;
    createdAt: Date;
    updatedAt: Date;
    organization: { id: string; name: string; slug: string };
    requestedBy: { id: string; fullName: string; email: string };
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      requestType: row.requestType,
      status: row.status,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      organization: row.organization,
      requestedBy: row.requestedBy,
      owner: row.requestedBy,
      email: row.requestedBy.email,
      requestedDate: row.createdAt.toISOString(),
    };
  }

  private async requireSubscription(organizationId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { organizationId },
    });
    if (!subscription) {
      throw new NotFoundException();
    }
    return subscription;
  }

  private async resolvePlan(planId?: string, planCode?: string) {
    if (!planId && !planCode) {
      throw new BadRequestException('planId or planCode is required');
    }
    const plan = planId
      ? await this.prisma.plan.findFirst({
          where: { id: planId, status: PlanStatus.ACTIVE },
        })
      : await this.prisma.plan.findFirst({
          where: { code: planCode, status: PlanStatus.ACTIVE },
        });
    if (!plan) {
      throw new BadRequestException('Plan is not available');
    }
    return plan;
  }
}
