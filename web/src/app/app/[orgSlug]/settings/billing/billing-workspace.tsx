"use client";

import { useRefreshLoader } from "@/components/fieldops/data-refresh-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { multiYearPriceCents, MULTI_YEAR_TERM_DISCOUNTS } from "@/lib/pricing";
import { ApiError } from "@/lib/api";
import { getMyOrganizations } from "@/lib/auth";
import {
  createPaddleCustomerPortalSession,
  createPaddleInvoiceCheckout,
  getOrganizationInvoice,
  invoiceStatusLabel,
  listOrganizationInvoices,
  reportInvoicePayment,
  type InvoiceSummary,
} from "@/lib/billing";
import { formatStorageBytes, getOrganizationSubscription, requestPlanChange } from "@/lib/subscription";
import { useSubscription } from "@/components/fieldops/subscription-provider";
import type { OrganizationSubscription } from "@/lib/subscription";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

function billingReadOnlyNotice(subscription: OrganizationSubscription) {
  const isRenewal =
    subscription.effectiveStatus === "EXPIRED" ||
    subscription.effectiveStatus === "PAID_GRACE";
  const progress = isRenewal
    ? subscription.renewalProgress
    : subscription.activationProgress;
  const state = progress?.state ?? "none";

  if (state === "awaiting_verification") {
    return isRenewal
      ? "Payment under review. Please allow up to 2 business days for review. Your subscription will be updated once your payment is confirmed. Your data remains retained."
      : "Payment under review. Please allow up to 2 business days for review. Your subscription will be updated once your payment is confirmed. Your data remains retained.";
  }
  if (state === "pay_invoice" || state === "view_invoice") {
    return isRenewal
      ? "Your workspace is read-only until the subscription is renewed. Complete payment below to restore full access."
      : "Your workspace is read-only until the subscription is activated. Complete payment below to restore full access.";
  }
  if (state === "invoice_preparing" || state === "request_sent") {
    return isRenewal
      ? "Your workspace is read-only until the subscription is renewed. Your renewal is in progress — the invoice will appear here when ready."
      : "Your workspace is read-only until the subscription is activated. Your activation is in progress — the invoice will appear here when ready.";
  }
  return isRenewal
    ? "Your workspace is read-only until the subscription is renewed. Open Billing to review payment options. The FieldKeel team must issue an invoice before payment can be completed."
    : "Your workspace is read-only until the subscription is activated. Open Billing to review payment options. The FieldKeel team must issue an invoice before payment can be completed.";
}

export function BillingWorkspace({ orgSlug }: { orgSlug: string }) {
  const { refresh: refreshSubscription } = useSubscription();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [paddlePayments, setPaddlePayments] = useState<NonNullable<Awaited<ReturnType<typeof listOrganizationInvoices>>["paddlePayments"]>>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<InvoiceSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyOrganizations().then((memberships) => {
      const match = memberships.find((item) => item.organization.slug === orgSlug);
      if (cancelled || !match) return;
      setOrganizationId(match.organization.id);
      setOrganizationName(match.organization.name);
      setCanManage(match.role === "OWNER");
    });
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  useEffect(() => {
    if (!organizationId || !canManage) return;
    let cancelled = false;
    Promise.all([
      getOrganizationSubscription(organizationId),
      listOrganizationInvoices(organizationId, { page, pageSize: 20 }),
    ]).then(([nextSub, nextInvoices]) => {
      if (cancelled) return;
      setSubscription(nextSub);
      setInvoices(nextInvoices.items);
      setPaddlePayments(nextInvoices.paddlePayments ?? []);
      setTotalPages(nextInvoices.totalPages);
    });
    return () => {
      cancelled = true;
    };
  }, [canManage, organizationId, page]);

  useRefreshLoader(async () => {
    if (!organizationId || !canManage) return;
    const [nextSub, nextInvoices, nextSelected] = await Promise.all([
      getOrganizationSubscription(organizationId),
      listOrganizationInvoices(organizationId, { page, pageSize: 20 }),
      selected ? getOrganizationInvoice(organizationId, selected.id) : Promise.resolve(null),
    ]);
    setSubscription(nextSub);
    setInvoices(nextInvoices.items);
    setPaddlePayments(nextInvoices.paddlePayments ?? []);
    setTotalPages(nextInvoices.totalPages);
    if (nextSelected) setSelected(nextSelected);
  });

  async function openPaddlePortal() {
    if (!organizationId) return;
    setPortalBusy(true);
    setPortalError(null);
    try {
      const session = await createPaddleCustomerPortalSession(organizationId);
      window.location.assign(session.url);
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : "Unable to open billing management.");
    } finally {
      setPortalBusy(false);
    }
  }

  const currentInvoice =
    selected ??
    invoices.find((row) =>
      ["PREPARING", "DRAFT", "ISSUED", "PAYMENT_REPORTED", "OVERDUE"].includes(row.status),
    ) ??
    null;

  const readOnly =
    subscription?.readOnly ||
    ["TRIAL_EXPIRED", "EXPIRED"].includes(subscription?.effectiveStatus ?? "");

  if (!canManage) {
    return (
      <div className="mt-4 rounded-md border border-border bg-muted/30 px-3 py-3">
        <p className="text-sm font-medium">Insufficient permission</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Only the organization owner can view billing and invoices.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {subscription ? (
        <section className="rounded-lg border border-border bg-card px-4 py-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Organization</dt>
              <dd className="font-medium">{organizationName || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Current plan</dt>
              <dd className="font-medium">{subscription.plan.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Annual price</dt>
              <dd className="font-medium">{subscription.plan.priceLabel}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Subscription status</dt>
              <dd className="font-medium">
                {subscription.effectiveStatus.replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Trial / renewal date</dt>
              <dd>
                {subscription.trialEndsAt && !subscription.activatedAt
                  ? new Date(subscription.trialEndsAt).toLocaleDateString()
                  : subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                    : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">User limit</dt>
              <dd>
                {subscription.usage
                  ? `${subscription.usage.users.used} / ${subscription.usage.users.included}`
                  : subscription.plan.maxUsers}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Storage limit</dt>
              <dd>{formatStorageBytes(subscription.plan.maxStorageBytes)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Billing frequency</dt>
              <dd>{subscription.plan.billingInterval === "ANNUAL" ? "Annual" : subscription.plan.billingInterval.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Payment method</dt>
              <dd>{subscription.paymentMethod === "PADDLE_CARD" ? "Card - automatic renewal" : subscription.paymentMethod === "MANUAL_INVOICE" ? "Manual invoice - renewal requires a new invoice" : "Professional trial - no card required"}</dd>
            </div>
          </dl>
          {readOnly ? (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              {billingReadOnlyNotice(subscription)}
            </p>
          ) : null}
          {subscription.paymentMethod === "PADDLE_CARD" ? (
            <div className="mt-4">
              <Button className="h-11" variant="outline" disabled={portalBusy} onClick={() => void openPaddlePortal()}>
                {portalBusy ? "Opening billing management…" : "Manage billing and invoices"}
              </Button>
              {portalError ? <p className="mt-2 text-sm text-destructive">{portalError}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {!currentInvoice && subscription ? (
        <section className="rounded-lg border border-border bg-card px-4 py-4 text-sm">
          <h2 className="font-semibold">Payment options</h2>
          {subscription.paymentMethod === "TRIAL" ? (
            <p className="mt-2 text-muted-foreground">Your 14-day Professional trial does not require a card and will not automatically charge you when it ends. A paid activation invoice must be prepared and issued before you can pay by card or follow manual invoice instructions. Contact FieldKeel if an invoice is needed.</p>
          ) : subscription.paymentMethod === "PADDLE_CARD" ? (
            <p className="mt-2 text-muted-foreground">Your card subscription renews automatically through Paddle at the end of its selected prepaid term. The next billing date is {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "not yet available"}. Manage your payment method, cancellation, payment history, and downloadable Paddle invoices through Paddle. A second manual renewal invoice is not used for this subscription.</p>
          ) : (
            <p className="mt-2 text-muted-foreground">Manual invoice subscriptions do not renew automatically. The FieldKeel team must prepare and issue the next invoice before you can pay. If your renewal is approaching and no invoice appears, contact FieldKeel support.</p>
          )}
        </section>
      ) : null}

      {currentInvoice ? (
        <CurrentInvoiceCard
          organizationId={organizationId!}
          invoice={currentInvoice}
          onRefresh={async (invoiceId) => {
            const [next, nextSubscription] = await Promise.all([
              getOrganizationInvoice(organizationId!, invoiceId),
              getOrganizationSubscription(organizationId!),
            ]);
            setSelected(next);
            setSubscription(nextSubscription);
            await refreshSubscription();
            const list = await listOrganizationInvoices(organizationId!, {
              page,
              pageSize: 20,
            });
            setInvoices(list.items);
            setPaddlePayments(list.paddlePayments ?? []);
            setMessage(null);
          }}
          onNotice={setMessage}
        />
      ) : null}

      <section className="rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Billing history</h2>
        <div className="mt-3 scroll-x-pane">
          <table className="w-full min-w-xl text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Invoice</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Plan</th>
                <th className="py-2 font-medium">Amount</th>
                <th className="py-2 font-medium">Issued</th>
                <th className="py-2 font-medium">Due</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-border">
                  <td className="py-2">
                    <button
                      type="button"
                      className="font-medium text-primary"
                      onClick={() =>
                        organizationId
                          ? getOrganizationInvoice(organizationId, invoice.id).then(setSelected)
                          : undefined
                      }
                    >
                      {invoice.invoiceNumber}
                    </button>
                  </td>
                  <td className="py-2">{invoice.type.replaceAll("_", " ")}</td>
                  <td className="py-2">{invoice.plan?.name ?? "—"}</td>
                  <td className="py-2">{invoice.amountLabel}</td>
                  <td className="py-2">
                    {invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2">
                    {invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2">
                    {invoiceStatusLabel(invoice.status, invoice.statusLabel)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No invoices yet.</p>
          ) : null}
        </div>
        {totalPages > 1 ? (
          <div className="mt-3 flex gap-2">
            <Button
              className="h-11"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              className="h-11"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </section>

      {paddlePayments.length ? (
        <section className="rounded-lg border border-border bg-card px-4 py-4">
          <h2 className="text-sm font-semibold">Card payment and renewal history</h2>
          <div className="mt-3 scroll-x-pane">
            <table className="w-full min-w-xl text-left text-sm">
              <thead className="text-muted-foreground"><tr>
                <th className="py-2 font-medium">Date</th><th className="py-2 font-medium">Event</th>
                <th className="py-2 font-medium">Amount</th><th className="py-2 font-medium">Billing period</th>
                <th className="py-2 font-medium">Reference</th>
              </tr></thead>
              <tbody>{paddlePayments.map((payment, index) => (
                <tr key={`${payment.eventType}-${payment.transactionId}-${payment.createdAt}-${index}`} className="border-t border-border">
                  <td className="py-2">{new Date(payment.createdAt).toLocaleDateString()}</td>
                  <td className="py-2">{payment.eventType.replaceAll(".", " ").replaceAll("_", " ")} {payment.eventStatus?.replaceAll("_", " ") ?? ""}</td>
                  <td className="py-2">{payment.amountCents == null ? "—" : `${(payment.amountCents / 100).toLocaleString(undefined, { style: "currency", currency: payment.currency ?? "USD" })}`}</td>
                  <td className="py-2">{payment.billingPeriodStart && payment.billingPeriodEnd ? `${new Date(payment.billingPeriodStart).toLocaleDateString()} - ${new Date(payment.billingPeriodEnd).toLocaleDateString()}` : "—"}</td>
                  <td className="py-2 font-mono text-xs">{payment.transactionId ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selected && organizationId && selected.id !== currentInvoice?.id ? (
        <InvoiceDetail
          organizationId={organizationId}
          invoice={selected}
          onNotice={setMessage}
          onRefresh={async () => {
            const [next, nextSubscription] = await Promise.all([
              getOrganizationInvoice(organizationId, selected.id),
              getOrganizationSubscription(organizationId),
            ]);
            setSelected(next);
            setSubscription(nextSubscription);
          }}
        />
      ) : null}
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}

function CurrentInvoiceCard({
  organizationId,
  invoice,
  onNotice,
  onRefresh,
}: {
  organizationId: string;
  invoice: InvoiceSummary;
  onNotice: (value: string) => void;
  onRefresh: (invoiceId: string) => Promise<void>;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card px-4 py-4 text-sm">
      <h2 className="text-sm font-semibold">Current invoice</h2>
      <InvoiceDetail
        organizationId={organizationId}
        invoice={invoice}
        onNotice={onNotice}
        onRefresh={() => onRefresh(invoice.id)}
      />
    </section>
  );
}

function InvoiceDetail({
  organizationId,
  invoice,
  onNotice,
  onRefresh,
}: {
  organizationId: string;
  invoice: InvoiceSummary;
  onNotice: (value: string) => void;
  onRefresh?: () => Promise<void>;
}) {
  const [reference, setReference] = useState("");
  const [paddleBusy, setPaddleBusy] = useState(false);
  const [termYears, setTermYears] = useState(1);
  const [invoiceRequestBusy, setInvoiceRequestBusy] = useState(false);
  const [invoiceRequestError, setInvoiceRequestError] = useState<string | null>(null);
  const [paddleError, setPaddleError] = useState<string | null>(null);
  const label = invoiceStatusLabel(invoice.status, invoice.statusLabel);
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(`fieldkeel:paddle-term:${invoice.id}`));
    if (Number.isInteger(saved) && saved >= 1 && saved <= 5) setTermYears(saved);
    else setTermYears(1);
  }, [invoice.id]);
  const isPreparing = invoice.status === "PREPARING" || invoice.status === "DRAFT";
  const awaiting = invoice.status === "PAYMENT_REPORTED";
  const paymentNotConfirmed =
    (invoice.status === "ISSUED" || invoice.status === "OVERDUE") &&
    Boolean(invoice.paymentReportedAt);
  const discountPercent = MULTI_YEAR_TERM_DISCOUNTS[termYears - 1] ?? 0;
  const termAmountCents = multiYearPriceCents(invoice.totalCents, termYears) ?? invoice.totalCents;
  const formattedTermAmount = new Intl.NumberFormat("en-US", {
    style: "currency", currency: invoice.currency,
  }).format(termAmountCents / 100);

  async function requestDiscountedInvoice() {
    setInvoiceRequestBusy(true);
    setInvoiceRequestError(null);
    try {
      const message = `Discounted invoice request for ${invoice.invoiceNumber}: ${invoice.plan?.name ?? "plan"}, ${termYears} ${termYears === 1 ? "year" : "years"}, ${discountPercent}% discount, ${formattedTermAmount} total. Please update and reissue the invoice for this term.`;
      await requestPlanChange(organizationId, message);
      onNotice("Request sent. The FieldKeel team will respond and update your invoice.");
    } catch (error) {
      setInvoiceRequestError(error instanceof Error ? error.message : "Could not send the invoice request.");
    } finally {
      setInvoiceRequestBusy(false);
    }
  }

  async function startPaddleCheckout() {
    setPaddleBusy(true);
    setPaddleError(null);
    try {
      const session = await createPaddleInvoiceCheckout(organizationId, invoice.id, termYears);
      const { initializePaddle } = await import("@paddle/paddle-js");
      const paddle = await initializePaddle({ environment: "sandbox", token: session.clientToken });
      if (!paddle) throw new Error("Paddle checkout could not be initialized.");
      paddle.Checkout.open({ transactionId: session.transactionId, customer: { email: session.customerEmail } });
      onNotice("Checkout is open. This page updates after Paddle confirms payment.");
      void (async () => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          try {
            const latest = await getOrganizationInvoice(organizationId, invoice.id);
            if (latest.status === "PAID") {
              await onRefresh?.();
              onNotice("Payment confirmed. Your subscription and billing history are updated.");
              return;
            }
          } catch {
            return;
          }
        }
      })();
    } catch (error) {
      setPaddleError(error instanceof Error ? error.message : "Unable to open Paddle checkout.");
    } finally {
      setPaddleBusy(false);
    }
  }
  async function downloadPdf() {
    const response = await fetch(
      `${API_URL}/organizations/${organizationId}/invoices/${invoice.id}/pdf`,
      { credentials: "include", headers: { "X-FieldOps-Requested-With": "web" } },
    );
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.invoiceNumber}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="text-xs text-muted-foreground">Invoice</p>
        <p className="font-semibold">{invoice.invoiceNumber}</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Plan</dt>
          <dd className="font-medium">{invoice.plan?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="font-medium">{invoice.amountLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Payment method</dt>
          <dd className="font-medium">{invoice.paymentMethodLabel ?? "Choose card or manual invoice"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Billing period</dt>
          <dd>
            {new Date(invoice.billingPeriodStart).toLocaleDateString()} –{" "}
            {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Due</dt>
          <dd>{invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="font-medium">{label}</dd>
        </div>
      </dl>

      {isPreparing ? (
        <p className="rounded-md bg-muted/50 px-3 py-3 text-muted-foreground">
          This invoice has not been issued for payment yet. The FieldKeel team must prepare and issue it first. No card payment is processed and manual payment has not been submitted.
        </p>
      ) : null}

      {awaiting ? (
        <p className="rounded-md bg-muted/50 px-3 py-3 text-muted-foreground">
          Payment under review. Please allow up to 2 business days for verification. Your subscription will be updated only after payment is confirmed.
        </p>
      ) : null}

      {paymentNotConfirmed ? (
        <p className="rounded-md bg-muted/50 px-3 py-3 text-muted-foreground">
          Payment could not be confirmed. Please review the payment details and
          try again.
        </p>
      ) : null}

      {(invoice.status === "ISSUED" || invoice.status === "OVERDUE") &&
      (invoice.plan?.code === "starter" || invoice.plan?.code === "professional") ? (
        <div className="space-y-3 rounded-md bg-muted/50 px-3 py-3">
          <p className="text-muted-foreground">
            Choose 1–5 years. The full discounted amount is charged now, and Paddle renews automatically at the end of the selected term. Manage or cancel the subscription through the Paddle billing portal.
          </p>
          <div className="grid gap-3 sm:grid-cols-[minmax(12rem,18rem)_1fr] sm:items-end">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-foreground">Prepay term</span>
              <select
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={termYears}
                onChange={(event) => {
                  const years = Number(event.target.value);
                  setTermYears(years);
                  window.localStorage.setItem(`fieldkeel:paddle-term:${invoice.id}`, String(years));
                }}
              >
                {MULTI_YEAR_TERM_DISCOUNTS.map((discount, index) => {
                  const years = index + 1;
                  return <option key={years} value={years}>{years} {years === 1 ? "year" : "years"}{discount ? ` · Save ${discount}%` : ""}</option>;
                })}
              </select>
            </label>
            <p className="text-foreground">
              Due today: <strong>{formattedTermAmount}</strong>{discountPercent ? ` · ${discountPercent}% off` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {termYears > 1 ? (
              <Button type="button" variant="outline" disabled={invoiceRequestBusy} onClick={() => void requestDiscountedInvoice()}>
                {invoiceRequestBusy ? "Sending request…" : "Request discounted invoice"}
              </Button>
            ) : null}
            {invoiceRequestError ? <p className="text-sm text-destructive">{invoiceRequestError}</p> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            This invoice was issued for 1 year. Pay Now applies the selected multi-year discount immediately. To pay by invoice with a discount, request an updated invoice above; the team will respond and update it.
          </p>
        </div>
      ) : null}

      {invoice.paymentInstructions &&
      (invoice.status === "ISSUED" ||
        invoice.status === "OVERDUE" ||
        invoice.status === "PAYMENT_REPORTED" ||
        invoice.status === "PAID") ? (
        <div className="rounded-md bg-muted/50 px-3 py-3">
          <p className="font-medium">Invoice</p>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
            {invoice.paymentInstructions}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(invoice.status === "ISSUED" || invoice.status === "OVERDUE") &&
        (invoice.plan?.code === "starter" || invoice.plan?.code === "professional") ? (
          <Button className="h-11" disabled={paddleBusy} onClick={() => void startPaddleCheckout()}>
            {paddleBusy ? "Opening checkout…" : "Pay Now"}
          </Button>
        ) : null}
        {paddleError ? <p className="w-full text-sm text-destructive">{paddleError}</p> : null}
        {invoice.canPay && invoice.paymentUrl ? (
          <Button
            className="h-11"
            asChild
          >
            <a
              href={invoice.paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Pay Invoice
            </a>
          </Button>
        ) : null}
        <Button className="h-11" variant="outline" onClick={() => void downloadPdf()}>
          Download PDF
        </Button>
        {invoice.status === "ISSUED" || invoice.status === "OVERDUE" ? (
          <>
            <Input
              className="h-11 max-w-xs"
              placeholder="Optional payment reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
            <Button
              className="h-11"
              variant="outline"
              onClick={async () => {
                try {
                  await reportInvoicePayment(organizationId, invoice.id, {
                    reference: reference || undefined,
                    message: "I have sent payment for this invoice.",
                  });
                  onNotice(
                    "Your payment has been submitted for verification. Please allow up to 2 business days for review. Your subscription will be updated once your payment is confirmed.",
                  );
                  await onRefresh?.();
                } catch (error) {
                  onNotice(
                    error instanceof ApiError ? error.message : "Could not send the report.",
                  );
                }
              }}
            >
              I&apos;ve Sent Payment
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
