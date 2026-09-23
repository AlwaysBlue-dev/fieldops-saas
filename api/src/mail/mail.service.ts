import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { EnvironmentVariables } from '../config/env.js';

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

  async sendEmailVerification(to: string, rawToken: string) {
    const appUrl = this.config.get('APP_URL', { infer: true });
    const from =
      this.config.get('EMAIL_FROM', { infer: true }) ??
      'FieldOps Cloud <no-reply@fieldops.local>';
    const verifyUrl = `${appUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;
    const text = `Verify your FieldOps Cloud email:\n${verifyUrl}\nThis link expires in 24 hours.`;

    if (!this.transport) {
      this.logger.warn(`SMTP not configured; verification email for ${to} skipped`);
      return;
    }

    try {
      await this.transport.sendMail({
        from,
        to,
        subject: 'Verify your FieldOps Cloud email',
        text,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send verification email',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async sendOrganizationInvitation(input: {
    to: string;
    organizationName: string;
    role: string;
    rawToken: string;
  }) {
    const appUrl = this.config.get('APP_URL', { infer: true });
    const from =
      this.config.get('EMAIL_FROM', { infer: true }) ??
      'FieldOps Cloud <no-reply@fieldops.local>';
    const inviteUrl = `${appUrl}/invite/${encodeURIComponent(input.rawToken)}`;
    const text = [
      `You have been invited to join ${input.organizationName} on FieldOps Cloud as ${input.role.replaceAll('_', ' ').toLowerCase()}.`,
      '',
      `Accept the invitation:`,
      inviteUrl,
      '',
      'This link expires in 7 days and can be used once.',
    ].join('\n');

    if (!this.transport) {
      this.logger.warn(`SMTP not configured; invitation email for ${input.to} skipped`);
      return;
    }

    try {
      await this.transport.sendMail({
        from,
        to: input.to,
        subject: `Join ${input.organizationName} on FieldOps Cloud`,
        text,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send organization invitation',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async sendActivationRequest(input: {
    to: string;
    organizationName: string;
    organizationId: string;
    organizationSlug: string;
    requesterName: string;
    requesterEmail: string;
    message: string | null;
    trialDays: number;
    graceDays: number;
  }) {
    const from =
      this.config.get('EMAIL_FROM', { infer: true }) ??
      'FieldOps Cloud <no-reply@fieldops.local>';
    const text = [
      `Activation requested for ${input.organizationName}.`,
      '',
      `Organization ID: ${input.organizationId}`,
      `Slug: ${input.organizationSlug}`,
      `Requested by: ${input.requesterName} <${input.requesterEmail}>`,
      `Trial policy: ${input.trialDays} days + ${input.graceDays} days grace.`,
      '',
      input.message ? `Message:\n${input.message}` : 'No message was provided.',
      '',
      'Activate this workspace from the platform admin API. Online payment is not available.',
    ].join('\n');

    if (!this.transport) {
      this.logger.warn(
        `SMTP not configured; activation request email for ${input.organizationName} skipped`,
      );
      return;
    }

    try {
      await this.transport.sendMail({
        from,
        to: input.to,
        subject: `Activation requested: ${input.organizationName}`,
        text,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send activation request email',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
