import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUDIT_ACTIVATION_REQUESTED,
  AUDIT_PLAN_CHANGE_REQUESTED,
  AUDIT_RENEWAL_REQUESTED,
  DEFAULT_SALES_EMAIL,
} from '../common/constants.js';
import type { EnvironmentVariables } from '../config/env.js';
import {
  ActivationRequestStatus,
  CommercialRequestType,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import type { RequestActivationDto } from './dto/request-activation.dto.js';
import { toSubscriptionDto } from './entitlement.js';
import { EntitlementService } from './entitlement.service.js';
import { SubscriptionNotificationService } from './subscription-notification.service.js';
import { UsageService } from './usage.service.js';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly usage: UsageService,
    private readonly audit: AuditService,
    private readonly notifications: SubscriptionNotificationService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async getForOrganization(organizationId: string) {
    const entitlement = await this.entitlements.evaluate(organizationId);
    const [usage, openRequests] = await Promise.all([
      this.usage.usageForSubscription(organizationId),
      this.prisma.activationRequest.findMany({
        where: {
          organizationId,
          status: {
            in: [ActivationRequestStatus.OPEN, ActivationRequestStatus.CONTACTED],
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return toSubscriptionDto(entitlement, {
      usage,
      openRequests: openRequests.map((row) => ({
        id: row.id,
        requestType: row.requestType,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
      supportEmail: this.salesEmail(),
    });
  }

  getUsage(organizationId: string) {
    return this.usage.getSummary(organizationId);
  }

  async requestActivation(
    organization: OrganizationContext,
    user: AuthUser,
    dto: RequestActivationDto,
  ) {
    return this.createRequest(
      organization,
      user,
      CommercialRequestType.ACTIVATION,
      dto.message,
    );
  }

  async requestRenewal(
    organization: OrganizationContext,
    user: AuthUser,
    dto: RequestActivationDto,
  ) {
    return this.createRequest(
      organization,
      user,
      CommercialRequestType.RENEWAL,
      dto.message,
    );
  }

  async requestPlanChange(
    organization: OrganizationContext,
    user: AuthUser,
    dto: RequestActivationDto,
  ) {
    return this.createRequest(
      organization,
      user,
      CommercialRequestType.PLAN_CHANGE,
      dto.message,
    );
  }

  private async createRequest(
    organization: OrganizationContext,
    user: AuthUser,
    requestType: CommercialRequestType,
    message?: string,
  ) {
    const existing = await this.prisma.activationRequest.findFirst({
      where: {
        organizationId: organization.organizationId,
        requestType,
        status: ActivationRequestStatus.OPEN,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      throw new ConflictException(
        requestType === CommercialRequestType.RENEWAL
          ? 'A renewal request is already open for this workspace'
          : requestType === CommercialRequestType.PLAN_CHANGE
            ? 'A plan change request is already open for this workspace'
            : 'An activation request is already open for this workspace',
      );
    }

    const organizationRow = await this.prisma.organization.findFirst({
      where: { id: organization.organizationId },
    });
    if (!organizationRow) {
      throw new NotFoundException();
    }

    const entitlement = await this.entitlements.evaluate(
      organization.organizationId,
    );
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.activationRequest.create({
        data: {
          organizationId: organization.organizationId,
          requestedByUserId: user.id,
          requestType,
          message: message?.trim() || null,
        },
      });
      const auditAction =
        requestType === CommercialRequestType.RENEWAL
          ? AUDIT_RENEWAL_REQUESTED
          : requestType === CommercialRequestType.PLAN_CHANGE
            ? AUDIT_PLAN_CHANGE_REQUESTED
            : AUDIT_ACTIVATION_REQUESTED;
      await this.audit.record(
        {
          action: auditAction,
          entityType: 'ActivationRequest',
          entityId: created.id,
          organizationId: organization.organizationId,
          actorUserId: user.id,
          newValues: {
            status: created.status,
            requestType,
            message: created.message,
            planCode: entitlement.plan.code,
            effectiveStatus: entitlement.effectiveStatus,
          },
        },
        tx,
      );
      return created;
    });

    if (requestType === CommercialRequestType.RENEWAL) {
      await this.notifications.sendRenewalRequested({
        organizationId: organization.organizationId,
        organizationName: organizationRow.name,
        organizationSlug: organizationRow.slug,
        requesterName: user.fullName,
        requesterEmail: user.email,
        message: request.message,
        planName: entitlement.plan.name,
        effectiveStatus: entitlement.effectiveStatus,
      });
    } else if (requestType === CommercialRequestType.PLAN_CHANGE) {
      await this.notifications.sendPlanChangeRequested({
        organizationId: organization.organizationId,
        organizationName: organizationRow.name,
        organizationSlug: organizationRow.slug,
        requesterUserId: user.id,
        requesterName: user.fullName,
        requesterEmail: user.email,
        message: request.message,
        planName: entitlement.plan.name,
        effectiveStatus: entitlement.effectiveStatus,
      });
    } else {
      await this.notifications.sendActivationRequested({
        organizationId: organization.organizationId,
        organizationName: organizationRow.name,
        organizationSlug: organizationRow.slug,
        requesterUserId: user.id,
        requesterName: user.fullName,
        requesterEmail: user.email,
        message: request.message,
        planName: entitlement.plan.name,
        effectiveStatus: entitlement.effectiveStatus,
      });
    }

    return {
      id: request.id,
      organizationId: request.organizationId,
      requestType: request.requestType,
      status: request.status,
      message: request.message,
      createdAt: request.createdAt.toISOString(),
    };
  }

  private salesEmail() {
    return (
      this.config.get('PLATFORM_SALES_EMAIL', { infer: true }) ??
      DEFAULT_SALES_EMAIL
    );
  }
}
