import { INVOICE_NUMBER_PAD, INVOICE_NUMBER_PREFIX } from '../common/constants.js';
import type { Prisma } from '../generated/prisma/client.js';

export function formatInvoiceNumber(year: number, sequence: number) {
  return `${INVOICE_NUMBER_PREFIX}-${year}-${String(sequence).padStart(INVOICE_NUMBER_PAD, '0')}`;
}

export async function nextInvoiceNumber(tx: Prisma.TransactionClient, now: Date) {
  const year = now.getUTCFullYear();
  const existing = await tx.platformCounter.findUnique({
    where: { key_year: { key: 'invoice', year } },
  });
  if (!existing) {
    try {
      await tx.platformCounter.create({
        data: { key: 'invoice', year, next: 2 },
      });
      return formatInvoiceNumber(year, 1);
    } catch {
      const raced = await tx.platformCounter.update({
        where: { key_year: { key: 'invoice', year } },
        data: { next: { increment: 1 } },
      });
      return formatInvoiceNumber(year, raced.next - 1);
    }
  }
  const updated = await tx.platformCounter.update({
    where: { key_year: { key: 'invoice', year } },
    data: { next: { increment: 1 } },
  });
  return formatInvoiceNumber(year, updated.next - 1);
}
