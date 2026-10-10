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

  async createInvoiceCheckout(organizationId: string, invoiceId: string, ownerUserId: string) {
    const config = this.requireConfig();
    const client = this.client!;
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      include: { plan: true },
    });
    if (!invoice) throw new NotFoundException();
    if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.PAYMENT_REPORTED && invoice.status !== InvoiceStatus.OVERDUE) {
      throw new BadRequestException('Only issued or overdue invoices can be paid with checkout');
    }
    if (invoice.plan.code !== 'starter' && invoice.plan.code !== 'professional') {
      throw new BadRequestException('This plan is not available for online checkout');
    }
    const currentSubscription = await this.prisma.subscription.findUnique({
      where: { organizationId },
      select: { externalSubscriptionId: true },
    });
    if (currentSubscription?.externalSubscriptionId && invoice.type !== 'ACTIVATION') {
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
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
      if (await tx.paddleWebhookEvent.findUnique({ where: { eventId } })) return;
      const active = await tx.subscription.findUnique({ where: { organizationId }, select: { activatedAt: true } });
      if (invoice.status !== InvoiceStatus.PAID) {
        if (invoice.type === 'RENEWAL' || active?.activatedAt) {
          await this.invoices.markPaidAndRenew(invoiceId, ownerUserId);
        } else {
          await this.invoices.markPaidAndActivate(invoiceId, ownerUserId);
        }
      }
      await tx.subscription.update({
        where: { organizationId },
        data: { externalCustomerId: customerId, externalSubscriptionId: paddleSubscriptionId },
      });
      await tx.paddleWebhookEvent.create({ data: { eventId, eventType } });
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

  private async processSubscriptionEvent(eventId: string, eventType: string, data: PaddleRecord) {
    const paddleSubscriptionId = typeof data.id === 'string' ? data.id : '';
    if (!paddleSubscriptionId) throw new BadRequestException('Paddle subscription event is missing its ID');
    if (await this.prisma.paddleWebhookEvent.findUnique({ where: { eventId } })) return;
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.subscription.findFirst({ where: { externalSubscriptionId: paddleSubscriptionId } });
      if (current) {
        const scheduledChange = data.scheduledChange && typeof data.scheduledChange === 'object'
          ? data.scheduledChange as PaddleRecord
          : null;
        const status = typeof data.status === 'string' ? data.status : '';
        await tx.subscription.update({
          where: { id: current.id },
          data: {
            cancelAtPeriodEnd: scheduledChange?.action === 'cancel' || status === 'canceled',
            ...(status === 'past_due' ? { status: SubscriptionStatus.PAST_DUE } : {}),
            ...(status === 'active' && current.status === SubscriptionStatus.PAST_DUE
              ? { status: SubscriptionStatus.ACTIVE }
              : {}),
            ...(typeof data.customerId === 'string' ? { externalCustomerId: data.customerId } : {}),
          },
        });
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
