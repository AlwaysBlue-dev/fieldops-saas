import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { EnvironmentVariables } from '../config/env.js';
import {
  activationAckMail,
  emailVerificationMail,
  invitationMail,
  jobApprovedMail,
  jobAssignedMail,
  jobReturnedMail,
  overtimeDecisionMail,
  timesheetReturnedMail,
  trialEndingMail,
  trialExpiredMail,
  trialGraceMail,
  type MailContent,
} from './mail-templates.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {
    const host = this.config.get('SMTP_HOST', { infer: true });
    if (!host) {
      this.transport = null;
      return;
    }
    this.transport = createTransport({
      host,
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure: this.config.get('SMTP_SECURE', { infer: true }),
      auth: this.config.get('SMTP_USER', { infer: true })
        ? {
            user: this.config.get('SMTP_USER', { infer: true }),
            pass: this.config.get('SMTP_PASSWORD', { infer: true }),
          }
        : undefined,
    });
  }

  appUrl() {
    return this.config.get('APP_URL', { infer: true });
  }

  async sendEmailVerification(to: string, rawToken: string) {
    const verifyUrl = `${this.appUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const content = emailVerificationMail({ verifyUrl });
    await this.dispatch({ to, content, logLabel: 'verification' });
  }

  async sendOrganizationInvitation(input: {
    to: string;
    organizationName: string;
    role: string;
    rawToken: string;
  }) {
    const inviteUrl = `${this.appUrl()}/invite/${encodeURIComponent(input.rawToken)}`;
    const content = invitationMail({
      organizationName: input.organizationName,
      role: input.role,
      inviteUrl,
    });
    await this.dispatch({ to: input.to, content, logLabel: 'invitation' });
  }

  async sendJobAssigned(input: {
    to: string;
    recipientName: string;
    organizationName: string;
    orgSlug: string;
    jobNumber: string;
    jobTitle: string;
    scheduledStart: Date | null;
    expectedFinish: Date | null;
    timezone: string;
  }) {
    const jobUrl = `${this.appUrl()}/app/${input.orgSlug}/jobs`;
    const windowLabel = formatWindow(
      input.scheduledStart,
      input.expectedFinish,
      input.timezone,
    );
    const content = jobAssignedMail({
      recipientName: input.recipientName,
      organizationName: input.organizationName,
      jobNumber: input.jobNumber,
      jobTitle: input.jobTitle,
      jobUrl,
      windowLabel,
    });
    await this.dispatch({ to: input.to, content, logLabel: 'job-assigned' });
  }

  async sendJobReturned(input: {
    to: string;
    recipientName: string;
    organizationName: string;
    orgSlug: string;
    jobNumber: string;
    jobTitle: string;
    jobId: string;
    reason: string;
  }) {
    const content = jobReturnedMail({
      recipientName: input.recipientName,
      organizationName: input.organizationName,
      jobNumber: input.jobNumber,
      jobTitle: input.jobTitle,
      jobUrl: `${this.appUrl()}/app/${input.orgSlug}/jobs/${input.jobId}`,
      reason: input.reason,
    });
    await this.dispatch({ to: input.to, content, logLabel: 'job-returned' });
  }

  async sendJobApproved(input: {
    to: string;
    recipientName: string;
    organizationName: string;
    orgSlug: string;
    jobNumber: string;
    jobTitle: string;
    jobId: string;
  }) {
    const content = jobApprovedMail({
      recipientName: input.recipientName,
      organizationName: input.organizationName,
      jobNumber: input.jobNumber,
      jobTitle: input.jobTitle,
      jobUrl: `${this.appUrl()}/app/${input.orgSlug}/jobs/${input.jobId}`,
    });
    await this.dispatch({ to: input.to, content, logLabel: 'job-approved' });
  }

  async sendOvertimeDecision(input: {
    to: string;
    recipientName: string;
    organizationName: string;
    orgSlug: string;
    decision: 'APPROVED' | 'REJECTED';
    jobNumber: string | null;
    comment?: string | null;
  }) {
    const content = overtimeDecisionMail({
      recipientName: input.recipientName,
      organizationName: input.organizationName,
      decision: input.decision,
      jobNumber: input.jobNumber,
      timeUrl: `${this.appUrl()}/app/${input.orgSlug}/time`,
      comment: input.comment,
    });
    await this.dispatch({ to: input.to, content, logLabel: 'overtime-decision' });
  }

  async sendTimesheetReturned(input: {
    to: string;
    recipientName: string;
    organizationName: string;
    orgSlug: string;
    workDate: string;
    reason: string;
  }) {
    const content = timesheetReturnedMail({
      recipientName: input.recipientName,
      organizationName: input.organizationName,
      workDate: input.workDate,
      timeUrl: `${this.appUrl()}/app/${input.orgSlug}/time`,
      reason: input.reason,
    });
    await this.dispatch({ to: input.to, content, logLabel: 'timesheet-returned' });
  }

  async sendTrialEnding(input: {
    to: string;
    organizationName: string;
    orgSlug: string;
    daysRemaining: number;
  }) {
    const content = trialEndingMail({
      organizationName: input.organizationName,
      daysRemaining: input.daysRemaining,
      billingUrl: `${this.appUrl()}/app/${input.orgSlug}/settings/billing`,
    });
    return this.dispatch({ to: input.to, content, logLabel: 'trial-ending' });
  }

  async sendTrialGrace(input: {
    to: string;
    organizationName: string;
    orgSlug: string;
    graceDaysRemaining: number;
  }) {
    const content = trialGraceMail({
      organizationName: input.organizationName,
      graceDaysRemaining: input.graceDaysRemaining,
      billingUrl: `${this.appUrl()}/app/${input.orgSlug}/settings/billing`,
    });
    return this.dispatch({ to: input.to, content, logLabel: 'trial-grace' });
  }

  async sendTrialExpired(input: {
    to: string;
    organizationName: string;
    orgSlug: string;
  }) {
    const content = trialExpiredMail({
      organizationName: input.organizationName,
      billingUrl: `${this.appUrl()}/app/${input.orgSlug}/settings/billing`,
    });
    return this.dispatch({ to: input.to, content, logLabel: 'trial-expired' });
  }

  async sendActivationAck(input: {
    to: string;
    recipientName: string;
    organizationName: string;
    orgSlug: string;
  }) {
    const content = activationAckMail({
      recipientName: input.recipientName,
      organizationName: input.organizationName,
      billingUrl: `${this.appUrl()}/app/${input.orgSlug}/settings/billing`,
    });
    await this.dispatch({ to: input.to, content, logLabel: 'activation-ack' });
  }

  async sendText(input: { to: string; subject: string; text: string }): Promise<
    'sent' | 'skipped' | 'failed'
  > {
    return this.dispatch({
      to: input.to,
      content: {
        subject: input.subject,
        text: input.text,
        html: `<pre style="font-family:inherit;white-space:pre-wrap;">${escapeBasic(input.text)}</pre>`,
      },
      logLabel: 'text',
    });
  }

  private async dispatch(input: {
    to: string;
    content: MailContent;
    logLabel: string;
  }): Promise<'sent' | 'skipped' | 'failed'> {
    const from =
      this.config.get('EMAIL_FROM', { infer: true }) ??
      'FieldOps Cloud <no-reply@fieldops.local>';
    if (!this.transport) {
      this.logger.warn(`SMTP not configured; ${input.logLabel} email skipped`);
      return 'skipped';
    }
    try {
      await this.transport.sendMail({
        from,
        to: input.to,
        subject: input.content.subject,
        text: input.content.text,
        html: input.content.html,
      });
      return 'sent';
    } catch (error) {
      this.logger.error(
        `Failed to send ${input.logLabel} email`,
        error instanceof Error ? error.stack : String(error),
      );
      return 'failed';
    }
  }
}

function formatWindow(
  start: Date | null,
  end: Date | null,
  timeZone: string,
): string | null {
  if (!start && !end) return null;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    if (start && end) return `${fmt.format(start)} – ${fmt.format(end)}`;
    if (start) return fmt.format(start);
    return fmt.format(end!);
  } catch {
    return start?.toISOString() ?? end?.toISOString() ?? null;
  }
}

function escapeBasic(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
