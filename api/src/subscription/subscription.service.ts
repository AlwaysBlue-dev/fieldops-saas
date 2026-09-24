import {
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
  InvoiceStatus,
  InvoiceType,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { canShowPayInvoice, invoiceStatusLabel } from '../billing/invoice-status.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import type { RequestActivationDto } from './dto/request-activation.dto.js';
import { toSubscriptionDto, type ActivationProgress } from './entitlement.js';
import { EntitlementService } from './entitlement.service.js';
import { SubscriptionNotificationService } from './subscription-notification.service.js';
import { UsageService } from './usage.service.js';

const OPEN_REQUEST_STATUSES: ActivationRequestStatus[] = [
  ActivationRequestStatus.OPEN,
  ActivationRequestStatus.CONTACTED,
];

const ACTIVE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.PREPARING,
  InvoiceStatus.DRAFT,
  InvoiceStatus.ISSUED,
  InvoiceStatus.PAYMENT_REPORTED,
  InvoiceStatus.OVERDUE,
];

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
    const [usage, openRequests, relevantInvoice] = await Promise.all([
      this.usage.usageForSubscription(organizationId),
      this.prisma.activationRequest.findMany({
        where: {
          organizationId,
          status: { in: OPEN_REQUEST_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findFirst({
        where: {
          organizationId,
          status: { in: ACTIVE_INVOICE_STATUSES },
          type: InvoiceType.ACTIVATION,
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const hasOpenActivation = openRequests.some(
      (row) => row.requestType === CommercialRequestType.ACTIVATION,
    );
    const hasOpenRenewal = openRequests.some(
      (row) => row.requestType === CommercialRequestType.RENEWAL,
    );
    const hasOpenPlanChange = openRequests.some(
      (row) => row.requestType === CommercialRequestType.PLAN_CHANGE,
    );

    const canRequestActivationStatus =
      entitlement.effectiveStatus === 'TRIALING' ||
      entitlement.effectiveStatus === 'GRACE' ||
      entitlement.effectiveStatus === 'TRIAL_EXPIRED';
    const canRequestRenewalStatus =
      entitlement.effectiveStatus === 'ACTIVE' ||
      entitlement.effectiveStatus === 'PAID_GRACE' ||
      entitlement.effectiveStatus === 'EXPIRED';

    const activationProgress = this.resolveActivationProgress({
      effectiveStatus: entitlement.effectiveStatus,
      hasOpenActivation,
      canRequestActivation: canRequestActivationStatus && !hasOpenActivation,
      invoice: relevantInvoice,
    });

    return toSubscriptionDto(entitlement, {
      usage,
      openRequests: openRequests.map((row) => ({
        id: row.id,
        requestType: row.requestType,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
      supportEmail: this.salesEmail(),
      activationProgress,
      availableActions: {
        requestActivation:
          canRequestActivationStatus &&
          !hasOpenActivation &&
          activationProgress.state === 'can_request',
        requestRenewal: canRequestRenewalStatus && !hasOpenRenewal,
        requestPlanChange:
          entitlement.effectiveStatus !== 'SUSPENDED' &&
          entitlement.effectiveStatus !== 'CANCELLED' &&
          !hasOpenPlanChange,
        contactSupport: true,
      },
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

  private resolveActivationProgress(input: {
    effectiveStatus: string;
    hasOpenActivation: boolean;
    canRequestActivation: boolean;
    invoice: {
      id: string;
      status: InvoiceStatus;
      paymentUrl: string | null;
      type: InvoiceType;
      dueAt: Date | null;
    } | null;
  }): ActivationProgress {
    if (
      input.effectiveStatus === 'ACTIVE' ||
      input.effectiveStatus === 'PAID_GRACE'
    ) {
      return {
        state: 'active',
        label: 'Active',
        invoiceId: null,
        canPay: false,
        statusLabel: null,
      };
    }

    const invoice = input.invoice;
    if (invoice) {
      const status =
        invoice.status === InvoiceStatus.ISSUED &&
        invoice.dueAt &&
        invoice.dueAt.getTime() < Date.now()
          ? InvoiceStatus.OVERDUE
          : invoice.status;

      if (status === InvoiceStatus.PAYMENT_REPORTED) {
        return {
          state: 'awaiting_verification',
          label: 'Payment Awaiting Verification',
          invoiceId: invoice.id,
          canPay: false,
          statusLabel: invoiceStatusLabel(status),
        };
      }
      if (status === InvoiceStatus.ISSUED || status === InvoiceStatus.OVERDUE) {
        const canPay = canShowPayInvoice(status, invoice.paymentUrl);
        return {
          state: canPay ? 'pay_invoice' : 'view_invoice',
          label: canPay ? 'Pay Invoice' : 'View Invoice',
          invoiceId: invoice.id,
          canPay,
          statusLabel: invoiceStatusLabel(status),
        };
      }
      if (
        status === InvoiceStatus.PREPARING ||
        status === InvoiceStatus.DRAFT
      ) {
        return {
          state: 'invoice_preparing',
          label: 'Invoice Being Prepared',
          invoiceId: invoice.id,
          canPay: false,
          statusLabel: invoiceStatusLabel(status),
        };
      }
    }

    if (input.hasOpenActivation) {
      return {
        state: 'request_sent',
        label: 'Request Sent',
        invoiceId: null,
        canPay: false,
        statusLabel: null,
      };
    }

    if (input.canRequestActivation) {
      return {
        state: 'can_request',
        label: 'Request Activation',
        invoiceId: null,
        canPay: false,
        statusLabel: null,
      };
    }

    return {
      state: 'none',
      label: '',
      invoiceId: null,
      canPay: false,
      statusLabel: null,
    };
  }

  private async createRequest(
    organization: OrganizationContext,
    user: AuthUser,
    requestType: CommercialRequestType,
    message?: string,
  ) {
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
      const existing = await tx.activationRequest.findFirst({
        where: {
          organizationId: organization.organizationId,
          requestType,
          status: { in: OPEN_REQUEST_STATUSES },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        // Idempotent: never create a second open/contacted request.
        return { row: existing, created: false as const };
      }

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
      return { row: created, created: true as const };
    });

    if (request.created) {
      if (requestType === CommercialRequestType.RENEWAL) {
        await this.notifications.sendRenewalRequested({
          organizationId: organization.organizationId,
          organizationName: organizationRow.name,
          organizationSlug: organizationRow.slug,
          requesterName: user.fullName,
          requesterEmail: user.email,
          message: request.row.message,
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
          message: request.row.message,
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
          message: request.row.message,
          planName: entitlement.plan.name,
          effectiveStatus: entitlement.effectiveStatus,
        });
      }
    }

    return {
      id: request.row.id,
      organizationId: request.row.organizationId,
      requestType: request.row.requestType,
      status: request.row.status,
      message: request.row.message,
      createdAt: request.row.createdAt.toISOString(),
      alreadyOpen: !request.created,
    };
  }

  private salesEmail() {
    return (
      this.config.get('PLATFORM_SALES_EMAIL', { infer: true }) ??
      DEFAULT_SALES_EMAIL
    );
  }
}
