"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { getMyOrganizations } from "@/lib/auth";
import {
  getOrganizationInvoice,
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
      listOrganizationInvoices(organizationId),
    ]).then(([nextSub, nextInvoices]) => {
      if (cancelled) return;
      setSubscription(nextSub);
      setInvoices(nextInvoices);
    });
    return () => {
      cancelled = true;
    };
  }, [canManage, organizationId]);

  if (!canManage) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Only owners and admins can view invoices and payment instructions.
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
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">
                {subscription.effectiveStatus.replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Trial ends</dt>
              <dd>
                {subscription.trialEndsAt
                  ? new Date(subscription.trialEndsAt).toLocaleDateString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Renewal date</dt>
              <dd>
                {subscription.currentPeriodEnd
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
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Invoices</h2>
        <div className="mt-3 scroll-x-pane">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Invoice</th>
                <th className="py-2 font-medium">Issued</th>
                <th className="py-2 font-medium">Due</th>
                <th className="py-2 font-medium">Amount</th>
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
                  <td className="py-2">
                    {invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2">
                    {invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2">{invoice.amountLabel}</td>
                  <td className="py-2">{invoice.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No invoices yet.</p>
          ) : null}
        </div>
      </section>

      {selected && organizationId ? (
        <InvoiceDetail
          organizationId={organizationId}
          invoice={selected}
          onNotice={setMessage}
        />
      ) : null}
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}

function InvoiceDetail({
  organizationId,
  invoice,
  onNotice,
}: {
  organizationId: string;
  invoice: InvoiceSummary;
  onNotice: (value: string) => void;
}) {
  const [reference, setReference] = useState("");

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
    <section className="space-y-3 rounded-lg border border-border bg-card px-4 py-4 text-sm">
      <h2 className="text-sm font-semibold">{invoice.invoiceNumber}</h2>
      <p>Status {invoice.status}. {invoice.amountLabel}.</p>
      {invoice.status === "ISSUED" || invoice.status === "OVERDUE" || invoice.status === "PAID" ? (
        <div className="rounded-md bg-muted/50 px-3 py-3">
          <p className="font-medium">Payment instructions</p>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
            {invoice.paymentInstructions ||
              "Sign in later if instructions are still being prepared."}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            FieldOps Cloud will never ask you to provide your password, full card
            number, CVV, or authentication credentials by email, support message,
            or chat. If you receive payment instructions from an unexpected
            address, verify them through FieldOps Support before sending payment.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button className="h-11" variant="outline" onClick={() => void downloadPdf()}>
          Download PDF
        </Button>
        {invoice.status === "ISSUED" || invoice.status === "OVERDUE" ? (
          <>
            <Input
              className="h-11 max-w-xs"
              placeholder="Payment reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
            <Button
              className="h-11"
              onClick={async () => {
                try {
                  await reportInvoicePayment(organizationId, invoice.id, {
                    reference,
                    message: "I have sent payment for this invoice.",
                  });
                  onNotice(
                    "Payment report sent. FieldOps must still confirm the funds before activation.",
                  );
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
    </section>
  );
}
