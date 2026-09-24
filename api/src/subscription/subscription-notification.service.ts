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
  TRIAL_DAYS,
  TRIAL_GRACE_DAYS,
  TRIAL_REMINDER_DAYS,
} from '../common/constants.js';
import type { EnvironmentVariables } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MembershipStatus, OrganizationRole } from '../generated/prisma/client.js';
import type { Entitlement } from './entitlement.js';

@Injectable()
export class SubscriptionNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
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

    await this.notifications.notify({
      organizationId: input.organizationId,
      recipientUserIds: [input.requesterUserId],
      type: NOTIFICATION_ACTIVATION_ACK,
      title: 'Activation request received',
      message: `FieldOps received your activation request for ${input.organizationName}.`,
      relatedEntityType: 'Organization',
      relatedEntityId: input.organizationId,
      payload: { organizationSlug: input.organizationSlug },
      dedupeUnread: true,
    });
    await this.mail.sendActivationAck({
      to: input.requesterEmail,
      recipientName: input.requesterName,
      organizationName: input.organizationName,
      orgSlug: input.organizationSlug,
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
      message: `FieldOps received your plan change request for ${input.organizationName}.`,
      relatedEntityType: 'Organization',
      relatedEntityId: input.organizationId,
      payload: { organizationSlug: input.organizationSlug },
      dedupeUnread: true,
    });
  }

  async sendActivated(input: {
    organizationId: string;
    organizationName: string;
    planName: string;
    currentPeriodEnd: Date;
  }) {
    await this.mailOwners(input.organizationId, {
      kind: NOTIFICATION_SUBSCRIPTION_ACTIVATED,
      periodKey: input.currentPeriodEnd.toISOString(),
      subject: 'Your FieldOps Cloud subscription is active',
      text: [
        `The ${input.planName} subscription for ${input.organizationName} is now active.`,
        '',
        `Active through ${input.currentPeriodEnd.toISOString().slice(0, 10)}.`,
      ].join('\n'),
      inApp: {
        type: NOTIFICATION_SUBSCRIPTION_ACTIVATED,
        title: 'Subscription active',
        message: `The ${input.planName} plan is now active.`,
      },
    });
  }

  async sendRenewed(input: {
    organizationId: string;
    organizationName: string;
    planName: string;
    currentPeriodEnd: Date;
  }) {
    await this.mailOwners(input.organizationId, {
      kind: NOTIFICATION_SUBSCRIPTION_RENEWED,
      periodKey: input.currentPeriodEnd.toISOString(),
      subject: 'Your FieldOps Cloud subscription was renewed',
      text: [
        `The ${input.planName} subscription for ${input.organizationName} was renewed.`,
        '',
        `Active through ${input.currentPeriodEnd.toISOString().slice(0, 10)}.`,
      ].join('\n'),
      inApp: {
        type: NOTIFICATION_SUBSCRIPTION_RENEWED,
        title: 'Subscription renewed',
        message: `The ${input.planName} plan was renewed.`,
      },
    });
  }

  async reconcileEntitlement(
    organizationId: string,
    organizationName: string,
    organizationSlug: string,
    entitlement: Entitlement,
  ) {
    const billingUrl = this.billingLink(organizationSlug);

    const now = new Date();
    if (
      entitlement.effectiveStatus === 'TRIALING' &&
      entitlement.trialEndsAt &&
      entitlement.trialDaysRemaining >= 0
    ) {
      for (const days of TRIAL_REMINDER_DAYS) {
        if (days === 0) {
          if (!isSameUtcDay(now, entitlement.trialEndsAt)) continue;
        } else if (entitlement.trialDaysRemaining !== days) {
          continue;
        }
        const dayLabel =
          days === 0
            ? 'today'
            : `in ${days} day${days === 1 ? '' : 's'}`;
        await this.mailOwners(organizationId, {
          kind: `${NOTIFICATION_TRIAL_REMINDER_PREFIX}${days}`,
          periodKey: entitlement.trialEndsAt.toISOString(),
          subject: 'Your FieldOps Cloud trial ends soon',
          text: [
            `Your Professional trial for ${organizationName} ends ${dayLabel}.`,
            '',
            'An activation invoice will be available in Billing before your trial/grace period ends.',
            'FieldOps Cloud does not automatically charge a card.',
            '',
            billingUrl,
          ].join('\n'),
          template: async (to) =>
            this.mail.sendTrialEnding({
              to,
              organizationName,
              orgSlug: organizationSlug,
              daysRemaining: Math.max(days, 1),
            }),
          inApp: {
            type: days <= 1 ? NOTIFICATION_TRIAL_EXPIRING : NOTIFICATION_TRIAL_ENDING,
            title: days === 0 ? 'Trial ends today' : 'Trial ending soon',
            message:
              days === 0
                ? 'Your Professional trial ends today.'
                : `Your Professional trial ends in ${days} day${days === 1 ? '' : 's'}.`,
          },
        });
      }
    }

    if (entitlement.effectiveStatus === 'GRACE' && entitlement.graceEndsAt) {
      await this.mailOwners(organizationId, {
        kind: NOTIFICATION_TRIAL_GRACE,
        periodKey: entitlement.graceEndsAt.toISOString(),
        subject: 'Your FieldOps Cloud trial grace period has started',
        text: [
          `The trial for ${organizationName} has ended. Your grace period has started.`,
          '',
          'An activation invoice will be available in Billing before your grace period ends.',
          billingUrl,
        ].join('\n'),
        template: async (to) =>
          this.mail.sendTrialGrace({
            to,
            organizationName,
            orgSlug: organizationSlug,
            graceDaysRemaining: Math.max(entitlement.graceDaysRemaining, 1),
          }),
        inApp: {
          type: NOTIFICATION_TRIAL_GRACE,
          title: 'Trial grace period started',
          message: 'Your trial ended. Check Billing for your activation invoice.',
        },
      });

      if (entitlement.graceDaysRemaining === 1) {
        await this.mailOwners(organizationId, {
          kind: NOTIFICATION_TRIAL_GRACE_ENDING,
          periodKey: entitlement.graceEndsAt.toISOString(),
          subject: 'Your FieldOps Cloud trial grace period ends soon',
          text: [
            `The trial grace period for ${organizationName} ends soon.`,
            '',
            'Pay your activation invoice in Billing to keep write access.',
            billingUrl,
          ].join('\n'),
          inApp: {
            type: NOTIFICATION_TRIAL_GRACE_ENDING,
            title: 'Grace period ending soon',
            message: 'Your trial grace period ends soon. Check Billing.',
          },
        });
      }
    }

    if (entitlement.effectiveStatus === 'TRIAL_EXPIRED' && entitlement.graceEndsAt) {
      await this.mailOwners(organizationId, {
        kind: NOTIFICATION_TRIAL_EXPIRED,
        periodKey: entitlement.graceEndsAt.toISOString(),
        subject: 'Your FieldOps Cloud trial has ended',
        text: [
          `The FieldOps Cloud trial for ${organizationName} has ended. The workspace is read-only.`,
          '',
          'Existing records are kept. Complete payment from Billing to restore writes.',
          billingUrl,
        ].join('\n'),
        template: async (to) =>
          this.mail.sendTrialExpired({
            to,
            organizationName,
            orgSlug: organizationSlug,
          }),
        inApp: {
          type: NOTIFICATION_TRIAL_EXPIRED,
          title: 'Trial expired',
          message: 'Your trial ended and the workspace is read-only.',
        },
      });
      await this.mailOwners(organizationId, {
        kind: NOTIFICATION_WORKSPACE_READ_ONLY,
        periodKey: `trial:${entitlement.graceEndsAt.toISOString()}`,
        subject: 'Your FieldOps Cloud workspace is read-only',
        text: [
          `${organizationName} is now read-only. You can still sign in, view history, and open Billing.`,
          '',
          billingUrl,
        ].join('\n'),
        inApp: {
          type: NOTIFICATION_WORKSPACE_READ_ONLY,
          title: 'Workspace read-only',
          message: 'This workspace is read-only until payment is confirmed.',
        },
      });
    }

    if (
      entitlement.effectiveStatus === 'ACTIVE' &&
      entitlement.currentPeriodEnd &&
      entitlement.daysUntilExpiration >= 0
    ) {
      for (const days of RENEWAL_REMINDER_DAYS) {
        if (days === 0) {
          if (!isSameUtcDay(now, entitlement.currentPeriodEnd)) continue;
        } else if (entitlement.daysUntilExpiration !== days) {
          continue;
        }
        const renewDate = entitlement.currentPeriodEnd.toISOString().slice(0, 10);
        await this.mailOwners(organizationId, {
          kind: `${NOTIFICATION_RENEWAL_PREFIX}${days}`,
          periodKey: entitlement.currentPeriodEnd.toISOString(),
          subject:
            days === 0
              ? 'Your FieldOps Cloud subscription renews today'
              : `Your FieldOps Cloud subscription renews in ${days} day${days === 1 ? '' : 's'}`,
          text: [
            `Your FieldOps Cloud subscription renews on ${renewDate}.`,
            '',
            'Your renewal invoice will be available in Billing.',
            'FieldOps Cloud does not automatically charge a stored card.',
            '',
            billingUrl,
          ].join('\n'),
          inApp: {
            type: `${NOTIFICATION_RENEWAL_PREFIX}${days}`,
            title: days === 0 ? 'Renewal due today' : 'Renewal coming up',
            message: `Your subscription renews on ${renewDate}.`,
          },
        });
      }
    }

    if (entitlement.effectiveStatus === 'PAID_GRACE' && entitlement.currentPeriodEnd) {
      await this.mailOwners(organizationId, {
        kind: NOTIFICATION_SUBSCRIPTION_EXPIRED,
        periodKey: entitlement.currentPeriodEnd.toISOString(),
        subject: 'Your FieldOps Cloud subscription has expired',
        text: [
          `The paid period for ${organizationName} has ended.`,
          `Renew within ${entitlement.graceDaysRemaining} day${entitlement.graceDaysRemaining === 1 ? '' : 's'} to avoid the workspace becoming read-only.`,
          '',
          'Your renewal invoice is available in Billing.',
          billingUrl,
        ].join('\n'),
      });
    }

    if (entitlement.effectiveStatus === 'EXPIRED' && entitlement.paidGraceEndsAt) {
      await this.mailOwners(organizationId, {
        kind: NOTIFICATION_WORKSPACE_READ_ONLY,
        periodKey: `paid:${entitlement.paidGraceEndsAt.toISOString()}`,
        subject: 'Your FieldOps Cloud workspace is read-only',
        text: [
          `${organizationName} is now read-only because the renewal grace period ended.`,
          '',
          'Existing records are kept. You can still open Billing to pay and restore writes.',
          billingUrl,
        ].join('\n'),
      });
    }
  }

  private billingLink(orgSlug: string) {
    const webUrl = this.config.get('WEB_URL', { infer: true }) ?? 'http://localhost:3000';
    return `${webUrl}/app/${orgSlug}/settings/billing`;
  }

  private async mailOwners(
    organizationId: string,
    input: {
      kind: string;
      periodKey: string;
      subject: string;
      text: string;
      template?: (to: string) => Promise<'sent' | 'skipped' | 'failed'>;
      inApp?: { type: string; title: string; message: string };
    },
  ) {
    const owners = await this.prisma.organizationMember.findMany({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
        role: OrganizationRole.OWNER,
      },
      include: { user: true },
    });
    const recipients = owners.map((row) => row.user.email).filter(Boolean);
    if (recipients.length === 0) {
      return;
    }
    const delivered = await this.deliver({
      organizationId,
      kind: input.kind,
      periodKey: input.periodKey,
      to: recipients.join(', '),
      subject: input.subject,
      text: input.text,
      template: input.template
        ? async () => {
            let anySent = false;
            let anyFailed = false;
            for (const to of recipients) {
              const result = await input.template!(to);
              if (result === 'sent' || result === 'skipped') anySent = true;
              if (result === 'failed') anyFailed = true;
            }
            if (anyFailed && !anySent) return 'failed';
            return anySent ? 'sent' : 'skipped';
          }
        : undefined,
    });
    if (delivered && input.inApp) {
      await this.notifications.notify({
        organizationId,
        recipientUserIds: owners.map((row) => row.userId),
        type: input.inApp.type,
        title: input.inApp.title,
        message: input.inApp.message,
        relatedEntityType: 'Organization',
        relatedEntityId: organizationId,
        dedupeUnread: true,
      });
    }
  }

  private async deliver(input: {
    organizationId: string;
    kind: string;
    periodKey: string;
    to: string;
    subject: string;
    text: string;
    template?: () => Promise<'sent' | 'skipped' | 'failed'>;
  }) {
    const existing = await this.prisma.subscriptionNotification.findUnique({
      where: {
        organizationId_kind_periodKey: {
          organizationId: input.organizationId,
          kind: input.kind,
          periodKey: input.periodKey,
        },
      },
    });
    if (existing) {
      return false;
    }

    const result = input.template
      ? await input.template()
      : await this.mail.sendText({
          to: input.to,
          subject: input.subject,
          text: input.text,
        });
    if (result === 'failed') {
      return false;
    }

    try {
      await this.prisma.subscriptionNotification.create({
        data: {
          organizationId: input.organizationId,
          kind: input.kind,
          periodKey: input.periodKey,
        },
      });
    } catch {
      return false;
    }
    return true;
  }
}

function isSameUtcDay(a: Date, b: Date) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}
