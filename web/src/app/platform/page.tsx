"use client";

import {
  getPlatformDashboard,
  type PlatformDashboard,
} from "@/lib/platform";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const className = "block rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const content = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {href ? <p className="mt-2 text-xs text-primary">View organizations</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>
      {content}
    </div>
  );
}

const QUICK_LINKS = [
  { href: "/platform/organizations", title: "Find an organization", detail: "Search workspaces and review their subscription status." },
  { href: "/platform/activation-requests", title: "Review activation requests", detail: "Follow up on activation and commercial requests." },
  { href: "/platform/invoices", title: "Manage invoices", detail: "Prepare invoices, record payment, and review billing history." },
  { href: "/platform/notifications", title: "View platform alerts", detail: "Review billing and workspace events that need attention." },
];

export default function PlatformDashboardPage() {
  const [data, setData] = useState<PlatformDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getPlatformDashboard());
    } catch {
      setError("The platform dashboard could not be loaded. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return <p role="status" className="text-sm text-muted-foreground">Loading platform overview…</p>;
  }

  if (error && !data) {
    return (
      <section className="rounded-lg border border-border bg-card p-5">
        <h1 className="text-xl font-semibold">Platform dashboard</h1>
        <p role="alert" className="mt-2 text-sm text-muted-foreground">{error}</p>
        <button type="button" className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => void load()}>
          Try again
        </button>
      </section>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform dashboard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Workspace health and administrative work across FieldKeel.
          </p>
        </div>
        <button type="button" className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh overview"}
        </button>
      </div>

      {error ? <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">Refresh failed. Showing the last successfully loaded overview.</p> : null}

      <section aria-labelledby="quick-actions-heading">
        <h2 id="quick-actions-heading" className="text-sm font-semibold">Quick actions</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="font-medium group-hover:text-primary">{item.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{item.detail}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="workspace-health-heading">
        <h2 id="workspace-health-heading" className="text-sm font-semibold">Workspace health</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total organizations" value={data.totalOrganizations} href="/platform/organizations" />
          <StatCard label="Trial" value={data.trialOrganizations} href="/platform/organizations?subscriptionStatus=TRIALING" />
          <StatCard label="Grace" value={data.graceOrganizations} href="/platform/organizations?subscriptionStatus=GRACE" />
          <StatCard label="Active" value={data.activeOrganizations} href="/platform/organizations?subscriptionStatus=ACTIVE" />
          <StatCard label="Expired trials" value={data.expiredTrials} href="/platform/organizations?subscriptionStatus=TRIAL_EXPIRED" />
          <StatCard label="Suspended" value={data.suspendedOrganizations} href="/platform/organizations?status=SUSPENDED" />
          <StatCard label="Total users" value={data.totalUsers} />
          <StatCard label="Total jobs" value={data.totalJobs} />
          <StatCard label="Activation requests" value={data.activationRequests} href="/platform/activation-requests" />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Recent signups</h2>
            <p className="mt-1 text-sm text-muted-foreground">Open an organization to review its account details.</p>
          </div>
          <Link href="/platform/organizations" className="text-sm font-medium text-primary">Browse all organizations</Link>
        </div>
        <div className="mt-3 scroll-x-pane rounded-lg border border-border bg-card">
          <table className="w-full min-w-xl text-left text-sm">
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
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/platform/organizations/${row.id}`} className="font-medium text-primary">{row.name}</Link>
                    <p className="text-xs text-muted-foreground">{row.slug}</p>
                  </td>
                  <td className="px-3 py-2">{row.planName ?? "—"}</td>
                  <td className="px-3 py-2">{row.effectiveStatus?.replaceAll("_", " ") ?? "—"}</td>
                  <td className="px-3 py-2">{new Date(row.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.recentSignups.length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground">No signups yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
