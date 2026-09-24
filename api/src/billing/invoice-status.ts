import type { InvoiceStatus } from '../generated/prisma/client.js';

/** Customer-facing invoice status labels (never expose raw enums unnecessarily). */
export function invoiceStatusLabel(status: InvoiceStatus | string): string {
  switch (status) {
    case 'DRAFT':
    case 'PREPARING':
      return 'Invoice being prepared';
    case 'ISSUED':
      return 'Payment due';
    case 'PAYMENT_REPORTED':
      return 'Payment awaiting verification';
    case 'PAID':
      return 'Paid';
    case 'OVERDUE':
      return 'Overdue';
    case 'VOID':
      return 'Voided';
    default:
      return String(status).replaceAll('_', ' ');
  }
}

export function canShowPayInvoice(
  status: InvoiceStatus | string,
  paymentUrl: string | null | undefined,
): boolean {
  return (
    Boolean(paymentUrl) &&
    (status === 'ISSUED' || status === 'OVERDUE')
  );
}

export function assertHttpsPaymentUrl(raw: string): string {
  const url = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Enter a valid secure payment URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Payment links must use https://');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Payment links must not include credentials.');
  }
  return parsed.toString();
}
