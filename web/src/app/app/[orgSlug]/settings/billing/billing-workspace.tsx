"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { getMyOrganizations } from "@/lib/auth";
import {
  getOrganizationInvoice,
  invoiceStatusLabel,
  listOrganizationInvoices,
  reportInvoicePayment,
  type InvoiceSummary,
} from "@/lib/billing";
import { formatStorageBytes, getOrganizationSubscription } from "@/lib/subscription";
import type { OrganizationSubscription } from "@/lib/subscription";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export function BillingWorkspace({ orgSlug }: { orgSlug: string }) {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<InvoiceSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyOrganizations().then((memberships) => {
      const match = memberships.find((item) => item.organization.slug === orgSlug);
      if (cancelled || !match) return;
      setOrganizationId(match.organization.id);
      setCanManage(match.role === "OWNER" || match.role === "ADMIN");
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
      setTotalPages(nextInvoices.totalPages);
    });
    return () => {
      cancelled = true;
    };
  }, [canManage, organizationId, page]);

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
      <p className="mt-4 text-sm text-muted-foreground">
        Only owners and admins can view billing and invoices.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {subscription ? (
        <section className="rounded-lg border border-border bg-card px-4 py-4 text-sm">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Current plan</dt>
              <dd className="font-medium">{subscription.plan.name}</dd>
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
          </dl>
          {readOnly ? (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              Trial ended or payment is required to continue editing. Your data
              remains retained. Use Billing below to view or pay your invoice.
            </p>
          ) : null}
        </section>
      ) : null}

      {currentInvoice ? (
        <CurrentInvoiceCard
          organizationId={organizationId!}
          invoice={currentInvoice}
          onRefresh={async (invoiceId) => {
            const next = await getOrganizationInvoice(organizationId!, invoiceId);
            setSelected(next);
            const list = await listOrganizationInvoices(organizationId!, {
              page,
              pageSize: 20,
            });
            setInvoices(list.items);
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

      {selected && organizationId && selected.id !== currentInvoice?.id ? (
        <InvoiceDetail
          organizationId={organizationId}
          invoice={selected}
          onNotice={setMessage}
          onRefresh={async () => {
            const next = await getOrganizationInvoice(organizationId, selected.id);
            setSelected(next);
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
  const label = invoiceStatusLabel(invoice.status, invoice.statusLabel);
  const isPreparing = invoice.status === "PREPARING" || invoice.status === "DRAFT";
  const awaiting = invoice.status === "PAYMENT_REPORTED";
  const paymentNotConfirmed =
    (invoice.status === "ISSUED" || invoice.status === "OVERDUE") &&
    Boolean(invoice.paymentReportedAt);

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
          Your subscription is approaching renewal. Your payment invoice will be
          available here before payment is due.
        </p>
      ) : null}

      {awaiting ? (
        <p className="rounded-md bg-muted/50 px-3 py-3 text-muted-foreground">
          Payment awaiting verification. We&apos;ll update your subscription after
          the payment has been confirmed.
        </p>
      ) : null}

      {paymentNotConfirmed ? (
        <p className="rounded-md bg-muted/50 px-3 py-3 text-muted-foreground">
          Payment could not be confirmed. Please review the payment details and
          try again.
        </p>
      ) : null}

      {invoice.paymentInstructions &&
      (invoice.status === "ISSUED" ||
        invoice.status === "OVERDUE" ||
        invoice.status === "PAYMENT_REPORTED" ||
        invoice.status === "PAID") ? (
        <div className="rounded-md bg-muted/50 px-3 py-3">
          <p className="font-medium">Payment notes</p>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
            {invoice.paymentInstructions}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
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
                    "Payment awaiting verification. We'll update your subscription after payment has been confirmed.",
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
