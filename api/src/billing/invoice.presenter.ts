import { InvoiceStatus } from '../generated/prisma/client.js';
import { formatCentsUsd } from '../subscription/plan-catalog.js';

export function effectiveInvoiceStatus(
  status: InvoiceStatus,
  dueAt: Date | null,
  now: Date,
) {
  if (
    status === InvoiceStatus.ISSUED &&
    dueAt &&
    now.getTime() > dueAt.getTime()
  ) {
    return InvoiceStatus.OVERDUE;
  }
  return status;
}

export function serializeInvoice(
  invoice: {
    id: string;
    invoiceNumber: string;
    organizationId: string;
    subscriptionId: string | null;
    planId: string;
    type: string;
    status: InvoiceStatus;
    currency: string;
    subtotalCents: number;
    totalCents: number;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
    issuedAt: Date | null;
    dueAt: Date | null;
    paidAt: Date | null;
    customerName: string;
    customerBillingEmail: string;
    paymentInstructionsSnapshot: string | null;
    internalNotes?: string | null;
    createdAt: Date;
    plan?: { code: string; name: string };
    organization?: { name: string; slug: string };
    paymentNotices?: Array<{
      id: string;
      reference: string | null;
      message: string | null;
      createdAt: Date;
      submittedBy?: { fullName: string; email: string };
    }>;
  },
  options: {
    now: Date;
    includeInstructions: boolean;
    includeInternal: boolean;
  },
) {
  const status = effectiveInvoiceStatus(invoice.status, invoice.dueAt, options.now);
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    organizationId: invoice.organizationId,
    subscriptionId: invoice.subscriptionId,
    planId: invoice.planId,
    type: invoice.type,
    status,
    storedStatus: invoice.status,
    currency: invoice.currency,
    subtotalCents: invoice.subtotalCents,
    totalCents: invoice.totalCents,
    amountLabel: `${formatCentsUsd(invoice.totalCents)} ${invoice.currency}`,
    billingPeriodStart: invoice.billingPeriodStart.toISOString(),
    billingPeriodEnd: invoice.billingPeriodEnd.toISOString(),
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    dueAt: invoice.dueAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    customerName: invoice.customerName,
    customerBillingEmail: invoice.customerBillingEmail,
    paymentInstructions: options.includeInstructions
      ? invoice.paymentInstructionsSnapshot
      : null,
    internalNotes: options.includeInternal ? (invoice.internalNotes ?? null) : null,
    createdAt: invoice.createdAt.toISOString(),
    plan: invoice.plan ?? null,
    organization: invoice.organization ?? null,
    paymentNotices: options.includeInternal
      ? (invoice.paymentNotices ?? []).map((row) => ({
          id: row.id,
          reference: row.reference,
          message: row.message,
          createdAt: row.createdAt.toISOString(),
          submittedBy: row.submittedBy ?? null,
        }))
      : undefined,
  };
}
