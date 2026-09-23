"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listPlatformOrganizations,
  listPlatformPlans,
  type PlatformOrganization,
} from "@/lib/platform";
import type { SubscriptionPlan } from "@/lib/subscription";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const SUB_STATUSES = [
  "",
  "TRIALING",
  "GRACE",
  "ACTIVE",
  "TRIAL_EXPIRED",
  "EXPIRED",
  "SUSPENDED",
  "CANCELLED",
  "PAID_GRACE",
] as const;

export default function PlatformOrganizationsPage() {
  const [rows, setRows] = useState<PlatformOrganization[] | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const load = useCallback(() => {
    return listPlatformOrganizations({
      search: search || undefined,
      status: status || undefined,
      subscriptionStatus: subscriptionStatus || undefined,
      planCode: planCode || undefined,
      createdFrom: createdFrom || undefined,
      createdTo: createdTo || undefined,
    }).then(setRows);
  }, [search, status, subscriptionStatus, planCode, createdFrom, createdTo]);

  useEffect(() => {
    let cancelled = false;
    listPlatformPlans()
      .then((next) => {
        if (!cancelled) setPlans(next);
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Search tenants and manage subscriptions manually. Job and client detail
        is not exposed here.
      </p>

      <form
        className="mt-6 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          void load().catch(() => setRows([]));
        }}
      >
        <div className="sm:col-span-2 lg:col-span-1">
          <Label htmlFor="search">Name or slug</Label>
          <Input
            id="search"
            className="mt-1 h-11"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search…"
          />
        </div>
        <div>
          <Label htmlFor="orgStatus">Org status</Label>
          <select
            id="orgStatus"
            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Any</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="DEACTIVATED">DEACTIVATED</option>
          </select>
        </div>
        <div>
          <Label htmlFor="subStatus">Subscription status</Label>
          <select
            id="subStatus"
            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={subscriptionStatus}
            onChange={(event) => setSubscriptionStatus(event.target.value)}
          >
            {SUB_STATUSES.map((value) => (
              <option key={value || "any"} value={value}>
                {value || "Any"}
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
            <option value="">Any</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.code}>
                {plan.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="createdFrom">Created from</Label>
          <Input
            id="createdFrom"
            type="date"
            className="mt-1 h-11"
            value={createdFrom}
            onChange={(event) => setCreatedFrom(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="createdTo">Created to</Label>
          <Input
            id="createdTo"
            type="date"
            className="mt-1 h-11"
            value={createdTo}
            onChange={(event) => setCreatedTo(event.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" className="h-11 w-full sm:w-auto">
            Apply filters
          </Button>
        </div>
      </form>

      <div className="mt-6 scroll-x-pane rounded-lg border border-border bg-card">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Organization</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <Link
                    href={`/platform/organizations/${row.id}`}
                    className="font-medium text-primary"
                  >
                    {row.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{row.slug}</p>
                </td>
                <td className="px-3 py-2">
                  {row.owner ? (
                    <>
                      {row.owner.fullName}
                      <p className="text-xs text-muted-foreground">
                        {row.owner.email}
                      </p>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.subscription?.plan.name ?? "—"}
                </td>
                <td className="px-3 py-2">
                  {row.subscription?.effectiveStatus.replaceAll("_", " ") ??
                    "—"}
                </td>
                <td className="px-3 py-2">
                  {row.createdAt
                    ? new Date(row.createdAt).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && rows.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No organizations match these filters.
          </p>
        ) : null}
      </div>
    </div>
  );
}
