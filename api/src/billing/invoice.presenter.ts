import { InvoiceStatus } from '../generated/prisma/client.js';
import { formatCentsUsd } from '../subscription/plan-catalog.js';
import {
  canShowPayInvoice,
  invoiceStatusLabel,
} from './invoice-status.js';

export function effectiveInvoiceStatus(
  status: InvoiceStatus,
  dueAt: Date | null,
  now: Date,
) {
  if (
    (status === InvoiceStatus.ISSUED || status === ('ISSUED' as InvoiceStatus)) &&
    dueAt &&
    now.getTime() > dueAt.getTime()
  ) {
    return InvoiceStatus.OVERDUE;
  }
  return status;
}

export type InvoiceOwnerSnapshot = {
  id: string;
  fullName: string;
  email: string;
};

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
    paymentUrl?: string | null;
    externalReference?: string | null;
    paymentReportedAt?: Date | null;
    paymentVerifiedAt?: Date | null;
    verifiedByUserId?: string | null;
    customerName: string;
    customerBillingEmail: string;
    paymentInstructionsSnapshot: string | null;
    internalNotes?: string | null;
    createdAt: Date;
    plan?: { code: string; name: string };
    organization?: {
      name: string;
      slug: string;
      members?: Array<{ user: InvoiceOwnerSnapshot }>;
    };
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
  const paymentUrl = invoice.paymentUrl ?? null;
  const liveOwner = options.includeInternal
    ? (invoice.organization?.members?.[0]?.user ?? null)
    : null;

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    organizationId: invoice.organizationId,
    subscriptionId: invoice.subscriptionId,
    planId: invoice.planId,
    type: invoice.type,
    status,
    storedStatus: invoice.status,
    statusLabel: invoiceStatusLabel(status),
    currency: invoice.currency,
    subtotalCents: invoice.subtotalCents,
    totalCents: invoice.totalCents,
    amountLabel: `${formatCentsUsd(invoice.totalCents)} ${invoice.currency}`,
    billingPeriodStart: invoice.billingPeriodStart.toISOString(),
    billingPeriodEnd: invoice.billingPeriodEnd.toISOString(),
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    dueAt: invoice.dueAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    paymentReportedAt: invoice.paymentReportedAt?.toISOString() ?? null,
    paymentVerifiedAt: invoice.paymentVerifiedAt?.toISOString() ?? null,
    hasPaymentUrl: Boolean(paymentUrl),
    canPay: canShowPayInvoice(status, paymentUrl),
    paymentUrl:
      options.includeInternal || canShowPayInvoice(status, paymentUrl)
        ? paymentUrl
        : null,
    externalReference: options.includeInternal
      ? (invoice.externalReference ?? null)
      : undefined,
    /** Snapshot taken at prepare time (defaults from Owner). Preserved after issue. */
    customerName: invoice.customerName,
    customerBillingEmail: invoice.customerBillingEmail,
    billingContactName: invoice.customerName,
    billingContactEmail: invoice.customerBillingEmail,
    paymentInstructions: options.includeInstructions
      ? invoice.paymentInstructionsSnapshot
      : null,
    internalNotes: options.includeInternal ? (invoice.internalNotes ?? null) : null,
    createdAt: invoice.createdAt.toISOString(),
    plan: invoice.plan ?? null,
    organization: invoice.organization
      ? { name: invoice.organization.name, slug: invoice.organization.slug }
      : null,
    /** Live organization Owner — platform admin only; not a historical snapshot. */
    organizationOwner: options.includeInternal ? liveOwner : undefined,
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
