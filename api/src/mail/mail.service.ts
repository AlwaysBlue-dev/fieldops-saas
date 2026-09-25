import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.js';
import {
  activationAckMail,
  emailVerificationMail,
  invitationMail,
  jobApprovedMail,
  jobAssignedMail,
  jobReturnedMail,
  overtimeDecisionMail,
  passwordResetMail,
  timesheetReturnedMail,
  trialEndingMail,
  trialExpiredMail,
  trialGraceMail,
  type MailContent,
} from './mail-templates.js';
import type { MailTransport } from './mail-transport.js';
import { ResendMailTransport } from './resend-mail.transport.js';
import { SmtpMailTransport } from './smtp-mail.transport.js';
import { PASSWORD_RESET_TTL_MINUTES } from '../common/constants.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: MailTransport;
  private readonly fromAddress: string;
  private readonly replyTo: string | undefined;

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {
    this.fromAddress =
      this.config.get('EMAIL_FROM', { infer: true }) ??
      'FieldKeel <no-reply@fieldkeel.local>';
    this.replyTo = this.config.get('EMAIL_REPLY_TO', { infer: true });
    this.transport = this.createTransport();
    this.logger.log(`Mail transport: ${this.transport.name}`);
  }

  private createTransport(): MailTransport {
    const raw = (
      this.config.get('EMAIL_PROVIDER', { infer: true }) ?? 'smtp'
    ).toLowerCase();
    const provider = raw === 'mailpit' ? 'smtp' : raw;
    if (provider === 'resend') {
      return new ResendMailTransport(
        this.config.get('RESEND_API_KEY', { infer: true }),
      );
    }
    if (provider === 'none') {
      return {
        name: 'none',
        send: async () => {
          this.logger.warn('EMAIL_PROVIDER=none; email skipped');
          return 'skipped';
        },
      };
    }
    return new SmtpMailTransport({
      host: this.config.get('SMTP_HOST', { infer: true }),
      port: this.config.get('SMTP_PORT', { infer: true }),
      secure: this.config.get('SMTP_SECURE', { infer: true }),
      user: this.config.get('SMTP_USER', { infer: true }),
      password: this.config.get('SMTP_PASSWORD', { infer: true }),
    });
  }

  appUrl() {
    return this.config.get('APP_URL', { infer: true });
  }

  async sendEmailVerification(to: string, rawToken: string) {
    const verifyUrl = `${this.appUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const content = emailVerificationMail({ verifyUrl, email: to });
    await this.dispatch({ to, content, logLabel: 'verification' });
  }

  async sendPasswordReset(to: string, rawToken: string) {
    const resetUrl = `${this.appUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const content = passwordResetMail({
      resetUrl,
      expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
    });
    await this.dispatch({ to, content, logLabel: 'password-reset' });
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
    const result = await this.transport.send({
      to: input.to,
      from: this.fromAddress,
      replyTo: this.replyTo,
      subject: input.content.subject,
      text: input.content.text,
      html: input.content.html,
    });
    if (result === 'failed') {
      this.logger.error(`Failed to send ${input.logLabel} email`);
    }
    return result;
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
