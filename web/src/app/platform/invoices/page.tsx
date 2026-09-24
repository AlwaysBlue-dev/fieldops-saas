"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  createPlatformInvoice,
  getBillingSettings,
  getPlatformInvoice,
  invoiceStatusLabel,
  issuePlatformInvoice,
  listPlatformInvoices,
  markPaidAndActivate,
  markPaidAndRenew,
  markPlatformInvoiceOverdue,
  markPlatformInvoicePaymentNotFound,
  updateBillingSettings,
  updatePlatformInvoicePayment,
  voidPlatformInvoice,
  type BillingSettings,
  type InvoiceSummary,
} from "@/lib/billing";
import { listPlatformOrganizations, listPlatformPlans } from "@/lib/platform";
import type { SubscriptionPlan } from "@/lib/subscription";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function PlatformInvoicesPage() {
  const searchParams = useSearchParams();
  const orgFilterFromUrl = searchParams.get("organizationId") ?? "";
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState(orgFilterFromUrl);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [planCode, setPlanCode] = useState("professional");
  const [type, setType] = useState("ACTIVATION");
  const [selected, setSelected] = useState<InvoiceSummary | null>(null);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [billingContactName, setBillingContactName] = useState("");
  const [billingContactEmail, setBillingContactEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function refreshList() {
    const result = await listPlatformInvoices({
      page,
      pageSize: 20,
      search: search || undefined,
      status: statusFilter || undefined,
      invoiceType: typeFilter || undefined,
      organizationId: organizationFilter || undefined,
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    setInvoices(result.items);
    setTotalPages(result.totalPages);
  }

  useEffect(() => {
    if (orgFilterFromUrl) {
      setOrganizationFilter(orgFilterFromUrl);
      setOrganizationId(orgFilterFromUrl);
    }
  }, [orgFilterFromUrl]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPlatformInvoices({ page: 1, pageSize: 20 }),
      listPlatformOrganizations(),
      listPlatformPlans(),
      getBillingSettings(),
    ]).then(([nextInvoices, nextOrgs, nextPlans, nextSettings]) => {
      if (cancelled) return;
      setInvoices(nextInvoices.items);
      setTotalPages(nextInvoices.totalPages);
      setOrgs(nextOrgs.map((org) => ({ id: org.id, name: org.name })));
      setPlans(nextPlans);
      setSettings(nextSettings);
      setOrganizationId((current) => current || nextOrgs[0]?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshList().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional filter-driven reload
  }, [page, statusFilter, typeFilter, organizationFilter]);

  async function run(label: string, work: () => Promise<unknown>) {
    setMessage(null);
    try {
      await work();
      await refreshList();
      if (selected) {
        const detail = await getPlatformInvoice(selected.id);
        setSelected(detail);
        setBillingContactName(detail.billingContactName ?? detail.customerName);
        setBillingContactEmail(
          detail.billingContactEmail ?? detail.customerBillingEmail,
        );
      }
      setMessage(label);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Action failed.");
    }
  }

  function openInvoice(invoice: InvoiceSummary) {
    void getPlatformInvoice(invoice.id).then((detail) => {
      setSelected(detail);
      setPaymentUrl(detail.paymentUrl ?? "");
      setExternalReference(detail.externalReference ?? "");
      setBillingContactName(detail.billingContactName ?? detail.customerName);
      setBillingContactEmail(
        detail.billingContactEmail ?? detail.customerBillingEmail,
      );
    });
  }

  const canEditBillingContact =
    selected?.storedStatus === "PREPARING" ||
    selected?.storedStatus === "DRAFT" ||
    selected?.status === "PREPARING" ||
    selected?.status === "DRAFT";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Prepare invoices, attach a secure payment link, issue to the customer,
          then verify payment and activate or renew. Payment providers are an
          internal implementation detail — never shown to customers.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Prepare invoice</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="org">Organization</Label>
            <select
              id="org"
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            >
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="plan">Plan</Label>
            <select
              id="plan"
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={planCode}
              onChange={(event) => setPlanCode(event.target.value)}
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.code}>
                  {plan.name} ({plan.priceLabel})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="ACTIVATION">Activation</option>
              <option value="RENEWAL">Renewal</option>
              <option value="PLAN_CHANGE">Plan change</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
        <Button
          className="h-11"
          onClick={() =>
            run("Invoice prepared.", () =>
              createPlatformInvoice({
                organizationId,
                planCode,
                type,
              }),
            )
          }
        >
          Prepare invoice
        </Button>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            className="h-11"
            placeholder="Search invoice, org, owner, email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setPage(1);
                void refreshList();
              }
            }}
          />
          <select
            className="h-11 rounded-md border border-input bg-background px-3 text-sm"
            value={organizationFilter}
            onChange={(event) => {
              setPage(1);
              setOrganizationFilter(event.target.value);
            }}
            aria-label="Filter by organization"
          >
            <option value="">All organizations</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <select
            className="h-11 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(event) => {
              setPage(1);
              setStatusFilter(event.target.value);
            }}
          >
            <option value="">All statuses</option>
            <option value="PREPARING">Preparing</option>
            <option value="ISSUED">Issued</option>
            <option value="PAYMENT_REPORTED">Payment reported</option>
            <option value="PAID">Paid</option>
            <option value="OVERDUE">Overdue</option>
            <option value="VOID">Void</option>
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            className="h-11 rounded-md border border-input bg-background px-3 text-sm"
            value={typeFilter}
            onChange={(event) => {
              setPage(1);
              setTypeFilter(event.target.value);
            }}
          >
            <option value="">All types</option>
            <option value="ACTIVATION">Activation</option>
            <option value="RENEWAL">Renewal</option>
            <option value="PLAN_CHANGE">Plan change</option>
            <option value="OTHER">Other</option>
          </select>
          <Button className="h-11" variant="outline" onClick={() => { setPage(1); void refreshList(); }}>
            Search
          </Button>
        </div>
      </section>

      <section className="scroll-x-pane rounded-lg border border-border bg-card">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 font-medium">Organization</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium">Owner email</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className="font-medium text-primary"
                    onClick={() => openInvoice(invoice)}
                  >
                    {invoice.invoiceNumber}
                  </button>
                </td>
                <td className="px-3 py-2">{invoice.organization?.name ?? "—"}</td>
                <td className="px-3 py-2">
                  {invoice.organizationOwner?.fullName ??
                    invoice.billingContactName ??
                    invoice.customerName}
                </td>
                <td className="px-3 py-2">
                  {invoice.organizationOwner?.email ??
                    invoice.billingContactEmail ??
                    invoice.customerBillingEmail}
                </td>
                <td className="px-3 py-2">{invoice.plan?.name ?? "—"}</td>
                <td className="px-3 py-2">{invoice.amountLabel}</td>
                <td className="px-3 py-2">
                  {invoiceStatusLabel(invoice.status, invoice.statusLabel)}
                </td>
                <td className="px-3 py-2">
                  {invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "—"}
                </td>
                <td className="px-3 py-2">
                  <Button className="h-8" variant="outline" onClick={() => openInvoice(invoice)}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 ? (
          <div className="flex gap-2 border-t border-border px-3 py-3">
            <Button className="h-11" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
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

      {selected ? (
        <section className="space-y-3 rounded-lg border border-border bg-card px-4 py-4 text-sm">
          <h2 className="text-sm font-semibold">{selected.invoiceNumber}</h2>
          <p>
            {selected.organization?.name} · {selected.plan?.name} · {selected.amountLabel}
          </p>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Billing contact
            </p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Owner (live)</dt>
                <dd className="font-medium">
                  {selected.organizationOwner?.fullName ?? "—"}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {selected.organizationOwner?.email ?? ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Invoice snapshot</dt>
                <dd className="font-medium">
                  {selected.billingContactName ?? selected.customerName}
                </dd>
                <dd className="text-xs text-muted-foreground">
                  {selected.billingContactEmail ?? selected.customerBillingEmail}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Snapshot is set from the organization Owner when the invoice is
              prepared and is preserved after issue.
            </p>
          </div>
          <p>
            Status: {invoiceStatusLabel(selected.status, selected.statusLabel)}
            {selected.paymentReportedAt
              ? ` · Payment reported ${new Date(selected.paymentReportedAt).toLocaleString()}`
              : ""}
          </p>
          {canEditBillingContact ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="billingName">Billing contact name</Label>
                <Input
                  id="billingName"
                  className="mt-1 h-11"
                  value={billingContactName}
                  onChange={(event) => setBillingContactName(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="billingEmail">Billing contact email</Label>
                <Input
                  id="billingEmail"
                  className="mt-1 h-11"
                  type="email"
                  value={billingContactEmail}
                  onChange={(event) => setBillingContactEmail(event.target.value)}
                />
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="paymentUrl">Secure payment URL (https)</Label>
              <Input
                id="paymentUrl"
                className="mt-1 h-11"
                placeholder="https://…"
                value={paymentUrl}
                onChange={(event) => setPaymentUrl(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="extRef">External reference (internal)</Label>
              <Input
                id="extRef"
                className="mt-1 h-11"
                value={externalReference}
                onChange={(event) => setExternalReference(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11"
              variant="outline"
              onClick={() =>
                run("Payment details saved.", () =>
                  updatePlatformInvoicePayment(selected.id, {
                    paymentUrl: paymentUrl || undefined,
                    externalReference: externalReference || undefined,
                    ...(canEditBillingContact
                      ? {
                          customerName: billingContactName || undefined,
                          customerBillingEmail: billingContactEmail || undefined,
                        }
                      : {}),
                  }),
                )
              }
            >
              Save payment details
            </Button>
            <Button
              className="h-11"
              onClick={() => run("Invoice issued.", () => issuePlatformInvoice(selected.id))}
            >
              Issue invoice
            </Button>
            <Button
              className="h-11"
              variant="outline"
              onClick={() => {
                const org = selected.organization?.name ?? "this organization";
                const through = new Date(selected.billingPeriodEnd).toLocaleDateString();
                if (
                  !window.confirm(
                    `Confirm payment of ${selected.amountLabel} for ${org}?\n\nThis will activate ${selected.plan?.name ?? "the plan"} through ${through}.`,
                  )
                ) {
                  return;
                }
                void run("Paid and activated.", () => markPaidAndActivate(selected.id));
              }}
            >
              Mark Paid & Activate
            </Button>
            <Button
              className="h-11"
              variant="outline"
              onClick={() => {
                const org = selected.organization?.name ?? "this organization";
                const through = new Date(selected.billingPeriodEnd).toLocaleDateString();
                if (
                  !window.confirm(
                    `Confirm payment of ${selected.amountLabel} for ${org}?\n\nThis will renew ${selected.plan?.name ?? "the plan"} through ${through}.`,
                  )
                ) {
                  return;
                }
                void run("Paid and renewed.", () => markPaidAndRenew(selected.id));
              }}
            >
              Mark Paid & Renew
            </Button>
            {selected.status === "PAYMENT_REPORTED" ||
            selected.storedStatus === "PAYMENT_REPORTED" ? (
              <Button
                className="h-11"
                variant="outline"
                onClick={() => {
                  if (
                    !window.confirm(
                      "Payment could not be confirmed.\n\nThis will return the invoice to Payment Due. The organization will not be activated or renewed.",
                    )
                  ) {
                    return;
                  }
                  void run("Returned to Payment Due.", () =>
                    markPlatformInvoicePaymentNotFound(selected.id),
                  );
                }}
              >
                Payment Not Found
              </Button>
            ) : null}
            <Button
              className="h-11"
              variant="outline"
              onClick={() => run("Marked overdue.", () => markPlatformInvoiceOverdue(selected.id))}
            >
              Mark overdue
            </Button>
            <Button
              className="h-11"
              variant="outline"
              onClick={() => run("Voided.", () => voidPlatformInvoice(selected.id))}
            >
              Void
            </Button>
          </div>
        </section>
      ) : null}

      {settings ? (
        <section className="space-y-3 rounded-lg border border-border bg-card px-4 py-4">
          <h2 className="text-sm font-semibold">Billing notes (optional)</h2>
          <p className="text-xs text-muted-foreground">
            Snapshotted onto issued invoices as customer-facing payment notes.
            Do not include private account credentials. Prefer secure payment links.
          </p>
          <Input
            className="h-11"
            placeholder="Legal name"
            value={settings.billingLegalName ?? ""}
            onChange={(event) =>
              setSettings({ ...settings, billingLegalName: event.target.value })
            }
          />
          <Input
            className="h-11"
            placeholder="Billing email"
            value={settings.billingEmail ?? ""}
            onChange={(event) =>
              setSettings({ ...settings, billingEmail: event.target.value })
            }
          />
          <textarea
            className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Optional customer payment notes (provider-neutral)"
            value={settings.billingInstructions ?? ""}
            onChange={(event) =>
              setSettings({ ...settings, billingInstructions: event.target.value })
            }
          />
          <Button
            className="h-11"
            onClick={() => run("Billing settings saved.", () => updateBillingSettings(settings))}
          >
            Save notes
          </Button>
        </section>
      ) : null}
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
