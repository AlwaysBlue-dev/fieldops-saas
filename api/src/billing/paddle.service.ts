import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Environment, Paddle } from '@paddle/paddle-node-sdk';
import {
  InvoiceStatus,
  Prisma,
  SubscriptionStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { EnvironmentVariables } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubscriptionNotificationService } from '../subscription/subscription-notification.service.js';
import { InvoiceService } from './invoice.service.js';

type PaddleConfig = {
  apiKey: string;
  clientToken: string;
  webhookSecret: string;
  starterPriceId: string;
  professionalPriceId: string;
};
type PaddleRecord = Record<string, unknown>;

@Injectable()
export class PaddleService {
  private readonly config: PaddleConfig | null;
  private readonly client: Paddle | null;

  constructor(
    private readonly env: ConfigService<EnvironmentVariables, true>,
    private readonly prisma: PrismaService,
    private readonly invoices: InvoiceService,
    private readonly audit: AuditService,
    private readonly subscriptionNotifications: SubscriptionNotificationService,
  ) {
    const apiKey = this.env.get('PADDLE_SANDBOX_API_KEY', { infer: true });
    const clientToken = this.env.get('PADDLE_SANDBOX_CLIENT_TOKEN', { infer: true });
    const webhookSecret = this.env.get('PADDLE_SANDBOX_WEBHOOK_SECRET', { infer: true });
    const starterPriceId = this.env.get('PADDLE_SANDBOX_STARTER_PRICE_ID', { infer: true });
    const professionalPriceId = this.env.get('PADDLE_SANDBOX_PROFESSIONAL_PRICE_ID', { infer: true });
    this.config = apiKey && clientToken && webhookSecret && starterPriceId && professionalPriceId
      ? { apiKey, clientToken, webhookSecret, starterPriceId, professionalPriceId }
      : null;
    this.client = apiKey ? new Paddle(apiKey, { environment: Environment.sandbox }) : null;
  }

  async createCustomerPortalSession(organizationId: string) {
    if (!this.client) {
      throw new ServiceUnavailableException('Paddle sandbox billing management is not configured');
    }
    const subscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      select: { externalCustomerId: true, externalSubscriptionId: true },
    });
    if (!subscription?.externalCustomerId || !subscription.externalSubscriptionId) {
      throw new BadRequestException('This workspace does not have a linked Paddle subscription');
    }
    const session = await this.client.customerPortalSessions.create(
      subscription.externalCustomerId,
      [subscription.externalSubscriptionId],
    );
    return { url: session.urls.general.overview };
  }

  async createInvoiceCheckout(organizationId: string, invoiceId: string, ownerUserId: string) {
    const config = this.requireConfig();
    const client = this.client!;
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: { plan: true },
    });
    if (!invoice) throw new NotFoundException();
    if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.OVERDUE) {
      throw new BadRequestException('Only issued or overdue invoices can be paid with checkout');
    }
    if (invoice.plan.code !== 'starter' && invoice.plan.code !== 'professional') {
      throw new BadRequestException('This plan is not available for online checkout');
    }
    const currentSubscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      select: { externalSubscriptionId: true },
    });
    if (currentSubscription?.externalSubscriptionId) {
      throw new BadRequestException('This workspace already has a Paddle subscription; manage its recurring billing instead of starting a second one.');
    }
    const priceId = invoice.plan.code === 'starter' ? config.starterPriceId : config.professionalPriceId;
    if (invoice.paddleTransactionId) {
      return {
        transactionId: invoice.paddleTransactionId,
        clientToken: config.clientToken,
        customerEmail: invoice.customerBillingEmail,
        environment: 'sandbox' as const,
      };
    }
    const expectedAmount = invoice.plan.annualPriceCents;
    if (expectedAmount == null || invoice.currency !== 'USD' || invoice.totalCents !== expectedAmount) {
      throw new BadRequestException('Invoice amount does not match the configured annual plan');
    }
    const paddlePrice = await client.prices.get(priceId);
    if (
      paddlePrice.unitPrice.amount !== String(expectedAmount) ||
      paddlePrice.unitPrice.currencyCode !== 'USD' ||
      paddlePrice.billingCycle?.interval !== 'year' ||
      paddlePrice.billingCycle?.frequency !== 1
    ) {
      throw new ServiceUnavailableException('Configured Paddle sandbox price does not match the plan catalog');
    }

    const transaction = await client.transactions.create({
      items: [{ priceId, quantity: 1 }],
      collectionMode: 'automatic',
      customData: {
        fieldkeelInvoiceId: invoice.id,
        fieldkeelOrganizationId: organizationId,
        fieldkeelOwnerUserId: ownerUserId,
      },
    });
    const claim = await this.prisma.invoice.updateMany({
      where: { id: invoice.id, paddleTransactionId: null },
      data: { paddleTransactionId: transaction.id },
    });
    if (claim.count === 0) {
      throw new BadRequestException('A checkout was started concurrently. Refresh Billing and try again.');
    }
    return {
      transactionId: transaction.id,
      clientToken: config.clientToken,
      customerEmail: invoice.customerBillingEmail,
      environment: 'sandbox' as const,
    };
  }

  async processWebhook(rawBody: Buffer, signature: string) {
    const config = this.requireConfig();
    const event = await this.client!.webhooks.unmarshal(
      rawBody.toString('utf8'),
      config.webhookSecret,
      signature,
    ).catch(() => {
      throw new BadRequestException('Invalid Paddle webhook signature');
    });
    const data = event.data as unknown as PaddleRecord;
    if (event.eventType === 'transaction.completed') {
      await this.processCompletedTransaction(event.eventId, event.eventType, data);
      return { received: true, processed: true };
    }
    if (event.eventType === 'transaction.payment_failed') {
      await this.processFailedTransaction(event.eventId, event.eventType, data);
      return { received: true, processed: true };
    }
    if (event.eventType === 'adjustment.created' || event.eventType === 'adjustment.updated') {
      await this.processAdjustment(event.eventId, event.eventType, data);
      return { received: true, processed: true };
    }
    if (event.eventType.startsWith('subscription.')) {
      await this.processSubscriptionEvent(event.eventId, event.eventType, data);
      return { received: true, processed: true };
    }
    await this.prisma.paddleWebhookEvent.createMany({
      data: [{ eventId: event.eventId, eventType: event.eventType }],
      skipDuplicates: true,
    });
    return { received: true, processed: false };
  }

  private async processCompletedTransaction(eventId: string, eventType: string, data: PaddleRecord) {
    const transactionId = typeof data.id === 'string' ? data.id : '';
    const paddleSubscriptionId = typeof data.subscriptionId === 'string' ? data.subscriptionId : '';
    const customerId = typeof data.customerId === 'string' ? data.customerId : '';
    if (!transactionId) throw new BadRequestException('Paddle transaction is missing its ID');
    if (await this.prisma.paddleWebhookEvent.findUnique({ where: { eventId } })) return;

    // Paddle creates automatic renewal transactions from the original recurring price.
    // Match them to the already linked local subscription before considering first-payment metadata.
    if (paddleSubscriptionId) {
      const linked = await this.prisma.subscription.findFirst({
        where: { externalSubscriptionId: paddleSubscriptionId },
        include: { plan: true },
      });
      if (linked) {
        await this.processRecurringPayment(eventId, eventType, data, linked);
        return;
      }
    }

    const customData = data.customData && typeof data.customData === 'object'
      ? data.customData as PaddleRecord
      : {};
    const invoiceId = typeof customData.fieldkeelInvoiceId === 'string' ? customData.fieldkeelInvoiceId : '';
    const organizationId = typeof customData.fieldkeelOrganizationId === 'string' ? customData.fieldkeelOrganizationId : '';
    const ownerUserId = typeof customData.fieldkeelOwnerUserId === 'string' ? customData.fieldkeelOwnerUserId : '';
    if (!invoiceId || !organizationId || !ownerUserId || !paddleSubscriptionId || !customerId) {
      throw new BadRequestException('Paddle transaction is missing FieldKeel correlation data');
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, paddleTransactionId: transactionId },
      include: { plan: true },
    });
    if (!invoice || !['starter', 'professional'].includes(invoice.plan.code)) {
      throw new BadRequestException('Paddle transaction does not match an eligible FieldKeel invoice');
    }
    this.assertTransactionMatchesPlan(data, invoice.plan.code, invoice.plan.annualPriceCents, invoice.currency, invoice.totalCents);
    // InvoiceService owns its transaction and performs an idempotent invoice+subscription
    // transition. Keep event claiming separate so a retry can finish if a worker stops between them.
    const active = await this.prisma.subscription.findUnique({ where: { organizationId }, select: { activatedAt: true } });
    const paddlePeriod = data.billingPeriod && typeof data.billingPeriod === 'object'
      ? data.billingPeriod as PaddleRecord : {};
    const periodStart = typeof paddlePeriod.startsAt === 'string' ? new Date(paddlePeriod.startsAt) : null;
    const periodEnd = typeof paddlePeriod.endsAt === 'string' ? new Date(paddlePeriod.endsAt) : null;
    const validPaddlePeriod = periodStart && periodEnd && !Number.isNaN(periodStart.getTime()) &&
      !Number.isNaN(periodEnd.getTime()) && periodEnd > periodStart
      ? { start: periodStart, end: periodEnd } : undefined;
    if (!validPaddlePeriod) {
      throw new BadRequestException('Completed Paddle transaction is missing its authoritative billing period');
    }
    if (invoice.status !== InvoiceStatus.PAID) {
      if (invoice.type === 'RENEWAL' || active?.activatedAt) {
        await this.invoices.markPaddlePaidAndApply(invoiceId, ownerUserId, 'renew', validPaddlePeriod);
      } else {
        await this.invoices.markPaddlePaidAndApply(invoiceId, ownerUserId, 'activate', validPaddlePeriod);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
      if (await tx.paddleWebhookEvent.findUnique({ where: { eventId } })) return;
      await tx.subscription.update({
        where: { organizationId },
        data: { externalCustomerId: customerId, externalSubscriptionId: paddleSubscriptionId },
      });
      await tx.paddleWebhookEvent.create({ data: { eventId, eventType } });
      await this.saveTransactionEvent(tx, eventId, organizationId, invoiceId, transactionId, paddleSubscriptionId, data);
    });
  }

  private async processFailedTransaction(eventId: string, eventType: string, data: PaddleRecord) {
    const transactionId = typeof data.id === 'string' ? data.id : '';
    const paddleSubscriptionId = typeof data.subscriptionId === 'string' ? data.subscriptionId : '';
    if (!transactionId) throw new BadRequestException('Failed Paddle transaction is missing its ID');
    const invoice = await this.prisma.invoice.findFirst({
      where: { paddleTransactionId: transactionId }, include: { plan: true },
    });
    const subscription = paddleSubscriptionId
      ? await this.prisma.subscription.findFirst({ where: { externalSubscriptionId: paddleSubscriptionId } })
      : null;
    const organizationId = invoice?.organizationId ?? subscription?.organizationId;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
      if (await tx.paddleWebhookEvent.findUnique({ where: { eventId } })) return;
      if (organizationId) {
        await this.subscriptionNotifications.queuePaddlePaymentFailed(tx, {
          organizationId, eventId, transactionId,
          invoiceNumber: invoice?.invoiceNumber ?? null, renewal: Boolean(subscription),
        });
        if (invoice && !subscription) {
          await tx.invoice.updateMany({
            where: { id: invoice.id, paddleTransactionId: transactionId },
            data: {
              paddleTransactionId: null,
              internalNotes: [invoice.internalNotes, `Paddle payment failed (${eventId}): ${transactionId}`].filter(Boolean).join('\n'),
            },
          });
        }
      }
      await tx.paddleWebhookEvent.create({ data: { eventId, eventType } });
      if (organizationId) {
        await this.saveTransactionEvent(tx, eventId, organizationId, invoice?.id ?? null, transactionId, paddleSubscriptionId || null, data);
      }
    });
  }

  private async processAdjustment(eventId: string, eventType: string, data: PaddleRecord) {
    const transactionId = typeof data.transactionId === 'string' ? data.transactionId : '';
    const action = typeof data.action === 'string' ? data.action : '';
    const adjustmentStatus = typeof data.status === 'string' ? data.status : '';
    if (!transactionId || !['refund', 'chargeback', 'chargeback_warning', 'chargeback_reverse', 'chargeback_warning_reverse'].includes(action)) {
      await this.prisma.paddleWebhookEvent.createMany({ data: [{ eventId, eventType }], skipDuplicates: true });
      return;
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: { paddleTransactionId: transactionId }, include: { plan: true },
    });
    const paddleSubscriptionId = typeof data.subscriptionId === 'string' ? data.subscriptionId : '';
    const subscription = paddleSubscriptionId
      ? await this.prisma.subscription.findFirst({ where: { externalSubscriptionId: paddleSubscriptionId } })
      : null;
    const organizationId = invoice?.organizationId ?? subscription?.organizationId;
    let nextStatus: string | null = null;
    if (action === 'refund') {
      if (adjustmentStatus === 'approved') {
        const adjustmentType = typeof data.type === 'string' ? data.type : '';
        nextStatus = adjustmentType === 'full' ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      } else if (adjustmentStatus === 'pending_approval') nextStatus = 'REFUND_PENDING';
      else if (['rejected', 'reversed'].includes(adjustmentStatus)) nextStatus = 'PAID';
    } else if (action === 'chargeback_reverse' || action === 'chargeback_warning_reverse') {
      nextStatus = 'PAID';
    } else if (action === 'chargeback' && ['approved', 'pending_approval'].includes(adjustmentStatus)) {
      nextStatus = 'DISPUTED';
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
      if (await tx.paddleWebhookEvent.findUnique({ where: { eventId } })) return;
      if (invoice && nextStatus) {
        await tx.$executeRaw`UPDATE "Invoice" SET "status" = ${nextStatus}::"InvoiceStatus", "updatedAt" = NOW() WHERE "id" = ${invoice.id}::uuid`;
        await this.audit.record({
          action: 'PADDLE_ADJUSTMENT_RECORDED', entityType: 'Invoice', entityId: invoice.id,
          organizationId: invoice.organizationId, actorUserId: null,
          oldValues: { status: invoice.status },
          newValues: { status: nextStatus, eventId, eventType, adjustmentStatus, action },
        }, tx);
      }
      if (organizationId) {
        await this.subscriptionNotifications.queuePaddleAdjustment(tx, {
          organizationId, eventId, transactionId, invoiceNumber: invoice?.invoiceNumber ?? null,
          action, adjustmentStatus, nextInvoiceStatus: nextStatus,
        });
      }
      await tx.paddleWebhookEvent.create({ data: { eventId, eventType } });
      if (organizationId) {
        await this.saveTransactionEvent(tx, eventId, organizationId, invoice?.id ?? null, transactionId, paddleSubscriptionId || null, data, `${action}_${adjustmentStatus}`);
      }
    });
  }

  private async processRecurringPayment(
    eventId: string,
    eventType: string,
    data: PaddleRecord,
    subscription: {
      id: string;
      organizationId: string;
      status: SubscriptionStatus;
      currentPeriodEnd: Date | null;
      currentPeriodStart: Date | null;
      activatedByUserId: string | null;
      plan: { code: string; annualPriceCents: number | null; currency: string };
    },
  ) {
    const period = data.billingPeriod && typeof data.billingPeriod === 'object'
      ? data.billingPeriod as PaddleRecord
      : {};
    const start = typeof period.startsAt === 'string' ? new Date(period.startsAt) : null;
    const end = typeof period.endsAt === 'string' ? new Date(period.endsAt) : null;
    const amount = subscription.plan.annualPriceCents;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ||
      (subscription.currentPeriodEnd && end <= subscription.currentPeriodEnd)) {
      throw new BadRequestException('Paddle renewal period is invalid or already applied');
    }
    this.assertTransactionMatchesPlan(
      data,
      subscription.plan.code,
      amount,
      subscription.plan.currency,
      amount ?? -1,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
      if (await tx.paddleWebhookEvent.findUnique({ where: { eventId } })) return;
      const before = await this.subscriptionNotifications.lockSubscription(tx, subscription.organizationId);
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: start,
          currentPeriodEnd: end,
          cancelAtPeriodEnd: false,
        },
      });
      await this.audit.record({
        action: 'SUBSCRIPTION_RENEWED',
        entityType: 'Subscription',
        entityId: subscription.id,
        organizationId: subscription.organizationId,
        actorUserId: subscription.activatedByUserId,
        oldValues: { currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null },
        newValues: { currentPeriodStart: start.toISOString(), currentPeriodEnd: end.toISOString(), provider: 'paddle_sandbox' },
      }, tx);
      await this.subscriptionNotifications.queueSubscriptionChange(
        tx,
        subscription.organizationId,
        before,
        new Date(),
        'renewal',
      );
      await tx.paddleWebhookEvent.create({ data: { eventId, eventType } });
      const transactionId = typeof data.id === 'string' ? data.id : null;
      const paddleSubscriptionId = typeof data.subscriptionId === 'string' ? data.subscriptionId : null;
      if (transactionId) {
        await this.saveTransactionEvent(tx, eventId, subscription.organizationId, null, transactionId, paddleSubscriptionId, data);
      }
    });
  }

  private assertTransactionMatchesPlan(
    data: PaddleRecord,
    planCode: string,
    annualPriceCents: number | null,
    currency: string,
    invoiceTotalCents: number,
  ) {
    const config = this.requireConfig();
    const expectedPriceId = planCode === 'starter' ? config.starterPriceId
      : planCode === 'professional' ? config.professionalPriceId : null;
    const items = Array.isArray(data.items) ? data.items as PaddleRecord[] : [];
    const firstPrice = items[0]?.price && typeof items[0].price === 'object'
      ? items[0].price as PaddleRecord
      : {};
    const totals = data.details && typeof data.details === 'object'
      ? (data.details as PaddleRecord).totals as PaddleRecord | undefined
      : undefined;
    if (!expectedPriceId || annualPriceCents == null || items.length !== 1 ||
      (items[0].priceId !== expectedPriceId && firstPrice.id !== expectedPriceId) || Number(items[0].quantity) !== 1 ||
      String(totals?.subtotal) !== String(invoiceTotalCents) ||
      data.currencyCode !== currency || invoiceTotalCents !== annualPriceCents) {
      throw new BadRequestException('Completed Paddle transaction does not match the FieldKeel invoice and plan');
    }
  }

  private async saveTransactionEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
    organizationId: string,
    invoiceId: string | null,
    transactionId: string,
    paddleSubscriptionId: string | null,
    data: PaddleRecord,
    statusOverride?: string,
  ) {
    const details = data.details && typeof data.details === 'object' ? data.details as PaddleRecord : {};
    const nestedTotals = details.totals && typeof details.totals === 'object' ? details.totals as PaddleRecord : {};
    const eventTotals = data.totals && typeof data.totals === 'object' ? data.totals as PaddleRecord : {};
    const amount = Number(eventTotals.total ?? nestedTotals.total ?? eventTotals.subtotal ?? nestedTotals.subtotal);
    const period = data.billingPeriod && typeof data.billingPeriod === 'object' ? data.billingPeriod as PaddleRecord : {};
    const start = typeof period.startsAt === 'string' ? new Date(period.startsAt) : null;
    const end = typeof period.endsAt === 'string' ? new Date(period.endsAt) : null;
    const status = statusOverride ?? (typeof data.status === 'string' ? data.status : null);
    const currency = typeof data.currencyCode === 'string' ? data.currencyCode : null;
    await tx.$executeRaw`UPDATE "PaddleWebhookEvent" SET
      "organizationId" = ${organizationId}::uuid,
      "invoiceId" = ${invoiceId}::uuid,
      "transactionId" = ${transactionId},
      "paddleSubscriptionId" = ${paddleSubscriptionId},
      "eventStatus" = ${status},
      "amountCents" = ${Number.isSafeInteger(amount) ? amount : null},
      "currency" = ${currency},
      "billingPeriodStart" = ${start && !Number.isNaN(start.getTime()) ? start : null},
      "billingPeriodEnd" = ${end && !Number.isNaN(end.getTime()) ? end : null}
      WHERE "eventId" = ${eventId}`;
  }

  private async processSubscriptionEvent(eventId: string, eventType: string, data: PaddleRecord) {
    const paddleSubscriptionId = typeof data.id === 'string' ? data.id : '';
    if (!paddleSubscriptionId) throw new BadRequestException('Paddle subscription event is missing its ID');
    if (await this.prisma.paddleWebhookEvent.findUnique({ where: { eventId } })) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
      if (await tx.paddleWebhookEvent.findUnique({ where: { eventId } })) return;
      const current = await tx.subscription.findFirst({ where: { externalSubscriptionId: paddleSubscriptionId } });
      if (current) {
        const scheduledChange = data.scheduledChange && typeof data.scheduledChange === 'object'
          ? data.scheduledChange as PaddleRecord
          : null;
        const status = typeof data.status === 'string' ? data.status : '';
        const hasScheduledChange = Object.prototype.hasOwnProperty.call(data, 'scheduledChange');
        const cancelAtPeriodEnd = status === 'canceled' || scheduledChange?.action === 'cancel' ||
          (!hasScheduledChange && current.cancelAtPeriodEnd);
        const reactivated = status === 'active' &&
          (current.cancelAtPeriodEnd || current.status === SubscriptionStatus.PAST_DUE) && !cancelAtPeriodEnd;
        await tx.subscription.update({
          where: { id: current.id },
          data: {
            cancelAtPeriodEnd,
            ...(status === 'past_due' ? { status: SubscriptionStatus.PAST_DUE } : {}),
            ...(status === 'active' && current.status === SubscriptionStatus.PAST_DUE
              ? { status: SubscriptionStatus.ACTIVE }
              : {}),
            ...(typeof data.customerId === 'string' ? { externalCustomerId: data.customerId } : {}),
          },
        });
        if ((cancelAtPeriodEnd && !current.cancelAtPeriodEnd) || reactivated) {
          const period = data.currentBillingPeriod && typeof data.currentBillingPeriod === 'object'
            ? data.currentBillingPeriod as PaddleRecord : {};
          const periodEnd = typeof period.endsAt === 'string' ? new Date(period.endsAt) : current.currentPeriodEnd;
          await this.subscriptionNotifications.queuePaddleSubscriptionNotice(tx, {
            organizationId: current.organizationId, eventId, cancelled: cancelAtPeriodEnd,
            effectiveAt: periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd : null,
          });
        }
      }
      await tx.paddleWebhookEvent.create({ data: { eventId, eventType } });
    });
  }

  private requireConfig(): PaddleConfig {
    if (!this.config || !this.client) {
      throw new ServiceUnavailableException('Paddle sandbox checkout is not configured');
    }
    return this.config;
  }
}
