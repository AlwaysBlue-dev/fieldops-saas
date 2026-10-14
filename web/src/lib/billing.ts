import { apiRequest } from "./api";

export type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  organizationId: string;
  type: string;
  status: string;
  storedStatus?: string;
  statusLabel: string;
  currency: string;
  totalCents: number;
  amountLabel: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  paymentReportedAt?: string | null;
  paymentVerifiedAt?: string | null;
  verifiedBy?: { id: string; fullName: string; email: string } | null;
  hasPaymentUrl?: boolean;
  canPay?: boolean;
  paymentUrl?: string | null;
  externalReference?: string | null;
  paymentMethodLabel?: string;
  customerName: string;
  customerBillingEmail: string;
  billingContactName?: string;
  billingContactEmail?: string;
  paymentInstructions: string | null;
  internalNotes?: string | null;
  plan: { code: string; name: string; annualPriceCents?: number | null } | null;
  organization: { name: string; slug: string } | null;
  /** Live org Owner — platform admin responses only. */
  organizationOwner?: { id: string; fullName: string; email: string } | null;
  paymentNotices?: Array<{
    id: string;
    reference: string | null;
    message: string | null;
    createdAt: string;
    submittedBy?: { fullName: string; email: string } | null;
    reviewedAt?: string | null;
    rejectionReason?: string | null;
  }>;
};

export type InvoiceListResponse = {
  items: InvoiceSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  paddlePayments?: Array<{
    eventType: string;
    eventStatus: string | null;
    transactionId: string | null;
    amountCents: number | null;
    currency: string | null;
    billingPeriodStart: string | null;
    billingPeriodEnd: string | null;
    createdAt: string;
  }>;
};

export type BillingSettings = {
  billingLegalName: string | null;
  billingAddress: string | null;
  billingEmail: string | null;
  billingInstructions: string | null;
  paymentReferenceInstructions: string | null;
};

export type InvoiceListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  organizationId?: string;
  invoiceType?: string;
  planId?: string;
  planCode?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

function toQuery(params: InvoiceListQuery = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function listOrganizationInvoices(
  organizationId: string,
  query: InvoiceListQuery = {},
) {
  return apiRequest<InvoiceListResponse>(
    `/organizations/${organizationId}/invoices${toQuery(query)}`,
  );
}

export function createPaddleCustomerPortalSession(organizationId: string) {
  return apiRequest<{ url: string }>(`/organizations/${organizationId}/paddle-portal`, {
    method: "POST",
    body: {},
  });
}

export function getOrganizationInvoice(organizationId: string, invoiceId: string) {
  return apiRequest<InvoiceSummary>(
    `/organizations/${organizationId}/invoices/${invoiceId}`,
  );
}

export function reportInvoicePayment(
  organizationId: string,
  invoiceId: string,
  body: { reference?: string; message?: string } = {},
) {
  return apiRequest(`/organizations/${organizationId}/invoices/${invoiceId}/payment-notices`, {
    method: "POST",
    body,
  });
}

export function invoicePdfUrl(organizationId: string, invoiceId: string) {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  return `${base}/organizations/${organizationId}/invoices/${invoiceId}/pdf`;
}

export function listPlatformInvoices(query: InvoiceListQuery = {}) {
  return apiRequest<InvoiceListResponse>(`/platform/invoices${toQuery(query)}`);
}

export function getPlatformInvoice(invoiceId: string) {
  return apiRequest<InvoiceSummary>(`/platform/invoices/${invoiceId}`);
}

export function createPlatformInvoice(body: Record<string, unknown>) {
  return apiRequest<InvoiceSummary>("/platform/invoices", { method: "POST", body });
}

export function updatePlatformInvoicePayment(
  invoiceId: string,
  body: {
    paymentUrl?: string;
    externalReference?: string;
    dueAt?: string;
    customerName?: string;
    customerBillingEmail?: string;
  },
) {
  return apiRequest<InvoiceSummary>(`/platform/invoices/${invoiceId}/payment`, {
    method: "PATCH",
    body,
  });
}

export function updateDiscountedPlatformInvoice(invoiceId: string, requestId: string, termYears: number, paymentUrl?: string) {
  return apiRequest<InvoiceSummary>(`/platform/invoices/${invoiceId}/discounted-term`, {
    method: 'PATCH', body: { requestId, termYears, ...(paymentUrl ? { paymentUrl } : {}) },
  });
}

export function issuePlatformInvoice(invoiceId: string) {
  return apiRequest<InvoiceSummary>(`/platform/invoices/${invoiceId}/issue`, {
    method: "POST",
    body: {},
  });
}

export function markPlatformInvoicePaid(invoiceId: string) {
  return apiRequest<InvoiceSummary>(`/platform/invoices/${invoiceId}/mark-paid`, {
    method: "POST",
    body: {},
  });
}

export function markPaidAndActivate(invoiceId: string) {
  return apiRequest<InvoiceSummary>(`/platform/invoices/${invoiceId}/mark-paid-activate`, {
    method: "POST",
    body: {},
  });
}

export function markPaidAndRenew(invoiceId: string) {
  return apiRequest<InvoiceSummary>(`/platform/invoices/${invoiceId}/mark-paid-renew`, {
    method: "POST",
    body: {},
  });
}

export function markPlatformInvoiceOverdue(invoiceId: string) {
  return apiRequest<InvoiceSummary>(`/platform/invoices/${invoiceId}/mark-overdue`, {
    method: "POST",
    body: {},
  });
}

export function markPlatformInvoicePaymentNotFound(invoiceId: string, reason: string) {
  return apiRequest<InvoiceSummary>(
    `/platform/invoices/${invoiceId}/payment-not-found`,
    {
      method: "POST",
      body: { reason },
    },
  );
}

/** @deprecated Prefer markPaidAndActivate / markPaidAndRenew */
export function activateFromInvoice(invoiceId: string) {
  return apiRequest<InvoiceSummary>(`/platform/invoices/${invoiceId}/activate`, {
    method: "POST",
    body: {},
  });
}

export function voidPlatformInvoice(invoiceId: string) {
  return apiRequest<InvoiceSummary>(`/platform/invoices/${invoiceId}/void`, {
    method: "POST",
    body: {},
  });
}

export function getBillingSettings() {
  return apiRequest<BillingSettings>("/platform/billing-settings");
}

export function updateBillingSettings(body: BillingSettings) {
  return apiRequest<BillingSettings>("/platform/billing-settings", {
    method: "PUT",
    body: {
      billingLegalName: body.billingLegalName,
      billingAddress: body.billingAddress,
      billingEmail: body.billingEmail,
      billingInstructions: body.billingInstructions,
      paymentReferenceInstructions: body.paymentReferenceInstructions,
    },
  });
}

export function invoiceStatusLabel(status: string, statusLabel?: string) {
  if (statusLabel) return statusLabel;
  switch (status) {
    case "DRAFT":
    case "PREPARING":
      return "Invoice being prepared";
    case "ISSUED":
      return "Payment due";
    case "PAYMENT_REPORTED":
      return "Payment awaiting verification";
    case "PAID":
      return "Paid";
    case "REFUND_PENDING":
      return "Refund under review";
    case "PARTIALLY_REFUNDED":
      return "Partially refunded";
    case "REFUNDED":
      return "Refunded";
    case "DISPUTED":
      return "Payment disputed";
    case "OVERDUE":
      return "Overdue";
    case "VOID":
      return "Voided";
    default:
      return status.replaceAll("_", " ");
  }
}

export type PaddleCheckoutSession = {
  transactionId: string;
  clientToken: string;
  customerEmail: string;
  environment: "sandbox" | "production";
};

export function createPaddleInvoiceCheckout(organizationId: string, invoiceId: string, termYears: number) {
  return apiRequest<PaddleCheckoutSession>(
    `/organizations/${organizationId}/invoices/${invoiceId}/paddle-checkout`,
    { method: "POST", body: { termYears } },
  );
}
