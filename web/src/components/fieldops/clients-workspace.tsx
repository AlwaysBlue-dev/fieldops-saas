"use client";

import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { FilterBar } from "@/components/fieldops/filter-bar";
import { MobileList, MobileListItem } from "@/components/fieldops/mobile-list";
import { PageHeader } from "@/components/fieldops/page-header";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { canManageCustomers, resolveCurrentMembership } from "@/lib/current-org";
import { listClients, type ClientStatus, type ClientSummary } from "@/lib/clients";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientFormSheet } from "./client-form-sheet";
import { MutationButton } from "./mutation-control";

function activityLabel(client: ClientSummary) {
  if (client.lastJob) {
    return `${client.lastJob.jobNumber} · ${client.lastJob.title}`;
  }
  return `${client.siteCount} site${client.siteCount === 1 ? "" : "s"}`;
}

export function ClientsWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ClientStatus | "">("");
  const [statusFilter, setStatusFilter] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(params.orgSlug)
      .then((membership) => {
        if (cancelled || !membership) {
          if (!cancelled) {
            setError("Organization not found");
            setStatusFilter("error");
          }
          return;
        }
        setOrganizationId(membership.organization.id);
        setCanManage(canManageCustomers(membership));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load workspace.");
        setStatusFilter("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      const result = await listClients(organizationId, {
        search: search.trim() || undefined,
        status,
        pageSize: 50,
        sort: "name",
      });
      setClients(result.items);
      setTotal(result.total);
      setStatusFilter("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load clients.");
      setStatusFilter("error");
    }
  }, [organizationId, search, status]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    listClients(organizationId, {
      search: search.trim() || undefined,
      status,
      pageSize: 50,
      sort: "name",
    })
      .then((result) => {
        if (cancelled) return;
        setClients(result.items);
        setTotal(result.total);
        setStatusFilter("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load clients.");
        setStatusFilter("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, search, status]);

  const counts = useMemo(
    () => ({
      active: clients.filter((item) => item.status === "ACTIVE").length,
      sites: clients.reduce((sum, item) => sum + item.siteCount, 0),
    }),
    [clients],
  );

  if (statusFilter === "loading" && !organizationId) {
    return <SkeletonBlock rows={8} />;
  }
  if (statusFilter === "error" || !organizationId) {
    return <ErrorState description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <PageHeader
        title="Customers"
        description="Accounts and service locations for this organization."
        hideTitleOnMobile
        actions={
          canManage ? (
            <MutationButton className="hidden h-8 md:inline-flex" onClick={() => setCreateOpen(true)}>
              Add Client
            </MutationButton>
          ) : null
        }
      />

      <div className="hidden gap-3 md:grid md:grid-cols-3">
        <SummaryCard label="Accounts" value={String(total)} hint="In this organization" />
        <SummaryCard
          label="Active"
          value={String(counts.active)}
          hint="Currently serviceable"
        />
        <SummaryCard
          label="Sites"
          value={String(counts.sites)}
          hint="Locations on loaded accounts"
        />
      </div>

      <FilterBar>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, code, or contact"
          className="h-11 max-w-sm md:h-8"
          aria-label="Search clients"
        />
        <select
          aria-label="Filter by status"
          className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={status}
          onChange={(event) => setStatus(event.target.value as ClientStatus | "")}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </FilterBar>

      <div className="hidden divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:block">
        {clients.length === 0 ? (
          <div className="px-4">
            <EmptyState
              title="No customers yet"
              description="Add a client to start attaching sites and jobs. Nothing is seeded into this view beyond live organization records."
            />
          </div>
        ) : (
          clients.map((client) => (
            <button
              key={client.id}
              type="button"
              className="flex w-full items-start gap-4 px-4 py-3 text-left hover:bg-muted/60"
              onClick={() =>
                router.push(`/app/${params.orgSlug}/clients/${client.id}`)
              }
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{client.name}</p>
                  <StatusPill
                    label={client.status === "ACTIVE" ? "Active" : "Inactive"}
                    tone={client.status === "ACTIVE" ? "emerald" : "muted"}
                  />
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {client.primaryContactName || "No primary contact"}
                  {client.primaryContactEmail ? ` · ${client.primaryContactEmail}` : ""}
                </p>
              </div>
              <div className="w-28 shrink-0 text-right">
                <p className="type-numeric text-sm">{client.siteCount}</p>
                <p className="text-xs text-muted-foreground">
                  {client.siteCount === 1 ? "site" : "sites"}
                </p>
              </div>
              <div className="hidden min-w-0 flex-1 lg:block">
                <p className="truncate text-sm">{activityLabel(client)}</p>
                <p className="text-xs text-muted-foreground">
                  {client.lastJob ? "Latest job" : "No jobs yet"}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      <MobileList
        empty={
          <EmptyState
            title="No customers yet"
            description="Accounts you add will appear here as service cards."
          />
        }
      >
        {clients.map((client) => (
          <button
            key={client.id}
            type="button"
            className="w-full text-left"
            onClick={() => router.push(`/app/${params.orgSlug}/clients/${client.id}`)}
          >
            <MobileListItem
              title={client.name}
              meta={`${client.primaryContactName ?? "No contact"} · ${client.siteCount} sites`}
              trailing={
                <StatusPill
                  label={client.status === "ACTIVE" ? "Active" : "Inactive"}
                  tone={client.status === "ACTIVE" ? "emerald" : "muted"}
                />
              }
            />
          </button>
        ))}
      </MobileList>

      {canManage ? (
        <div className="md:hidden">
          <MutationButton className="h-11 w-full" onClick={() => setCreateOpen(true)}>
            Add Client
          </MutationButton>
        </div>
      ) : null}

      <ClientFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={organizationId}
        onSaved={() => void load()}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="type-label text-muted-foreground">{label}</p>
      <p className="type-numeric mt-1 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
