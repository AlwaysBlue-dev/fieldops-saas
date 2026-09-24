import { Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { MailPayload, MailSendResult, MailTransport } from './mail-transport.js';

export class SmtpMailTransport implements MailTransport {
  readonly name = 'smtp';
  private readonly logger = new Logger(SmtpMailTransport.name);
  private readonly transport: Transporter | null;

  constructor(input: {
    host?: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
  }) {
    if (!input.host) {
      this.transport = null;
      return;
    }
    this.transport = createTransport({
      host: input.host,
      port: input.port,
      secure: input.secure,
      auth: input.user
        ? { user: input.user, pass: input.password }
        : undefined,
    });
  }

  async send(payload: MailPayload): Promise<MailSendResult> {
    if (!this.transport) {
      this.logger.warn('SMTP not configured; email skipped');
      return 'skipped';
    }
    try {
      await this.transport.sendMail({
        from: payload.from,
        to: payload.to,
        replyTo: payload.replyTo,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      });
      return 'sent';
    } catch (error) {
      this.logger.error(
        'SMTP send failed',
        error instanceof Error ? error.message : String(error),
      );
      return 'failed';
    }
  }
}
