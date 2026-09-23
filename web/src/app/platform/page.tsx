"use client";

import {
  getPlatformDashboard,
  type PlatformDashboard,
} from "@/lib/platform";
import Link from "next/link";
import { useEffect, useState } from "react";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function PlatformDashboardPage() {
  const [data, setData] = useState<PlatformDashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPlatformDashboard()
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading dashboard…</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Platform dashboard
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            SaaS-wide health. Manual subscription management only — no payment
            gateway.
          </p>
        </div>
        <Link
          href="/platform/organizations"
          className="text-sm font-medium text-primary"
        >
          Browse organizations
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total organizations" value={data.totalOrganizations} />
        <StatCard label="Trial" value={data.trialOrganizations} />
        <StatCard label="Grace" value={data.graceOrganizations} />
        <StatCard label="Active" value={data.activeOrganizations} />
        <StatCard label="Expired trials" value={data.expiredTrials} />
        <StatCard label="Suspended" value={data.suspendedOrganizations} />
        <StatCard label="Total users" value={data.totalUsers} />
        <StatCard label="Total jobs" value={data.totalJobs} />
        <StatCard label="Activation requests" value={data.activationRequests} />
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Recent signups</h2>
          <Link
            href="/platform/activation-requests"
            className="text-sm text-primary"
          >
            Open requests ({data.activationRequests})
          </Link>
        </div>
        <div className="mt-3 scroll-x-pane rounded-lg border border-border bg-card">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Signed up</th>
              </tr>
            </thead>
            <tbody>
              {data.recentSignups.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/platform/organizations/${row.id}`}
                      className="font-medium text-primary"
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.slug}</p>
                  </td>
                  <td className="px-3 py-2">{row.planName ?? "—"}</td>
                  <td className="px-3 py-2">
                    {row.effectiveStatus?.replaceAll("_", " ") ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.recentSignups.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No signups yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
