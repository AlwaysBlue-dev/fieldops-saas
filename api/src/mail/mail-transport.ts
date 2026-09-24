export type MailPayload = {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
};

export type MailSendResult = 'sent' | 'skipped' | 'failed';

export interface MailTransport {
  readonly name: string;
  send(payload: MailPayload): Promise<MailSendResult>;
}
