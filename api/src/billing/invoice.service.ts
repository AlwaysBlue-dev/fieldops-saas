import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AUDIT_INVOICE_CREATED,
  AUDIT_INVOICE_ISSUED,
  AUDIT_INVOICE_OVERDUE,
  AUDIT_INVOICE_PAID,
  AUDIT_INVOICE_PAYMENT_NOTICE,
  AUDIT_INVOICE_PAYMENT_NOT_FOUND,
  AUDIT_INVOICE_PAYMENT_REPORTED,
  AUDIT_INVOICE_PAYMENT_URL_SET,
  AUDIT_INVOICE_PAYMENT_VERIFIED,
  AUDIT_INVOICE_VOIDED,
  AUDIT_SUBSCRIPTION_ACTIVATED,
  AUDIT_SUBSCRIPTION_RENEWED,
  INVOICE_DUE_DAYS,
  TRIAL_PLAN_CODE,
} from '../common/constants.js';
import {
  InvoiceStatus,
  InvoiceType,
  MembershipStatus,
  OrganizationRole,
  PlanStatus,
  Prisma,
  SubscriptionStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { LegalService } from '../legal/legal.service.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, addUtcDays, type Clock } from '../subscription/clock.js';
import {
  resolveActivationPeriod,
  resolveRenewalPeriod,
} from '../subscription/period.js';
import { formatCentsUsd } from '../subscription/plan-catalog.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { BillingSettingsService } from './billing-settings.service.js';
import type { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import type { ListInvoicesQueryDto } from './dto/list-invoices-query.dto.js';
import type { PaymentNoticeDto } from './dto/payment-notice.dto.js';
import type { UpdateInvoicePaymentDto } from './dto/update-invoice-payment.dto.js';
import { nextInvoiceNumber } from './invoice-number.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { assertHttpsPaymentUrl, invoiceStatusLabel } from './invoice-status.js';
import { serializeInvoice } from './invoice.presenter.js';

const PAYABLE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.PAYMENT_REPORTED,
  InvoiceStatus.OVERDUE,
];

const PREPARABLE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.PREPARING,
];

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly legal: LegalService,
    private readonly settings: BillingSettingsService,
    private readonly pdf: InvoicePdfService,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(actorUserId: string, dto: CreateInvoiceDto) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: dto.organizationId },
      include: { subscription: true },
    });
    if (!organization) {
      throw new NotFoundException();
    }
    const plan = await this.resolvePlan(dto.planId, dto.planCode ?? TRIAL_PLAN_CODE);
    const now = this.clock.now();
    const amountCents = dto.amountCents ?? plan.annualPriceCents ?? 0;
    const subscription = organization.subscription;

    let period: { currentPeriodStart: Date; currentPeriodEnd: Date };
    if (dto.type === InvoiceType.RENEWAL && subscription) {
      period = resolveRenewalPeriod(
        now,
        subscription.currentPeriodEnd,
        subscription.currentPeriodStart,
        dto.billingPeriodStart,
        dto.billingPeriodEnd,
      );
    } else {
      period = resolveActivationPeriod(
        now,
        dto.billingPeriodStart,
        dto.billingPeriodEnd,
      );
    }

    const dueAt = dto.dueAt
      ? new Date(dto.dueAt)
      : addUtcDays(now, INVOICE_DUE_DAYS);

    const owner = await this.resolveOrganizationOwner(organization.id);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, now);
      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          organizationId: organization.id,
          subscriptionId: subscription?.id ?? null,
          planId: plan.id,
          type: dto.type,
          status: InvoiceStatus.PREPARING,
          currency: dto.currency ?? plan.currency ?? 'USD',
          subtotalCents: amountCents,
          totalCents: amountCents,
          billingPeriodStart: period.currentPeriodStart,
          billingPeriodEnd: period.currentPeriodEnd,
          issuedAt: null,
          dueAt,
          createdByPlatformUserId: actorUserId,
          customerName:
            dto.customerName?.trim() || owner?.fullName || organization.name,
          customerBillingEmail:
            dto.customerBillingEmail?.trim() ||
            owner?.email ||
            organization.email,
          internalNotes: dto.internalNotes?.trim() || null,
        },
        include: this.include(),
      });
      await this.audit.record(
        {
          action: AUDIT_INVOICE_CREATED,
          entityType: 'Invoice',
          entityId: created.id,
          organizationId: organization.id,
          actorUserId,
          newValues: {
            invoiceNumber: created.invoiceNumber,
            type: created.type,
            totalCents: created.totalCents,
            status: InvoiceStatus.PREPARING,
          },
        },
        tx,
      );
      return created;
    });

    return this.present(invoice, { includeInstructions: false, includeInternal: true });
  }

  async updatePaymentDetails(
    invoiceId: string,
    actorUserId: string,
    dto: UpdateInvoicePaymentDto,
  ) {
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('Paid or void invoices cannot be edited');
    }

    const data: Prisma.InvoiceUpdateInput = {};
    if (dto.paymentUrl !== undefined) {
      try {
        data.paymentUrl = assertHttpsPaymentUrl(dto.paymentUrl);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Invalid payment URL',
        );
      }
    }
    if (dto.externalReference !== undefined) {
      data.externalReference = dto.externalReference.trim() || null;
    }
    if (dto.dueAt !== undefined) {
      data.dueAt = new Date(dto.dueAt);
    }
    if (
      dto.customerName !== undefined ||
      dto.customerBillingEmail !== undefined
    ) {
      if (!PREPARABLE_STATUSES.includes(invoice.status)) {
        throw new BadRequestException(
          'Billing contact can only be edited before the invoice is issued',
        );
      }
      if (dto.customerName !== undefined) {
        const name = dto.customerName.trim();
        if (!name) {
          throw new BadRequestException('Billing contact name is required');
        }
        data.customerName = name;
      }
      if (dto.customerBillingEmail !== undefined) {
        const email = dto.customerBillingEmail.trim();
        if (!email) {
          throw new BadRequestException('Billing contact email is required');
        }
        data.customerBillingEmail = email;
      }
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No payment fields to update');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.invoice.update({
        where: { id: invoice.id },
        data,
        include: this.include(),
      });
      await this.audit.record(
        {
          action: AUDIT_INVOICE_PAYMENT_URL_SET,
          entityType: 'Invoice',
          entityId: row.id,
          organizationId: row.organizationId,
          actorUserId,
          oldValues: {
            hasPaymentUrl: Boolean(invoice.paymentUrl),
            dueAt: invoice.dueAt?.toISOString() ?? null,
          },
          newValues: {
            hasPaymentUrl: Boolean(row.paymentUrl),
            dueAt: row.dueAt?.toISOString() ?? null,
            externalReferenceSet: Boolean(row.externalReference),
          },
        },
        tx,
      );
      return row;
    });

    return this.present(updated, { includeInstructions: true, includeInternal: true });
  }

  async issue(invoiceId: string, actorUserId: string) {
    const invoice = await this.requireInvoice(invoiceId);
    if (
      !PREPARABLE_STATUSES.includes(invoice.status) &&
      invoice.status !== InvoiceStatus.ISSUED
    ) {
      throw new BadRequestException(
        'Only preparing invoices can be issued',
      );
    }
    if (!invoice.paymentUrl) {
      throw new BadRequestException(
        'Add a secure payment URL before issuing the invoice',
      );
    }
    try {
      assertHttpsPaymentUrl(invoice.paymentUrl);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid payment URL',
      );
    }

    if (invoice.status === InvoiceStatus.ISSUED) {
      return this.present(invoice, { includeInstructions: true, includeInternal: true });
    }

    const now = this.clock.now();
    const instructions = await this.customerPaymentInstructions();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.ISSUED,
          issuedAt: invoice.issuedAt ?? now,
          paymentInstructionsSnapshot: instructions,
        },
        include: this.include(),
      });
      await this.audit.record(
        {
          action: AUDIT_INVOICE_ISSUED,
          entityType: 'Invoice',
          entityId: row.id,
          organizationId: row.organizationId,
          actorUserId,
          oldValues: { status: invoice.status },
          newValues: { status: InvoiceStatus.ISSUED },
        },
        tx,
      );
      return row;
    });

    const appUrl = this.billingLink(updated.organization.slug);
    const amount = `${formatCentsUsd(updated.totalCents)} ${updated.currency}`;
    await this.mail.sendText({
      to: updated.customerBillingEmail,
      subject: 'Your FieldKeel invoice is ready',
      text: [
        `Invoice ${updated.invoiceNumber} is ready.`,
        '',
        `Plan: ${updated.plan.name}`,
        `Amount: ${amount}`,
        `Due: ${updated.dueAt?.toISOString().slice(0, 10) ?? '—'}`,
        '',
        'Sign in to Billing and select Pay Invoice to open the secure payment page.',
        appUrl,
        '',
        'FieldKeel subscriptions are business services. Please complete payment using an eligible business/commercial payment method available on the secure payment page.',
        '',
        'Use only the payment link shown in your authenticated FieldKeel Billing area or provided through an official FieldKeel communication.',
        'FieldKeel will never ask for your password, authentication code, full card number, or CVV through support messages.',
      ].join('\n'),
    });

    await this.notifyOwners(updated.organizationId, {
      type: 'INVOICE_READY',
      title: 'Invoice ready',
      message: `Invoice ${updated.invoiceNumber} is ready in Billing.`,
      organizationSlug: updated.organization.slug,
    });

    return this.present(updated, { includeInstructions: true, includeInternal: true });
  }

  /** @deprecated Prefer markPaidAndActivate / markPaidAndRenew — kept for compatibility. */
  async markPaid(invoiceId: string, actorUserId: string) {
    return this.markPaidOnly(invoiceId, actorUserId);
  }

  async markPaidAndActivate(invoiceId: string, actorUserId: string) {
    return this.confirmPaidAndApply(invoiceId, actorUserId, 'activate');
  }

  async markPaidAndRenew(invoiceId: string, actorUserId: string) {
    return this.confirmPaidAndApply(invoiceId, actorUserId, 'renew');
  }

  /** Legacy two-step activate after mark-paid. Prefer markPaidAndActivate/Renew. */
  async activateFromInvoice(invoiceId: string, actorUserId: string) {
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status !== InvoiceStatus.PAID) {
      throw new BadRequestException('Confirm payment before activating or renewing');
    }
    const mode =
      invoice.type === InvoiceType.RENEWAL || Boolean(
        (
          await this.prisma.subscription.findFirst({
            where: { organizationId: invoice.organizationId },
            select: { activatedAt: true },
          })
        )?.activatedAt,
      )
        ? 'renew'
        : 'activate';
    return this.confirmPaidAndApply(invoiceId, actorUserId, mode);
  }

  async markOverdue(invoiceId: string, actorUserId: string) {
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.PAYMENT_REPORTED) {
      throw new BadRequestException('Only issued invoices can be marked overdue');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.OVERDUE },
        include: this.include(),
      });
      await this.audit.record(
        {
          action: AUDIT_INVOICE_OVERDUE,
          entityType: 'Invoice',
          entityId: row.id,
          organizationId: row.organizationId,
          actorUserId,
          oldValues: { status: invoice.status },
          newValues: { status: InvoiceStatus.OVERDUE },
        },
        tx,
      );
      return row;
    });
    return this.present(updated, { includeInstructions: true, includeInternal: true });
  }

  /**
   * PAYMENT_REPORTED → ISSUED when external payment cannot be verified.
   * Preserves paymentReportedAt and payment notices for history.
   * Does not activate, renew, set paidAt, or change billing period.
   */
  async markPaymentNotFound(invoiceId: string, actorUserId: string) {
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status !== InvoiceStatus.PAYMENT_REPORTED) {
      if (invoice.status === InvoiceStatus.ISSUED) {
        return this.present(invoice, {
          includeInstructions: true,
          includeInternal: true,
        });
      }
      throw new BadRequestException(
        'Only payment-reported invoices can be returned to Payment Due',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          status: InvoiceStatus.PAYMENT_REPORTED,
        },
        data: {
          status: InvoiceStatus.ISSUED,
          // Keep paymentReportedAt for history; never set paid/verified fields.
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          'Invoice is no longer awaiting payment verification',
        );
      }
      const row = await tx.invoice.findFirstOrThrow({
        where: { id: invoice.id },
        include: this.include(),
      });
      await this.audit.record(
        {
          action: AUDIT_INVOICE_PAYMENT_NOT_FOUND,
          entityType: 'Invoice',
          entityId: row.id,
          organizationId: row.organizationId,
          actorUserId,
          oldValues: { status: InvoiceStatus.PAYMENT_REPORTED },
          newValues: {
            status: InvoiceStatus.ISSUED,
            paymentReportedAt:
              invoice.paymentReportedAt?.toISOString() ?? null,
          },
        },
        tx,
      );
      return row;
    });

    const billingUrl = this.billingLink(updated.organization.slug);
    await this.mail.sendText({
      to: updated.customerBillingEmail,
      subject: 'Payment could not be confirmed',
      text: [
        `We could not confirm payment for invoice ${updated.invoiceNumber}.`,
        'The invoice has been returned to Payment Due.',
        'Please review the payment details and try again.',
        '',
        billingUrl,
      ].join('\n'),
    });

    await this.notifyOwners(updated.organizationId, {
      type: 'INVOICE_PAYMENT_NOT_FOUND',
      title: 'Payment could not be confirmed',
      message: `Payment for invoice ${updated.invoiceNumber} could not be confirmed. The invoice is back to Payment Due.`,
      organizationSlug: updated.organization.slug,
    });

    return this.present(updated, {
      includeInstructions: true,
      includeInternal: true,
    });
  }

  async void(invoiceId: string, actorUserId: string) {
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('A paid invoice cannot be voided');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.VOID },
        include: this.include(),
      });
      await this.audit.record(
        {
          action: AUDIT_INVOICE_VOIDED,
          entityType: 'Invoice',
          entityId: row.id,
          organizationId: row.organizationId,
          actorUserId,
          oldValues: { status: invoice.status },
          newValues: { status: InvoiceStatus.VOID },
        },
        tx,
      );
      return row;
    });
    await this.mail.sendText({
      to: updated.customerBillingEmail,
      subject: `Invoice ${updated.invoiceNumber} was voided`,
      text: `Invoice ${updated.invoiceNumber} for ${updated.organization.name} was voided and should not be paid.`,
    });
    return this.present(updated, { includeInstructions: false, includeInternal: true });
  }

  async listPlatform(query: ListInvoicesQueryDto = {}) {
    return this.listInvoices(query, { includeInternal: true });
  }

  async getPlatform(invoiceId: string) {
    return this.present(await this.requireInvoice(invoiceId), {
      includeInstructions: true,
      includeInternal: true,
    });
  }

  async listForOrganization(organizationId: string, query: ListInvoicesQueryDto = {}) {
    return this.listInvoices(
      { ...query, organizationId },
      { includeInternal: false },
    );
  }

  async getForOrganization(organizationId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: this.include(),
    });
    if (!invoice) {
      throw new NotFoundException();
    }
    return this.present(invoice, {
      includeInstructions: this.canShowInstructions(invoice.status),
      includeInternal: false,
    });
  }

  async pdfForOrganization(organizationId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: this.include(),
    });
    if (!invoice) {
      throw new NotFoundException();
    }
    return this.renderPdf(invoice, this.canShowInstructions(invoice.status));
  }

  async pdfPlatform(invoiceId: string) {
    const invoice = await this.requireInvoice(invoiceId);
    return this.renderPdf(invoice, true);
  }

  async submitPaymentNotice(
    organization: OrganizationContext,
    user: AuthUser,
    invoiceId: string,
    dto: PaymentNoticeDto,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId: organization.organizationId },
      include: this.include(),
    });
    if (!invoice) {
      throw new NotFoundException();
    }
    if (
      invoice.status !== InvoiceStatus.ISSUED &&
      invoice.status !== InvoiceStatus.OVERDUE
    ) {
      if (invoice.status === InvoiceStatus.PAYMENT_REPORTED) {
        return {
          id: invoice.id,
          invoiceId: invoice.id,
          createdAt: invoice.paymentReportedAt?.toISOString() ?? invoice.updatedAt.toISOString(),
          status: invoice.status,
          statusLabel: invoiceStatusLabel(invoice.status),
          alreadyReported: true,
        };
      }
      throw new ForbiddenException(
        'Payment can only be reported for an issued invoice',
      );
    }

    const now = this.clock.now();
    const notice = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          organizationId: organization.organizationId,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
        },
        data: {
          status: InvoiceStatus.PAYMENT_REPORTED,
          paymentReportedAt: now,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Payment was already reported for this invoice');
      }
      const created = await tx.invoicePaymentNotice.create({
        data: {
          invoiceId: invoice.id,
          organizationId: organization.organizationId,
          submittedByUserId: user.id,
          reference: dto.reference?.trim() || null,
          message: dto.message?.trim() || null,
        },
      });
      await this.audit.record(
        {
          action: AUDIT_INVOICE_PAYMENT_REPORTED,
          entityType: 'Invoice',
          entityId: invoice.id,
          organizationId: organization.organizationId,
          actorUserId: user.id,
          oldValues: { status: invoice.status },
          newValues: {
            status: InvoiceStatus.PAYMENT_REPORTED,
            noticeId: created.id,
          },
        },
        tx,
      );
      await this.audit.record(
        {
          action: AUDIT_INVOICE_PAYMENT_NOTICE,
          entityType: 'InvoicePaymentNotice',
          entityId: created.id,
          organizationId: organization.organizationId,
          actorUserId: user.id,
          newValues: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            reference: created.reference,
          },
        },
        tx,
      );
      return created;
    });

    await this.mail.sendText({
      to: this.legal.salesEmail(),
      subject: `${organization.name} reported payment for ${invoice.invoiceNumber}`,
      text: [
        `${organization.name} reported payment for ${invoice.invoiceNumber}.`,
        `Reported by: ${user.fullName} <${user.email}>`,
        `Amount: ${formatCentsUsd(invoice.totalCents)} ${invoice.currency}`,
        '',
        'This does not mark the invoice paid or activate the subscription.',
        'Verify payment externally, then use Mark Paid & Activate or Mark Paid & Renew.',
        dto.reference ? `Customer reference: ${dto.reference}` : '',
        dto.message ? `Message: ${dto.message}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    await this.mail.sendText({
      to: invoice.customerBillingEmail,
      subject: "We've received your payment notification",
      text: [
        `We've received your payment notification for invoice ${invoice.invoiceNumber}.`,
        '',
        'Your payment is awaiting verification.',
        "We'll update your subscription after payment has been confirmed.",
        '',
        this.billingLink(organization.slug),
      ].join('\n'),
    });

    return {
      id: notice.id,
      invoiceId: invoice.id,
      createdAt: notice.createdAt.toISOString(),
      status: InvoiceStatus.PAYMENT_REPORTED,
      statusLabel: invoiceStatusLabel(InvoiceStatus.PAYMENT_REPORTED),
      alreadyReported: false,
    };
  }

  private async confirmPaidAndApply(
    invoiceId: string,
    actorUserId: string,
    mode: 'activate' | 'renew',
  ) {
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('A void invoice cannot be marked paid');
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: { organizationId: invoice.organizationId },
    });
    if (!subscription) {
      throw new NotFoundException();
    }

    const now = this.clock.now();
    const isRenewal =
      mode === 'renew' ||
      invoice.type === InvoiceType.RENEWAL ||
      Boolean(subscription.activatedAt);

    const period = isRenewal
      ? resolveRenewalPeriod(
          now,
          subscription.currentPeriodEnd,
          subscription.currentPeriodStart,
          invoice.billingPeriodStart.toISOString(),
          invoice.billingPeriodEnd.toISOString(),
        )
      : {
          currentPeriodStart: invoice.billingPeriodStart,
          currentPeriodEnd: invoice.billingPeriodEnd,
        };

    const alreadyPaid = invoice.status === InvoiceStatus.PAID;
    if (alreadyPaid) {
      const alreadyApplied =
        subscription.status === SubscriptionStatus.ACTIVE &&
        subscription.planId === invoice.planId &&
        subscription.currentPeriodEnd &&
        subscription.currentPeriodEnd.getTime() >= period.currentPeriodEnd.getTime();
      if (alreadyApplied) {
        return this.present(invoice, {
          includeInstructions: true,
          includeInternal: true,
        });
      }
    } else if (!PAYABLE_STATUSES.includes(invoice.status)) {
      throw new BadRequestException(
        'Only issued, payment-reported, or overdue invoices can be confirmed',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (!alreadyPaid) {
        const claimed = await tx.invoice.updateMany({
          where: {
            id: invoice.id,
            status: { in: PAYABLE_STATUSES },
          },
          data: {
            status: InvoiceStatus.PAID,
            paidAt: now,
            paymentVerifiedAt: now,
            verifiedByUserId: actorUserId,
          },
        });
        if (claimed.count === 0) {
          const current = await tx.invoice.findFirst({ where: { id: invoice.id } });
          if (current?.status !== InvoiceStatus.PAID) {
            throw new ConflictException('Invoice payment could not be confirmed');
          }
        } else {
          await this.audit.record(
            {
              action: AUDIT_INVOICE_PAYMENT_VERIFIED,
              entityType: 'Invoice',
              entityId: invoice.id,
              organizationId: invoice.organizationId,
              actorUserId,
              oldValues: { status: invoice.status },
              newValues: {
                status: InvoiceStatus.PAID,
                paymentVerifiedAt: now.toISOString(),
              },
            },
            tx,
          );
          await this.audit.record(
            {
              action: AUDIT_INVOICE_PAID,
              entityType: 'Invoice',
              entityId: invoice.id,
              organizationId: invoice.organizationId,
              actorUserId,
              oldValues: { status: invoice.status },
              newValues: { status: InvoiceStatus.PAID, paidAt: now.toISOString() },
            },
            tx,
          );
        }
      }

      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          planId: invoice.planId,
          currentPeriodStart: period.currentPeriodStart,
          currentPeriodEnd: period.currentPeriodEnd,
          activatedAt: subscription.activatedAt ?? now,
          activatedByUserId: actorUserId,
          cancelAtPeriodEnd: false,
          trialEndsAt: null,
          graceEndsAt: null,
        },
      });

      await this.audit.record(
        {
          action: isRenewal ? AUDIT_SUBSCRIPTION_RENEWED : AUDIT_SUBSCRIPTION_ACTIVATED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId: invoice.organizationId,
          actorUserId,
          oldValues: {
            status: subscription.status,
            planId: subscription.planId,
            currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          },
          newValues: {
            status: SubscriptionStatus.ACTIVE,
            planId: invoice.planId,
            invoiceId: invoice.id,
            currentPeriodStart: period.currentPeriodStart.toISOString(),
            currentPeriodEnd: period.currentPeriodEnd.toISOString(),
          },
        },
        tx,
      );
    });

    const refreshed = await this.requireInvoice(invoiceId);
    const through = period.currentPeriodEnd.toISOString().slice(0, 10);
    await this.mail.sendText({
      to: refreshed.customerBillingEmail,
      subject: isRenewal
        ? 'Your FieldKeel subscription was renewed'
        : 'Your FieldKeel subscription is active',
      text: [
        `Payment for invoice ${refreshed.invoiceNumber} has been confirmed.`,
        '',
        `${refreshed.plan.name}`,
        `Active through ${through}`,
        '',
        this.billingLink(refreshed.organization.slug),
      ].join('\n'),
    });

    await this.notifyOwners(refreshed.organizationId, {
      type: isRenewal ? 'SUBSCRIPTION_RENEWED' : 'SUBSCRIPTION_ACTIVATED',
      title: isRenewal ? 'Subscription renewed' : 'Subscription activated',
      message: `${refreshed.plan.name} is active through ${through}.`,
      organizationSlug: refreshed.organization.slug,
    });

    return this.present(refreshed, {
      includeInstructions: true,
      includeInternal: true,
    });
  }

  private async markPaidOnly(invoiceId: string, actorUserId: string) {
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('A void invoice cannot be marked paid');
    }
    if (invoice.status === InvoiceStatus.PAID) {
      return this.present(invoice, { includeInstructions: true, includeInternal: true });
    }
    if (!PAYABLE_STATUSES.includes(invoice.status)) {
      throw new BadRequestException(
        'Only issued, payment-reported, or overdue invoices can be marked paid',
      );
    }
    const now = this.clock.now();
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, status: { in: PAYABLE_STATUSES } },
        data: {
          status: InvoiceStatus.PAID,
          paidAt: now,
          paymentVerifiedAt: now,
          verifiedByUserId: actorUserId,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Invoice was already processed');
      }
      const row = await tx.invoice.findFirstOrThrow({
        where: { id: invoice.id },
        include: this.include(),
      });
      await this.audit.record(
        {
          action: AUDIT_INVOICE_PAYMENT_VERIFIED,
          entityType: 'Invoice',
          entityId: row.id,
          organizationId: row.organizationId,
          actorUserId,
          oldValues: { status: invoice.status },
          newValues: { status: InvoiceStatus.PAID },
        },
        tx,
      );
      await this.audit.record(
        {
          action: AUDIT_INVOICE_PAID,
          entityType: 'Invoice',
          entityId: row.id,
          organizationId: row.organizationId,
          actorUserId,
          oldValues: { status: invoice.status },
          newValues: { status: InvoiceStatus.PAID },
        },
        tx,
      );
      return row;
    });

    await this.mail.sendText({
      to: updated.customerBillingEmail,
      subject: `Payment confirmed for invoice ${updated.invoiceNumber}`,
      text: [
        `Payment for invoice ${updated.invoiceNumber} has been confirmed.`,
        'Your subscription will be updated once activation or renewal is completed.',
      ].join('\n'),
    });

    return this.present(updated, { includeInstructions: true, includeInternal: true });
  }

  private async listInvoices(
    query: ListInvoicesQueryDto,
    options: { includeInternal: boolean },
  ) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.InvoiceWhereInput = {};
    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }
    if (query.status) {
      where.status = query.status as InvoiceStatus;
    }
    if (query.invoiceType) {
      where.type = query.invoiceType as InvoiceType;
    }
    if (query.planId) {
      where.planId = query.planId;
    }
    if (query.planCode) {
      where.plan = { code: query.planCode };
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerBillingEmail: { contains: q, mode: 'insensitive' } },
        { organization: { name: { contains: q, mode: 'insensitive' } } },
        {
          organization: {
            members: {
              some: {
                role: OrganizationRole.OWNER,
                status: MembershipStatus.ACTIVE,
                user: {
                  OR: [
                    { fullName: { contains: q, mode: 'insensitive' } },
                    { email: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        },
      ];
      if (options.includeInternal) {
        where.OR.push({
          externalReference: { contains: q, mode: 'insensitive' },
        });
      }
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: this.include(),
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) =>
        this.present(row, {
          includeInstructions: options.includeInternal
            ? true
            : this.canShowInstructions(row.status),
          includeInternal: options.includeInternal,
        }),
      ),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private async renderPdf(
    invoice: Awaited<ReturnType<InvoiceService['requireInvoice']>>,
    includeInstructions: boolean,
  ) {
    const buffer = await this.pdf.render({
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      status: invoiceStatusLabel(invoice.status),
      currency: invoice.currency,
      subtotalCents: invoice.subtotalCents,
      totalCents: invoice.totalCents,
      customerName: invoice.customerName,
      customerBillingEmail: invoice.customerBillingEmail,
      organizationName: invoice.organization.name,
      planName: invoice.plan.name,
      billingPeriodStart: invoice.billingPeriodStart,
      billingPeriodEnd: invoice.billingPeriodEnd,
      type: invoice.type,
      paymentInstructions: includeInstructions
        ? invoice.paymentInstructionsSnapshot
        : null,
      supportEmail: this.legal.supportEmail(),
    });
    return {
      buffer,
      filename: `${invoice.invoiceNumber}.pdf`,
    };
  }

  private present(
    invoice: Awaited<ReturnType<InvoiceService['requireInvoice']>>,
    options: { includeInstructions: boolean; includeInternal: boolean },
  ) {
    return serializeInvoice(invoice, { now: this.clock.now(), ...options });
  }

  @Cron('20 6 * * *', { name: 'invoice-overdue', timeZone: 'UTC' })
  async reconcileOverdue() {
    const now = this.clock.now();
    const due = await this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.ISSUED,
        dueAt: { lt: now },
      },
      include: this.include(),
    });
    let marked = 0;
    for (const invoice of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: InvoiceStatus.OVERDUE },
          });
          await this.audit.record(
            {
              action: AUDIT_INVOICE_OVERDUE,
              entityType: 'Invoice',
              entityId: invoice.id,
              organizationId: invoice.organizationId,
              newValues: { status: InvoiceStatus.OVERDUE },
            },
            tx,
          );
        });
        await this.mail.sendText({
          to: invoice.customerBillingEmail,
          subject: `Invoice ${invoice.invoiceNumber} is overdue`,
          text: [
            `Invoice ${invoice.invoiceNumber} for ${invoice.organization.name} is past due.`,
            `Amount: ${formatCentsUsd(invoice.totalCents)} ${invoice.currency}`,
            '',
            'Sign in to Billing to pay your invoice.',
            this.billingLink(invoice.organization.slug),
          ].join('\n'),
        });
        marked += 1;
      } catch (error) {
        this.logger.error(
          `Failed to mark invoice ${invoice.invoiceNumber} overdue`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return { scanned: due.length, marked };
  }

  private canShowInstructions(status: InvoiceStatus) {
    return (
      status === InvoiceStatus.ISSUED ||
      status === InvoiceStatus.PAYMENT_REPORTED ||
      status === InvoiceStatus.OVERDUE ||
      status === InvoiceStatus.PAID
    );
  }

  private async customerPaymentInstructions() {
    const configured = await this.settings.instructionsText();
    const b2b =
      'FieldKeel subscriptions are business services. Please complete payment using an eligible business/commercial payment method available on the secure payment page.';
    const trust =
      'Use only the payment link shown in your authenticated FieldKeel Billing area or provided through an official FieldKeel communication. FieldKeel will never ask for your password, authentication code, full card number, or CVV through support messages.';
    if (!configured?.trim()) {
      return [b2b, '', trust].join('\n');
    }
    return [configured.trim(), '', b2b, '', trust].join('\n');
  }

  private include() {
    return {
      plan: { select: { id: true, code: true, name: true } },
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          email: true,
          members: {
            where: {
              role: OrganizationRole.OWNER,
              status: MembershipStatus.ACTIVE,
            },
            take: 1,
            orderBy: { joinedAt: 'asc' as const },
            select: {
              user: {
                select: { id: true, fullName: true, email: true },
              },
            },
          },
        },
      },
      paymentNotices: {
        include: { submittedBy: { select: { fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' as const },
      },
    };
  }

  private async resolveOrganizationOwner(organizationId: string) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        role: OrganizationRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
      orderBy: { joinedAt: 'asc' },
      select: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });
    return membership?.user ?? null;
  }

  private async requireInvoice(invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId },
      include: this.include(),
    });
    if (!invoice) {
      throw new NotFoundException();
    }
    return invoice;
  }

  private async resolvePlan(planId?: string, planCode?: string) {
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

  private billingLink(orgSlug: string) {
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
    return `${webUrl}/app/${orgSlug}/settings/billing`;
  }

  private async notifyOwners(
    organizationId: string,
    input: {
      type: string;
      title: string;
      message: string;
      organizationSlug: string;
    },
  ) {
    const owners = await this.prisma.organizationMember.findMany({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
        role: OrganizationRole.OWNER,
      },
      select: { userId: true },
    });
    if (owners.length === 0) return;
    await this.notifications.notify({
      organizationId,
      recipientUserIds: owners.map((row) => row.userId),
      type: input.type,
      title: input.title,
      message: input.message,
      relatedEntityType: 'Organization',
      relatedEntityId: organizationId,
      payload: { organizationSlug: input.organizationSlug },
      dedupeUnread: true,
    });
  }
}
