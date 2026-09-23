import { apiRequest } from "./api";

export type InvoiceSummary = {
  id: string;
  invoiceNumber: string;
  organizationId: string;
  type: string;
  status: string;
  currency: string;
  totalCents: number;
  amountLabel: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  customerName: string;
  customerBillingEmail: string;
  paymentInstructions: string | null;
  internalNotes?: string | null;
  plan: { code: string; name: string } | null;
  organization: { name: string; slug: string } | null;
  paymentNotices?: Array<{
    id: string;
    reference: string | null;
    message: string | null;
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

export function listOrganizationInvoices(organizationId: string) {
  return apiRequest<InvoiceSummary[]>(`/organizations/${organizationId}/invoices`);
}

export function getOrganizationInvoice(organizationId: string, invoiceId: string) {
  return apiRequest<InvoiceSummary>(
    `/organizations/${organizationId}/invoices/${invoiceId}`,
  );
}

export function reportInvoicePayment(
  organizationId: string,
  invoiceId: string,
  body: { reference?: string; message?: string },
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

export function listPlatformInvoices() {
  return apiRequest<InvoiceSummary[]>("/platform/invoices");
}

export function createPlatformInvoice(body: Record<string, unknown>) {
  return apiRequest<InvoiceSummary>("/platform/invoices", { method: "POST", body });
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
    body,
  });
}
