import { Logger } from '@nestjs/common';
import type { MailPayload, MailSendResult, MailTransport } from './mail-transport.js';

/**
 * HTTP transport for Resend (https://resend.com).
 * Uses fetch — no SDK dependency. API key never logged.
 */
export class ResendMailTransport implements MailTransport {
  readonly name = 'resend';
  private readonly logger = new Logger(ResendMailTransport.name);

  constructor(
    private readonly apiKey: string | undefined,
    private readonly endpoint = 'https://api.resend.com/emails',
  ) {}

  async send(payload: MailPayload): Promise<MailSendResult> {
    if (!this.apiKey) {
      this.logger.warn('RESEND_API_KEY not configured; email skipped');
      return 'skipped';
    }
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: payload.from,
          to: [payload.to],
          reply_to: payload.replyTo,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
        }),
      });
      if (!response.ok) {
        const status = response.status;
        this.logger.error(`Resend send failed with HTTP ${status}`);
        return 'failed';
      }
      return 'sent';
    } catch (error) {
      this.logger.error(
        'Resend send failed',
        error instanceof Error ? error.message : String(error),
      );
      return 'failed';
    }
  }
}
