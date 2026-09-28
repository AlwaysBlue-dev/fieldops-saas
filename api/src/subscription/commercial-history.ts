import type { Prisma } from '../generated/prisma/client.js';

export async function hasCommercialActivation(
  tx: Pick<Prisma.TransactionClient, 'subscription' | 'invoice' | 'auditLog'>,
  organizationId: string,
) {
  const subscription = await tx.subscription.findUnique({ where: { organizationId } });
  // Free-trial dates alone are deliberately not commercial activation evidence.
  if (subscription && (subscription.activatedAt || subscription.currentPeriodStart ||
    subscription.currentPeriodEnd || ['ACTIVE', 'PAID_GRACE', 'EXPIRED'].includes(subscription.status))) return true;
  const paid = await tx.invoice.findFirst({
    where: { organizationId, OR: [{ paidAt: { not: null } }, { paymentVerifiedAt: { not: null } }, { status: 'PAID' }] },
    select: { id: true },
  });
  if (paid) return true;
  return Boolean(await tx.auditLog.findFirst({
    where: { organizationId, action: { in: [
      'ORGANIZATION_ACTIVATED', 'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_RENEWED',
      'SUBSCRIPTION_PERIOD_SET', 'INVOICE_PAID', 'invoice.payment_verified',
    ] } },
    select: { id: true },
  }));
}
