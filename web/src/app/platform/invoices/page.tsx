"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  activateFromInvoice,
  createPlatformInvoice,
  getBillingSettings,
  issuePlatformInvoice,
  listPlatformInvoices,
  markPlatformInvoicePaid,
  updateBillingSettings,
  voidPlatformInvoice,
  type BillingSettings,
  type InvoiceSummary,
} from "@/lib/billing";
import { listPlatformOrganizations, listPlatformPlans } from "@/lib/platform";
import type { SubscriptionPlan } from "@/lib/subscription";
import { useEffect, useState } from "react";

export default function PlatformInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [planCode, setPlanCode] = useState("professional");
  const [type, setType] = useState("ACTIVATION");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listPlatformInvoices(),
      listPlatformOrganizations(),
      listPlatformPlans(),
      getBillingSettings(),
    ]).then(([nextInvoices, nextOrgs, nextPlans, nextSettings]) => {
      if (cancelled) return;
      setInvoices(nextInvoices);
      setOrgs(nextOrgs);
      setPlans(nextPlans);
      setSettings(nextSettings);
      setOrganizationId((current) => current || nextOrgs[0]?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setInvoices(await listPlatformInvoices());
  }

  async function run(label: string, work: () => Promise<unknown>) {
    setMessage(null);
    try {
      await work();
      await refresh();
      setMessage(label);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Action failed.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manual B2B invoices. Marking paid does not activate a subscription
          until you confirm Activate / Renew.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Create invoice</h2>
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
            run("Draft invoice saved.", () =>
              createPlatformInvoice({
                organizationId,
                planCode,
                type,
              }),
            )
          }
        >
          Save Draft
        </Button>
      </section>

      <section className="scroll-x-pane rounded-lg border border-border bg-card">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Invoice</th>
              <th className="px-3 py-2 font-medium">Organization</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr key={invoice.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{invoice.invoiceNumber}</td>
                <td className="px-3 py-2">{invoice.organization?.name ?? "—"}</td>
                <td className="px-3 py-2">{invoice.amountLabel}</td>
                <td className="px-3 py-2">{invoice.status}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button className="h-8" variant="outline" onClick={() => run("Issued.", () => issuePlatformInvoice(invoice.id))}>
                      Issue
                    </Button>
                    <Button className="h-8" variant="outline" onClick={() => run("Marked paid. Subscription is unchanged.", () => markPlatformInvoicePaid(invoice.id))}>
                      Mark Paid
                    </Button>
                    <Button
                      className="h-8"
                      variant="outline"
                      onClick={() => {
                        if (
                          !window.confirm(
                            "Confirm activate or renew this organization's subscription from the paid invoice? Marking paid is not enough — this step updates access.",
                          )
                        ) {
                          return;
                        }
                        void run("Subscription updated from this invoice.", () =>
                          activateFromInvoice(invoice.id),
                        );
                      }}
                    >
                      Activate / Renew
                    </Button>
                    <Button className="h-8" variant="outline" onClick={() => run("Voided.", () => voidPlatformInvoice(invoice.id))}>
                      Void
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {settings ? (
        <section className="space-y-3 rounded-lg border border-border bg-card px-4 py-4">
          <h2 className="text-sm font-semibold">Payment instructions</h2>
          <p className="text-xs text-muted-foreground">
            These details are shown only on issued invoices to owners and admins.
            They are not published on the website.
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
            placeholder="Bank / Wise / Payoneer instructions"
            value={settings.billingInstructions ?? ""}
            onChange={(event) =>
              setSettings({ ...settings, billingInstructions: event.target.value })
            }
          />
          <Button
            className="h-11"
            onClick={() => run("Billing settings saved.", () => updateBillingSettings(settings))}
          >
            Save instructions
          </Button>
        </section>
      ) : null}
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
