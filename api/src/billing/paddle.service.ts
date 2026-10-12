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

const TERM_DISCOUNT_PERCENT: Record<number, number> = {
  1: 0,
  2: 5,
  3: 7,
  4: 10,
  5: 15,
};

function termPriceCents(annualPriceCents: number, years: number) {
  const discount = TERM_DISCOUNT_PERCENT[years];
  if (!Number.isInteger(years) || discount === undefined) {
    throw new BadRequestException('Choose a billing term from 1 to 5 years');
  }
  return Math.round((annualPriceCents * years * (100 - discount)) / 100);
}

function termYearsFromCustomData(value: unknown) {
  const customData = value && typeof value === 'object' ? value as PaddleRecord : {};
  const years = customData.fieldkeelTermYears;
  return Number.isInteger(years) && Number(years) >= 1 && Number(years) <= 5
    ? Number(years)
    : 1;
}

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

  async updateDiscountedInvoice(invoiceId: string, requestId: string, actorUserId: string, termYears: number, paymentUrl?: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId }, select: { id: true, paddleTransactionId: true } });
    if (!invoice) throw new NotFoundException();
    if (invoice.paddleTransactionId) {
      if (!this.client) throw new ServiceUnavailableException('Paddle is unavailable, so the existing checkout cannot be safely canceled');
      const transaction = await this.client.transactions.get(invoice.paddleTransactionId);
      if (transaction.status === 'draft' || transaction.status === 'ready') {
        await this.client.transactions.update(invoice.paddleTransactionId, { status: 'canceled' } as never);
      } else if (transaction.status !== 'canceled') {
        throw new BadRequestException('This invoice has a completed or processing card payment. Resolve that payment before changing the invoice.');
      }
    }
    return this.invoices.updateDiscountedTerm(invoiceId, requestId, actorUserId, termYears, paymentUrl);
  }

  async createInvoiceCheckout(organizationId: string, invoiceId: string, ownerUserId: string, termYears: number) {
    const config = this.requireConfig();
    const client = this.client!;
    const selectedTermYears = Number(termYears);
    termPriceCents(1, selectedTermYears);
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
    const expectedAmount = invoice.plan.annualPriceCents;
    if (expectedAmount == null || invoice.currency !== 'USD') {
      throw new BadRequestException('Invoice amount does not match the configured plan');
    }
    const storedTermIsValid = [1, 2, 3, 4, 5].some((years) => {
      const expectedEnd = new Date(invoice.billingPeriodStart);
      expectedEnd.setUTCFullYear(expectedEnd.getUTCFullYear() + years);
      return invoice.totalCents === termPriceCents(expectedAmount, years) &&
        expectedEnd.toISOString().slice(0, 10) === invoice.billingPeriodEnd.toISOString().slice(0, 10);
    });
    if (invoice.totalCents !== expectedAmount && !storedTermIsValid) {
      throw new BadRequestException('Invoice amount and billing period do not match a configured plan term');
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
    const quantityLimits = (paddlePrice as unknown as {
      quantity?: { minimum?: number; maximum?: number };
    }).quantity;
    if (quantityLimits?.minimum !== 1 || quantityLimits.maximum !== 1) {
      throw new ServiceUnavailableException(
        'Paddle price quantity must be limited to exactly one. Set the Sandbox price minimum and maximum quantity to 1.',
      );
    }
    const selectedAmountCents = termPriceCents(expectedAmount, selectedTermYears);
    const checkoutItem = [{
      quantity: 1,
      price: {
        productId: paddlePrice.productId,
        description: `FieldKeel ${invoice.plan.name} ${selectedTermYears}-year term`,
        name: `${invoice.plan.name} - every ${selectedTermYears} ${selectedTermYears === 1 ? 'year' : 'years'}`,
        billingCycle: { interval: 'year', frequency: selectedTermYears },
        unitPrice: { amount: String(selectedAmountCents), currencyCode: 'USD' },
      },
    }];
    const checkoutCustomData = {
      fieldkeelInvoiceId: invoice.id,
      fieldkeelOrganizationId: organizationId,
      fieldkeelOwnerUserId: ownerUserId,
      fieldkeelTermYears: selectedTermYears,
      fieldkeelDiscountPercent: TERM_DISCOUNT_PERCENT[selectedTermYears],
    };
    let replaceCanceledTransactionId: string | null = null;
    if (invoice.paddleTransactionId) {
      const existing = await client.transactions.get(invoice.paddleTransactionId);
      if (existing.status === 'draft' || existing.status === 'ready') {
        const existingYears = termYearsFromCustomData(existing.customData);
        if (existingYears !== selectedTermYears) {
          await client.transactions.update(invoice.paddleTransactionId, {
            items: checkoutItem as never,
            customData: checkoutCustomData,
          });
        }
        return {
          transactionId: invoice.paddleTransactionId,
          clientToken: config.clientToken,
          customerEmail: invoice.customerBillingEmail,
          environment: 'sandbox' as const,
        };
      }
      if (existing.status === 'canceled') {
        replaceCanceledTransactionId = invoice.paddleTransactionId;
      } else if (existing.status === 'completed' || existing.status === 'paid') {
        throw new BadRequestException('Payment is complete or processing. Refresh Billing to see the updated subscription before starting another checkout.');
      } else {
        throw new BadRequestException(`The existing Paddle payment is ${existing.status}. Refresh Billing or contact FieldKeel support before trying again.`);
      }
    }

    const transaction = await client.transactions.create({
      items: checkoutItem as never,
      collectionMode: 'automatic',
      customData: checkoutCustomData,
    });
    const claim = await this.prisma.invoice.updateMany({
      where: replaceCanceledTransactionId
        ? { id: invoice.id, paddleTransactionId: replaceCanceledTransactionId }
        : { id: invoice.id, paddleTransactionId: null },
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
    const termYears = termYearsFromCustomData(customData);
    const selectedAmountCents = invoice.plan.annualPriceCents == null
      ? -1
      : termPriceCents(invoice.plan.annualPriceCents, termYears);
    await this.assertTransactionMatchesPlan(
      data, invoice.plan.code, invoice.plan.annualPriceCents, invoice.currency,
      selectedAmountCents, termYears,
    );
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
      const updatedInvoice = await this.prisma.invoice.updateMany({
        where: {
          id: invoice.id,
          organizationId,
          paddleTransactionId: transactionId,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
        },
        data: {
          subtotalCents: selectedAmountCents,
          totalCents: selectedAmountCents,
          billingPeriodStart: validPaddlePeriod.start,
          billingPeriodEnd: validPaddlePeriod.end,
        },
      });
      if (updatedInvoice.count !== 1) {
        throw new BadRequestException('Paddle payment no longer matches an issued FieldKeel invoice');
      }
      if (invoice.type === 'RENEWAL' || active?.activatedAt) {
        await this.invoices.markPaddlePaidAndApply(invoiceId, ownerUserId, 'renew', validPaddlePeriod);
      } else {
        await this.invoices.markPaddlePaidAndApply(invoiceId, ownerUserId, 'activate', validPaddlePeriod);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`WITH lock_result AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${eventId}))) SELECT TRUE AS acquired FROM lock_result`;
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
      await tx.$queryRaw`WITH lock_result AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${eventId}))) SELECT TRUE AS acquired FROM lock_result`;
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
      await tx.$queryRaw`WITH lock_result AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${eventId}))) SELECT TRUE AS acquired FROM lock_result`;
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
    const termYears = termYearsFromCustomData(data.customData);
    const amount = subscription.plan.annualPriceCents == null
      ? null
      : termPriceCents(subscription.plan.annualPriceCents, termYears);
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ||
      (subscription.currentPeriodEnd && end <= subscription.currentPeriodEnd)) {
      throw new BadRequestException('Paddle renewal period is invalid or already applied');
    }
    await this.assertTransactionMatchesPlan(
      data,
      subscription.plan.code,
      subscription.plan.annualPriceCents,
      subscription.plan.currency,
      amount ?? -1,
      termYears,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`WITH lock_result AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${eventId}))) SELECT TRUE AS acquired FROM lock_result`;
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

  private async assertTransactionMatchesPlan(
    data: PaddleRecord,
    planCode: string,
    annualPriceCents: number | null,
    currency: string,
    expectedAmountCents: number,
    termYears: number,
  ) {
    const config = this.requireConfig();
    const expectedPriceId = planCode === 'starter' ? config.starterPriceId
      : planCode === 'professional' ? config.professionalPriceId : null;
    const items = Array.isArray(data.items) ? data.items as PaddleRecord[] : [];
    const item = items[0] ?? {};
    const price = item.price && typeof item.price === 'object'
      ? item.price as PaddleRecord
      : {};
    const customData = data.customData && typeof data.customData === 'object'
      ? data.customData as PaddleRecord
      : {};
    const hasTermMetadata = Object.hasOwn(customData, 'fieldkeelTermYears');
    const totals = data.details && typeof data.details === 'object'
      ? (data.details as PaddleRecord).totals as PaddleRecord | undefined
      : undefined;
    const configuredPrice = expectedPriceId ? await this.client!.prices.get(expectedPriceId) : null;
    const billingCycle = price.billingCycle && typeof price.billingCycle === 'object'
      ? price.billingCycle as PaddleRecord
      : {};
    const unitPrice = price.unitPrice && typeof price.unitPrice === 'object'
      ? price.unitPrice as PaddleRecord
      : {};
    const catalogPriceMatches = !hasTermMetadata &&
      (item.priceId === expectedPriceId || price.id === expectedPriceId);
    const customTermPriceMatches = hasTermMetadata && configuredPrice &&
      price.productId === configuredPrice.productId &&
      billingCycle.interval === 'year' && Number(billingCycle.frequency) === termYears &&
      unitPrice.amount === String(expectedAmountCents) &&
      unitPrice.currencyCode === currency &&
      termYearsFromCustomData(customData) === termYears;
    if (!expectedPriceId || annualPriceCents == null || items.length !== 1 ||
      Number(item.quantity) !== 1 ||
      (!catalogPriceMatches && !customTermPriceMatches) ||
      String(totals?.subtotal) !== String(expectedAmountCents) ||
      data.currencyCode !== currency || expectedAmountCents <= 0 ||
      (!hasTermMetadata && (termYears !== 1 || annualPriceCents !== expectedAmountCents))) {
      throw new BadRequestException('Completed Paddle transaction does not match the FieldKeel invoice, plan, and selected term');
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
      await tx.$queryRaw`WITH lock_result AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext(${eventId}))) SELECT TRUE AS acquired FROM lock_result`;
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
