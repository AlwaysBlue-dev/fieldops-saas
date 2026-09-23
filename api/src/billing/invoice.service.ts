import {
  BadRequestException,
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
  AUDIT_INVOICE_VOIDED,
  AUDIT_SUBSCRIPTION_ACTIVATED,
  AUDIT_SUBSCRIPTION_RENEWED,
  INVOICE_DUE_DAYS,
  TRIAL_PLAN_CODE,
} from '../common/constants.js';
import {
  InvoiceStatus,
  InvoiceType,
  PlanStatus,
  SubscriptionStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { LegalService } from '../legal/legal.service.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CLOCK, addUtcDays, type Clock } from '../subscription/clock.js';
import {
  resolveActivationPeriod,
  resolveRenewalPeriod,
} from '../subscription/period.js';
import type { AuthUser, OrganizationContext } from '../tenancy/request-context.js';
import { BillingSettingsService } from './billing-settings.service.js';
import type { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import type { PaymentNoticeDto } from './dto/payment-notice.dto.js';
import { nextInvoiceNumber } from './invoice-number.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import { serializeInvoice } from './invoice.presenter.js';

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
    const { currentPeriodStart, currentPeriodEnd } = resolveActivationPeriod(
      now,
      dto.billingPeriodStart,
      dto.billingPeriodEnd,
    );
    const issuedAt = dto.issuedAt ? new Date(dto.issuedAt) : now;
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : addUtcDays(issuedAt, INVOICE_DUE_DAYS);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, now);
      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          organizationId: organization.id,
          subscriptionId: organization.subscription?.id ?? null,
          planId: plan.id,
          type: dto.type,
          status: InvoiceStatus.DRAFT,
          currency: dto.currency ?? plan.currency ?? 'USD',
          subtotalCents: amountCents,
          totalCents: amountCents,
          billingPeriodStart: currentPeriodStart,
          billingPeriodEnd: currentPeriodEnd,
          issuedAt,
          dueAt,
          createdByPlatformUserId: actorUserId,
          customerName: dto.customerName?.trim() || organization.name,
          customerBillingEmail: dto.customerBillingEmail?.trim() || organization.email,
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
          },
        },
        tx,
      );
      return created;
    });

    return this.present(invoice, { includeInstructions: false, includeInternal: true });
  }

  async issue(invoiceId: string, actorUserId: string) {
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status !== InvoiceStatus.DRAFT && invoice.status !== InvoiceStatus.ISSUED) {
      throw new BadRequestException('Only draft invoices can be issued');
    }
    const now = this.clock.now();
    const instructions = await this.settings.instructionsText();
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
    await this.mail.sendText({
      to: updated.customerBillingEmail,
      subject: `Invoice ${updated.invoiceNumber} is ready`,
      text: [
        `Invoice ${updated.invoiceNumber} has been issued for ${updated.organization.name}.`,
        `Amount: ${updated.totalCents / 100} ${updated.currency}`,
        `Due: ${updated.dueAt?.toISOString().slice(0, 10) ?? '—'}`,
        '',
        'Sign in to your FieldOps Cloud account to view verified payment instructions.',
        appUrl,
        '',
        'FieldOps Cloud will never ask you to provide your password, full card number, CVV, or authentication credentials by email, support message, or chat.',
      ].join('\n'),
    });

    return this.present(updated, { includeInstructions: true, includeInternal: true });
  }

  async markPaid(invoiceId: string, actorUserId: string) {
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('A void invoice cannot be marked paid');
    }
    if (invoice.status === InvoiceStatus.PAID) {
      return this.present(invoice, { includeInstructions: true, includeInternal: true });
    }
    const now = this.clock.now();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.PAID, paidAt: now },
        include: this.include(),
      });
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
        'Subscription access is updated only after FieldOps completes the separate activation or renewal step.',
      ].join('\n'),
    });

    return this.present(updated, { includeInstructions: true, includeInternal: true });
  }

  async activateFromInvoice(invoiceId: string, actorUserId: string) {
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status !== InvoiceStatus.PAID) {
      throw new BadRequestException('Confirm payment before activating or renewing');
    }
    const now = this.clock.now();
    const subscription = await this.prisma.subscription.findFirst({
      where: { organizationId: invoice.organizationId },
    });
    if (!subscription) {
      throw new NotFoundException();
    }

    const isRenewal =
      invoice.type === InvoiceType.RENEWAL || Boolean(subscription.activatedAt);
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

    await this.prisma.$transaction(async (tx) => {
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
        },
      });
      await this.audit.record(
        {
          action: isRenewal ? AUDIT_SUBSCRIPTION_RENEWED : AUDIT_SUBSCRIPTION_ACTIVATED,
          entityType: 'Subscription',
          entityId: subscription.id,
          organizationId: invoice.organizationId,
          actorUserId,
          oldValues: { status: subscription.status, planId: subscription.planId },
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

    await this.mail.sendText({
      to: invoice.customerBillingEmail,
      subject: isRenewal
        ? 'Your FieldOps Cloud subscription was renewed'
        : 'Your FieldOps Cloud subscription is active',
      text: [
        `The ${invoice.plan.name} subscription for ${invoice.organization.name} is now ${isRenewal ? 'renewed' : 'active'}.`,
        `Current period ends ${period.currentPeriodEnd.toISOString().slice(0, 10)}.`,
      ].join('\n'),
    });

    return this.present(await this.requireInvoice(invoiceId), {
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

  async listPlatform() {
    const rows = await this.prisma.invoice.findMany({
      include: this.include(),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) =>
      this.present(row, { includeInstructions: true, includeInternal: true }),
    );
  }

  async getPlatform(invoiceId: string) {
    return this.present(await this.requireInvoice(invoiceId), {
      includeInstructions: true,
      includeInternal: true,
    });
  }

  async listForOrganization(organizationId: string) {
    const rows = await this.prisma.invoice.findMany({
      where: { organizationId },
      include: this.include(),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) =>
      this.present(row, {
        includeInstructions: this.canShowInstructions(row.status),
        includeInternal: false,
      }),
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
      throw new ForbiddenException('Payment can only be reported for an issued invoice');
    }

    const notice = await this.prisma.$transaction(async (tx) => {
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
      subject: `Payment reported for ${invoice.invoiceNumber}`,
      text: [
        `${user.fullName} reported payment for invoice ${invoice.invoiceNumber} (${organization.name}).`,
        `This does not mark the invoice paid or activate the subscription.`,
        dto.reference ? `Reference: ${dto.reference}` : '',
        dto.message ? `Message: ${dto.message}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    return {
      id: notice.id,
      invoiceId: invoice.id,
      createdAt: notice.createdAt.toISOString(),
      status: invoice.status,
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
      status: invoice.status,
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
            `Amount: ${invoice.totalCents / 100} ${invoice.currency}`,
            '',
            'Sign in to your FieldOps Cloud account to view verified payment instructions.',
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
      status === InvoiceStatus.OVERDUE ||
      status === InvoiceStatus.PAID
    );
  }

  private include() {
    return {
      plan: { select: { id: true, code: true, name: true } },
      organization: { select: { id: true, name: true, slug: true, email: true } },
      paymentNotices: {
        include: { submittedBy: { select: { fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' as const },
      },
    };
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
}
