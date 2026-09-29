import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_SALES_EMAIL,
  NOTIFICATION_ACTIVATION_ACK,
  NOTIFICATION_ACTIVATION_REQUESTED,
  NOTIFICATION_PLAN_CHANGE_ACK,
  NOTIFICATION_PLAN_CHANGE_REQUESTED,
  NOTIFICATION_RENEWAL_PREFIX,
  NOTIFICATION_RENEWAL_REQUESTED,
  NOTIFICATION_SUBSCRIPTION_ACTIVATED,
  NOTIFICATION_SUBSCRIPTION_EXPIRED,
  NOTIFICATION_SUBSCRIPTION_RENEWED,
  NOTIFICATION_TRIAL_ENDING,
  NOTIFICATION_TRIAL_EXPIRED,
  NOTIFICATION_TRIAL_EXPIRING,
  NOTIFICATION_TRIAL_GRACE,
  NOTIFICATION_TRIAL_GRACE_ENDING,
  NOTIFICATION_TRIAL_REMINDER_PREFIX,
  NOTIFICATION_WORKSPACE_READ_ONLY,
  RENEWAL_REMINDER_DAYS,
  PAID_GRACE_DAYS,
  TRIAL_DAYS,
  TRIAL_GRACE_DAYS,
  TRIAL_REMINDER_DAYS,
} from '../common/constants.js';
import type { EnvironmentVariables } from '../config/env.js';
import { SubscriptionDeliveryService } from './subscription-delivery.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipStatus, OrganizationRole, Prisma, type Subscription } from '../generated/prisma/client.js';
import { resolveEffectiveStatus, type Entitlement } from './entitlement.js';

@Injectable()
export class SubscriptionNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: SubscriptionDeliveryService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  salesEmail() {
    return (
      this.config.get('PLATFORM_SALES_EMAIL', { infer: true }) ??
      DEFAULT_SALES_EMAIL
    );
  }

  async sendActivationRequested(input: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    requesterUserId: string;
    requesterName: string;
    requesterEmail: string;
    message: string | null;
    planName: string;
    effectiveStatus: string;
  }) {
    const periodKey = new Date().toISOString().slice(0, 10);
    await this.deliver({
      organizationId: input.organizationId,
      kind: NOTIFICATION_ACTIVATION_REQUESTED,
      periodKey,
      to: this.salesEmail(),
      subject: `Activation requested: ${input.organizationName}`,
      text: [
        `Activation requested for ${input.organizationName}.`,
        '',
        `Organization ID: ${input.organizationId}`,
        `Slug: ${input.organizationSlug}`,
        `Requested by: ${input.requesterName} <${input.requesterEmail}>`,
        `Plan: ${input.planName}`,
        `Current status: ${input.effectiveStatus}`,
        `Trial policy: ${TRIAL_DAYS} days + ${TRIAL_GRACE_DAYS} days grace.`,
        '',
        input.message ? `Message:\n${input.message}` : 'No message was provided.',
        '',
        'Prepare an activation invoice in platform billing when ready.',
      ].join('\n'),
    });

    await this.mailOwners(input.organizationId, {
      kind: NOTIFICATION_ACTIVATION_ACK,
      periodKey,
      subject: 'Your FieldKeel activation request was received',
      text: `FieldKeel received your activation request for ${input.organizationName}. Check Billing for the next steps.`,
      inApp: {
        type: NOTIFICATION_ACTIVATION_ACK,
        title: 'Activation request received',
        message: `FieldKeel received your activation request for ${input.organizationName}.`,
      },
    });
  }

  async sendRenewalRequested(input: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    requesterName: string;
    requesterEmail: string;
    message: string | null;
    planName: string;
    effectiveStatus: string;
  }) {
    const periodKey = new Date().toISOString().slice(0, 10);
    await this.deliver({
      organizationId: input.organizationId,
      kind: NOTIFICATION_RENEWAL_REQUESTED,
      periodKey,
      to: this.salesEmail(),
      subject: `Renewal requested: ${input.organizationName}`,
      text: [
        `Renewal requested for ${input.organizationName}.`,
        '',
        `Organization ID: ${input.organizationId}`,
        `Slug: ${input.organizationSlug}`,
        `Requested by: ${input.requesterName} <${input.requesterEmail}>`,
        `Plan: ${input.planName}`,
        `Current status: ${input.effectiveStatus}`,
        '',
        input.message ? `Message:\n${input.message}` : 'No message was provided.',
        '',
        'Prepare a renewal invoice in platform billing when ready.',
      ].join('\n'),
    });
  }

  async sendPlanChangeRequested(input: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    requesterUserId: string;
    requesterName: string;
    requesterEmail: string;
    message: string | null;
    planName: string;
    effectiveStatus: string;
  }) {
    const periodKey = new Date().toISOString().slice(0, 10);
    await this.deliver({
      organizationId: input.organizationId,
      kind: NOTIFICATION_PLAN_CHANGE_REQUESTED,
      periodKey,
      to: this.salesEmail(),
      subject: `Plan change requested: ${input.organizationName}`,
      text: [
        `Plan change requested for ${input.organizationName}.`,
        '',
        `Organization ID: ${input.organizationId}`,
        `Slug: ${input.organizationSlug}`,
        `Requested by: ${input.requesterName} <${input.requesterEmail}>`,
        `Current plan: ${input.planName}`,
        `Current status: ${input.effectiveStatus}`,
        '',
        input.message ? `Message:\n${input.message}` : 'No message was provided.',
        '',
        'Assign a new plan from platform administration.',
      ].join('\n'),
    });

    await this.notifications.notify({
      organizationId: input.organizationId,
      recipientUserIds: [input.requesterUserId],
      type: NOTIFICATION_PLAN_CHANGE_ACK,
      title: 'Plan change request received',
      message: `FieldKeel received your plan change request for ${input.organizationName}.`,
      relatedEntityType: 'Organization',
      relatedEntityId: input.organizationId,
      payload: { organizationSlug: input.organizationSlug },
      dedupeUnread: true,
    });
  }

  /** Lock and read the authoritative pre-change subscription inside the caller's transaction. */
  async lockSubscription(tx: Prisma.TransactionClient, organizationId: string) {
    await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "organizationId" = ${organizationId}::uuid FOR UPDATE`;
    return tx.subscription.findUniqueOrThrow({ where: { organizationId } });
  }

  async queueWorkspaceCreated(tx: Prisma.TransactionClient, organizationId: string, trialStarted: boolean) {
    const context = await this.context(tx, organizationId);
    const { subscription } = context;
    if (trialStarted && subscription.trialStartedAt && subscription.trialEndsAt) {
      await this.queueLifecycle(tx, context, {
        kind: 'TRIAL_STARTED', periodKey: subscription.trialStartedAt.toISOString(),
        subject: 'Welcome to your FieldKeel Professional trial',
        text: `Your ${TRIAL_DAYS}-day FieldKeel Professional trial for ${context.name} has started.\nNo credit card is required.\nTrial starts: ${date(subscription.trialStartedAt)}\nTrial ends: ${date(subscription.trialEndsAt)}`,
        ctaLabel: 'Open workspace', ctaUrl: this.workspaceLink(context.slug),
        platformSubject: `New FieldKeel trial started — ${context.name}`,
      });
    } else if (!trialStarted) {
      await this.queueLifecycle(tx, context, {
        kind: 'WORKSPACE_PENDING_ACTIVATION', periodKey: subscription.createdAt.toISOString(),
        subject: 'Your FieldKeel workspace is awaiting activation',
        text: `${context.name} was created on ${date(subscription.createdAt)}. This additional workspace does not include another free trial. It is read-only (PENDING_ACTIVATION) until activation. Open Plan & Subscription to request activation and Billing to complete the manual payment process.`,
        platformSubject: `New FieldKeel workspace awaiting activation — ${context.name}`,
        ctaLabel: 'Activate workspace',
      });
    }
  }

  async queueSubscriptionChange(
    tx: Prisma.TransactionClient,
    organizationId: string,
    before: Subscription,
    occurredAt: Date,
    reason: 'activation' | 'renewal' | 'period' | 'reactivation' | 'plan' | 'trial-extension',
    receipt?: { invoiceId: string; invoiceNumber: string; billingEmail: string },
  ) {
    const context = await this.context(tx, organizationId, occurredAt);
    const after = context.subscription;
    const oldStatus = resolveEffectiveStatus({ ...before, storedStatus: before.status }, occurredAt);
    const newStatus = resolveEffectiveStatus({ ...after, storedStatus: after.status }, occurredAt);
    let kind: string | null = null;
    let subject = '';
    let platformSubject = '';
    if (newStatus === 'ACTIVE' && oldStatus !== 'ACTIVE') {
      const restored = ['EXPIRED', 'TRIAL_EXPIRED', 'SUSPENDED', 'CANCELLED'].includes(oldStatus);
      kind = restored ? 'WORKSPACE_REACTIVATED' : NOTIFICATION_SUBSCRIPTION_ACTIVATED;
      subject = restored ? 'Your FieldKeel workspace has been reactivated' : 'Your FieldKeel workspace is now active';
      platformSubject = restored ? 'FieldKeel workspace reactivated' : 'FieldKeel subscription activated';
    } else if (newStatus === 'ACTIVE' &&
      (before.currentPeriodEnd?.getTime() !== after.currentPeriodEnd?.getTime() ||
       before.currentPeriodStart?.getTime() !== after.currentPeriodStart?.getTime())) {
      kind = NOTIFICATION_SUBSCRIPTION_RENEWED;
      subject = 'Your FieldKeel subscription was renewed';
      platformSubject = 'FieldKeel subscription renewed';
    } else if ((reason === 'reactivation' || reason === 'trial-extension') &&
      ['TRIALING', 'GRACE'].includes(newStatus) && !['TRIALING', 'GRACE'].includes(oldStatus)) {
      kind = 'WORKSPACE_REACTIVATED';
      subject = 'Your FieldKeel workspace has been reactivated';
      platformSubject = 'FieldKeel workspace reactivated';
    } else if (before.planId !== after.planId) {
      kind = 'SUBSCRIPTION_PLAN_CHANGED';
      subject = 'Your FieldKeel subscription plan has changed';
      platformSubject = 'FieldKeel subscription plan changed';
    }
    if (kind) {
      await this.queueLifecycle(tx, context, {
        kind, periodKey: after.updatedAt.toISOString(), subject,
        platformSubject: `${platformSubject} — ${context.name}`,
        text: [
          `${context.name}: ${subject.replace('Your FieldKeel ', '')}.`,
          `Plan: ${after.plan.name}`,
          `Effective date: ${date(occurredAt)}`,
          `Current access status: ${newStatus}`,
          `Subscription period starts: ${date(after.currentPeriodStart)}`,
          `Subscription period ends: ${date(after.currentPeriodEnd)}`,
          ...(['TRIALING', 'GRACE'].includes(newStatus) ? [`Trial ends: ${date(after.trialEndsAt)}`] : []),
          ...(receipt ? [`Payment for invoice ${receipt.invoiceNumber} has been confirmed.`] : []),
        ].join('\n'),
        ctaLabel: 'Open workspace', ctaUrl: this.workspaceLink(context.slug),
        inApp: { type: kind, title: subject, message: `${after.plan.name}: ${newStatus}.` },
      });
    }
    // Preserve billing-contact receipts, merging with the Owner lifecycle email when possible.
    if (receipt) {
      const bundled = kind && context.owners.some((owner) => owner.user.email.toLowerCase() === receipt.billingEmail.toLowerCase());
      if (bundled) {
        await tx.subscriptionNotification.createMany({
          data: [{ organizationId, kind: 'INVOICE_PAYMENT_CONFIRMATION', periodKey: receipt.invoiceId }],
          skipDuplicates: true,
        });
      } else {
        await this.delivery.enqueue(tx, {
          organizationId, kind: 'INVOICE_PAYMENT_CONFIRMATION', periodKey: receipt.invoiceId,
          to: receipt.billingEmail, subject: 'Your FieldKeel invoice payment was confirmed',
          text: `Payment for invoice ${receipt.invoiceNumber} for ${context.name} has been confirmed.\nPlan: ${after.plan.name}\nSubscription period ends: ${date(after.currentPeriodEnd)}`,
          ctaLabel: 'Open Billing', ctaUrl: this.billingLink(context.slug),
        });
      }
    }
  }

  async reconcileEntitlement(
    organizationId: string,
    _organizationName: string,
    _organizationSlug: string,
    entitlement: Entitlement,
    tx: Prisma.TransactionClient,
    transitioned: boolean,
    now: Date,
  ) {
    const context = await this.context(tx, organizationId, now);
    const plan = entitlement.plan.name;
    if (entitlement.effectiveStatus === 'TRIALING' && entitlement.trialEndsAt) {
      for (const days of TRIAL_REMINDER_DAYS) {
        if (days > 0 && isSameUtcDay(now, entitlement.trialEndsAt)) continue;
        if (days === 0 ? !isSameUtcDay(now, entitlement.trialEndsAt) : entitlement.trialDaysRemaining !== days) continue;
        const when = days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`;
        await this.queueLifecycle(tx, context, {
          kind: `${NOTIFICATION_TRIAL_REMINDER_PREFIX}${days}`, periodKey: entitlement.trialEndsAt.toISOString(),
          subject: `Your FieldKeel trial ends ${when}`,
          text: `The ${plan} trial for ${context.name} ends ${when}.\nTrial end: ${date(entitlement.trialEndsAt)}\nWrite access continues during the existing ${TRIAL_GRACE_DAYS}-day trial grace period, through ${date(entitlement.graceEndsAt)}. After grace, the workspace is read-only until activation. FieldKeel does not automatically charge a card. Request activation from Plan & Subscription and follow your invoice instructions in Billing.`,
          ...(days === 3 ? { platformSubject: `FieldKeel trial ending soon — ${context.name}` } : {}),
          inApp: { type: days <= 1 ? NOTIFICATION_TRIAL_EXPIRING : NOTIFICATION_TRIAL_ENDING,
            title: days === 0 ? 'Trial ends today' : 'Trial ending soon', message: `Your ${plan} trial ends ${when}.` },
        });
      }
    }
    if (entitlement.effectiveStatus === 'GRACE' && entitlement.graceEndsAt) {
      if (transitioned) await this.queueLifecycle(tx, context, {
        kind: NOTIFICATION_TRIAL_GRACE, periodKey: entitlement.graceEndsAt.toISOString(),
        subject: 'Your FieldKeel trial grace period has started',
        text: `The trial for ${context.name} ended on ${date(entitlement.trialEndsAt)}. Write access continues through the ${TRIAL_GRACE_DAYS}-day grace period, ending ${date(entitlement.graceEndsAt)}. After that, the workspace becomes read-only until activation. Check Billing for activation/payment instructions.`,
        platformSubject: `FieldKeel trial grace started — ${context.name}`,
        inApp: { type: NOTIFICATION_TRIAL_GRACE, title: 'Trial grace period started', message: 'Your trial ended. Check Billing for activation.' },
      });
      if (entitlement.graceDaysRemaining === 1) await this.queueLifecycle(tx, context, {
        kind: NOTIFICATION_TRIAL_GRACE_ENDING, periodKey: entitlement.graceEndsAt.toISOString(),
        subject: 'Your FieldKeel trial grace period ends soon',
        text: `The trial grace period for ${context.name} ends ${date(entitlement.graceEndsAt)}. The workspace then becomes read-only. Complete activation through Billing to retain write access.`,
        inApp: { type: NOTIFICATION_TRIAL_GRACE_ENDING, title: 'Grace period ending soon', message: 'Your trial grace period ends soon. Check Billing.' },
      });
    }
    if (transitioned && entitlement.effectiveStatus === 'TRIAL_EXPIRED' && entitlement.graceEndsAt) {
      await this.queueLifecycle(tx, context, {
        kind: NOTIFICATION_TRIAL_EXPIRED, periodKey: entitlement.graceEndsAt.toISOString(),
        subject: 'Your FieldKeel trial has ended',
        text: `The ${plan} trial for ${context.name} ended on ${date(entitlement.trialEndsAt)}. Its ${TRIAL_GRACE_DAYS}-day grace period ended on ${date(entitlement.graceEndsAt)}. The workspace is now read-only. Your records are kept; you can still sign in and view history. Open Plan & Subscription to reactivate and Billing for payment instructions.`,
        platformSubject: `FieldKeel trial expired — ${context.name}`, ctaLabel: 'Reactivate workspace',
        inApp: { type: NOTIFICATION_TRIAL_EXPIRED, title: 'Trial expired', message: 'Your trial ended and the workspace is read-only.' },
      });
      // Preserve the existing separate read-only notification, but avoid a second equivalent email.
      await this.queueInApp(tx, context, {
        kind: NOTIFICATION_WORKSPACE_READ_ONLY, periodKey: `trial:${entitlement.graceEndsAt.toISOString()}`,
        inApp: { type: NOTIFICATION_WORKSPACE_READ_ONLY, title: 'Workspace read-only', message: 'This workspace is read-only until payment is confirmed.' },
      });
    }
    if (entitlement.effectiveStatus === 'ACTIVE' && entitlement.currentPeriodEnd) {
      for (const days of RENEWAL_REMINDER_DAYS) {
        if (days > 0 && isSameUtcDay(now, entitlement.currentPeriodEnd)) continue;
        if (days === 0 ? !isSameUtcDay(now, entitlement.currentPeriodEnd) : entitlement.daysUntilExpiration !== days) continue;
        await this.queueLifecycle(tx, context, {
          kind: `${NOTIFICATION_RENEWAL_PREFIX}${days}`, periodKey: entitlement.currentPeriodEnd.toISOString(),
          subject: days === 0 ? 'Your FieldKeel subscription renewal is due today' : 'Your FieldKeel subscription renewal is approaching',
          text: `${context.name} — ${plan}\nSubscription period ends: ${date(entitlement.currentPeriodEnd)}\nPlease arrange renewal through Billing using the instructions on your invoice, or contact the FieldKeel team. FieldKeel does not automatically charge a stored card. The existing ${PAID_GRACE_DAYS}-day renewal grace period ends ${date(entitlement.paidGraceEndsAt)}; write access continues during grace and becomes read-only afterward.`,
          ctaLabel: 'Open Billing', ctaUrl: this.billingLink(context.slug),
          ...(days === 7 ? { platformSubject: `FieldKeel subscription renewal approaching — ${context.name}` } : {}),
          inApp: { type: `${NOTIFICATION_RENEWAL_PREFIX}${days}`, title: days === 0 ? 'Renewal due today' : 'Renewal coming up', message: `Your subscription period ends ${date(entitlement.currentPeriodEnd)}.` },
        });
      }
    }
    if (transitioned && entitlement.effectiveStatus === 'PAID_GRACE' && entitlement.currentPeriodEnd) {
      await this.queueLifecycle(tx, context, {
        kind: NOTIFICATION_SUBSCRIPTION_EXPIRED, periodKey: entitlement.currentPeriodEnd.toISOString(),
        subject: 'Your FieldKeel subscription renewal grace period has started',
        text: `The ${plan} paid period for ${context.name} ended ${date(entitlement.currentPeriodEnd)}. Write access continues during the existing ${PAID_GRACE_DAYS}-day renewal grace period, through ${date(entitlement.paidGraceEndsAt)}. Renew through Billing to avoid read-only access.`,
        platformSubject: `FieldKeel renewal grace started — ${context.name}`,
        ctaLabel: 'Open Billing', ctaUrl: this.billingLink(context.slug),
      });
    }
    if (transitioned && entitlement.effectiveStatus === 'EXPIRED' && entitlement.paidGraceEndsAt) {
      await this.queueLifecycle(tx, context, {
        kind: NOTIFICATION_WORKSPACE_READ_ONLY, periodKey: `paid:${entitlement.paidGraceEndsAt.toISOString()}`,
        subject: 'Your FieldKeel subscription has expired',
        text: `${context.name} — ${plan}\nThe paid period ended ${date(entitlement.currentPeriodEnd)} and the ${PAID_GRACE_DAYS}-day renewal grace period ended ${date(entitlement.paidGraceEndsAt)}. The workspace is now read-only. Your records are kept and Billing remains available. Arrange renewal to reactivate write access.`,
        platformSubject: `FieldKeel subscription expired — ${context.name}`, ctaLabel: 'Reactivate workspace',
      });
    }
  }

  private async context(tx: Prisma.TransactionClient, organizationId: string, now = new Date()) {
    const subscription = await tx.subscription.findUniqueOrThrow({
      where: { organizationId }, include: { plan: true, organization: true },
    });
    const owners = await tx.organizationMember.findMany({
      where: { organizationId, status: MembershipStatus.ACTIVE, role: OrganizationRole.OWNER },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
    return {
      subscription, owners, organizationId,
      name: subscription.organization.name, slug: subscription.organization.slug,
      effectiveStatus: resolveEffectiveStatus({ ...subscription, storedStatus: subscription.status }, now),
    };
  }

  private async queueLifecycle(
    tx: Prisma.TransactionClient,
    context: Awaited<ReturnType<SubscriptionNotificationService['context']>>,
    input: {
      kind: string; periodKey: string; subject: string; text: string;
      ctaLabel?: string; ctaUrl?: string; platformSubject?: string;
      inApp?: { type: string; title: string; message: string };
    },
  ) {
    const { organizationId, subscription } = context;
    // Honor pre-upgrade org-level sent markers rather than replaying old Owner emails.
    const legacy = await tx.subscriptionNotification.findUnique({
      where: { organizationId_kind_periodKey: { organizationId, kind: input.kind, periodKey: input.periodKey } },
    });
    if (!legacy) {
      for (const owner of context.owners) {
        await this.delivery.enqueue(tx, {
          ...input, organizationId, to: owner.user.email, ownerUserId: owner.userId,
          periodKey: `${input.periodKey}:owner:${owner.userId}`,
          ctaLabel: input.ctaLabel ?? 'Plan & Subscription',
          ctaUrl: input.ctaUrl ?? this.planLink(context.slug),
        });
      }
      if (input.inApp) await this.queueInApp(tx, context, input);
    }
    if (input.platformSubject) {
      const currentStatus = context.effectiveStatus;
      await this.delivery.enqueue(tx, {
        organizationId, kind: `PLATFORM_${input.kind}`, periodKey: input.periodKey,
        to: this.salesEmail(), subject: input.platformSubject,
        text: [
          `Workspace: ${context.name}`, `Organization ID: ${organizationId}`, `Slug: ${context.slug}`,
          `Created: ${date(subscription.organization.createdAt)}`,
          ...context.owners.map((owner) => `Owner: ${owner.user.fullName} <${owner.user.email}>`),
          `Plan: ${subscription.plan.name}`, `Current status: ${currentStatus}`,
          `Trial started: ${date(subscription.trialStartedAt)}`, `Trial ends: ${date(subscription.trialEndsAt)}`,
          `Activated: ${date(subscription.activatedAt)}`,
          `Subscription period starts: ${date(subscription.currentPeriodStart)}`,
          `Subscription period ends: ${date(subscription.currentPeriodEnd)}`,
          '', input.text,
        ].join('\n'),
        ctaLabel: 'Open platform workspace', ctaUrl: `${this.webUrl()}/platform/organizations/${organizationId}`,
      });
    }
  }

  private async queueInApp(
    tx: Prisma.TransactionClient,
    context: Awaited<ReturnType<SubscriptionNotificationService['context']>>,
    input: { kind: string; periodKey: string; inApp?: { type: string; title: string; message: string } },
  ) {
    if (!input.inApp || !context.owners.length) return;
    const legacy = await tx.subscriptionNotification.findUnique({
      where: { organizationId_kind_periodKey: {
        organizationId: context.organizationId, kind: input.kind, periodKey: input.periodKey,
      } },
    });
    if (legacy) return;
    const claimed = await tx.subscriptionNotification.createMany({
      data: [{ organizationId: context.organizationId, kind: `IN_APP_${input.kind}`, periodKey: input.periodKey }],
      skipDuplicates: true,
    });
    if (!claimed.count) return;
    await this.notifications.notify({
      organizationId: context.organizationId, recipientUserIds: context.owners.map((owner) => owner.userId),
      ...input.inApp, relatedEntityType: 'Organization', relatedEntityId: context.organizationId,
      payload: { organizationSlug: context.slug }, dedupeUnread: true,
    }, tx);
  }

  private mailOwners(organizationId: string, input: {
    kind: string; periodKey: string; subject: string; text: string;
    inApp?: { type: string; title: string; message: string };
  }) {
    return this.prisma.$transaction(async (tx) => {
      await this.queueLifecycle(tx, await this.context(tx, organizationId), input);
    });
  }

  private deliver(input: {
    organizationId: string; kind: string; periodKey: string; to: string; subject: string; text: string;
  }) {
    return this.prisma.$transaction((tx) => this.delivery.enqueue(tx, {
      ...input, ctaLabel: 'Open platform workspace',
      ctaUrl: `${this.webUrl()}/platform/organizations/${input.organizationId}`,
    }));
  }

  private webUrl() { return this.config.get('WEB_URL', { infer: true }).replace(/\/+$/, ''); }
  private workspaceLink(slug: string) { return `${this.webUrl()}/app/${encodeURIComponent(slug)}`; }
  private planLink(slug: string) { return `${this.workspaceLink(slug)}/settings/plan-usage`; }
  private billingLink(slug: string) { return `${this.workspaceLink(slug)}/settings/billing`; }
}

function date(value: Date | null) {
  return value ? value.toISOString().replace('T', ' ').replace(/Z$/, ' UTC') : 'Not applicable';
}
function isSameUtcDay(a: Date, b: Date) { return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10); }
