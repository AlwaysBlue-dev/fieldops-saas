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
  NOTIFICATION_WORKSPACE_READ_ONLY,
  RENEWAL_REMINDER_DAYS,
  TRIAL_DAYS,
  TRIAL_ENDING_SOON_DAYS,
  TRIAL_GRACE_DAYS,
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
        'Activate this workspace from platform administration. Online payment is not available.',
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
        'Renew this workspace from platform administration. Online payment is not available.',
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
        'Assign a new plan from platform administration. Online payment is not available.',
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
        `Current period ends ${input.currentPeriodEnd.toISOString().slice(0, 10)}.`,
        'There is no in-app checkout. Contact FieldOps when you are ready to renew.',
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
        `The new period ends ${input.currentPeriodEnd.toISOString().slice(0, 10)}.`,
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
    if (
      entitlement.effectiveStatus === 'TRIALING' &&
      entitlement.trialDaysRemaining > 0 &&
      entitlement.trialDaysRemaining <= TRIAL_ENDING_SOON_DAYS &&
      entitlement.trialEndsAt
    ) {
      await this.mailOwners(organizationId, {
        kind: NOTIFICATION_TRIAL_ENDING,
        periodKey: entitlement.trialEndsAt.toISOString(),
        subject: 'Your FieldOps Cloud trial is ending soon',
        text: [
          `The FieldOps Cloud trial for ${organizationName} ends in ${entitlement.trialDaysRemaining} day${entitlement.trialDaysRemaining === 1 ? '' : 's'}.`,
          '',
          'Request activation from Plan & Subscription. No credit card is required in the product.',
        ].join('\n'),
        template: async (to) =>
          this.mail.sendTrialEnding({
            to,
            organizationName,
            orgSlug: organizationSlug,
            daysRemaining: entitlement.trialDaysRemaining,
          }),
        inApp: {
          type: NOTIFICATION_TRIAL_EXPIRING,
          title: 'Trial ending soon',
          message: `Your trial ends in ${entitlement.trialDaysRemaining} day${entitlement.trialDaysRemaining === 1 ? '' : 's'}.`,
        },
      });
    }

    if (entitlement.effectiveStatus === 'GRACE' && entitlement.graceEndsAt) {
      await this.mailOwners(organizationId, {
        kind: NOTIFICATION_TRIAL_GRACE,
        periodKey: entitlement.graceEndsAt.toISOString(),
        subject: 'Your FieldOps Cloud trial grace period is active',
        text: [
          `The trial for ${organizationName} has ended. You are in a grace window.`,
          '',
          'Request activation soon to keep full write access.',
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
          title: 'Trial grace period',
          message: 'Your trial ended. Activate soon to keep write access.',
        },
      });
    }

    if (entitlement.effectiveStatus === 'TRIAL_EXPIRED' && entitlement.graceEndsAt) {
      await this.mailOwners(organizationId, {
        kind: NOTIFICATION_TRIAL_EXPIRED,
        periodKey: entitlement.graceEndsAt.toISOString(),
        subject: 'Your FieldOps Cloud trial has ended',
        text: [
          `The FieldOps Cloud trial for ${organizationName} has ended. The workspace is read-only.`,
          '',
          'Existing records are kept. Request activation to restore writes.',
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
          `${organizationName} is now read-only. You can still sign in and view historical work.`,
          '',
          'Request activation from Plan & Subscription to restore the workspace.',
        ].join('\n'),
        inApp: {
          type: NOTIFICATION_WORKSPACE_READ_ONLY,
          title: 'Workspace read-only',
          message: 'This workspace is read-only until activation.',
        },
      });
    }

    if (
      entitlement.effectiveStatus === 'ACTIVE' &&
      entitlement.currentPeriodEnd &&
      entitlement.daysUntilExpiration > 0
    ) {
      for (const days of RENEWAL_REMINDER_DAYS) {
        if (entitlement.daysUntilExpiration <= days) {
          await this.mailOwners(organizationId, {
            kind: `${NOTIFICATION_RENEWAL_PREFIX}${days}`,
            periodKey: entitlement.currentPeriodEnd.toISOString(),
            subject: `Your FieldOps Cloud subscription renews in ${days} day${days === 1 ? '' : 's'}`,
            text: [
              `The paid period for ${organizationName} ends in ${entitlement.daysUntilExpiration} day${entitlement.daysUntilExpiration === 1 ? '' : 's'}.`,
              '',
              'Request renewal from Plan & Subscription. Payment is arranged with FieldOps outside the product.',
            ].join('\n'),
          });
        }
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
          'Existing records are kept. Request renewal to restore writes.',
        ].join('\n'),
      });
    }
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
