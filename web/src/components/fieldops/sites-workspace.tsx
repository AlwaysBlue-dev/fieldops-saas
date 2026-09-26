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
import {
  formatSiteAddress,
  listSites,
  type ClientStatus,
  type SiteRecord,
} from "@/lib/clients";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MutationButton } from "./mutation-control";
import { SiteFormSheet } from "./site-form-sheet";

export function SitesWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [sites, setSites] = useState<SiteRecord[]>([]);
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
      const result = await listSites(organizationId, {
        search: search.trim() || undefined,
        status,
        pageSize: 50,
        sort: "name",
      });
      setSites(result.items);
      setTotal(result.total);
      setStatusFilter("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load sites.");
      setStatusFilter("error");
    }
  }, [organizationId, search, status]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    listSites(organizationId, {
      search: search.trim() || undefined,
      status,
      pageSize: 50,
      sort: "name",
    })
      .then((result) => {
        if (cancelled) return;
        setSites(result.items);
        setTotal(result.total);
        setStatusFilter("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load sites.");
        setStatusFilter("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, search, status]);

  const counts = useMemo(
    () => ({
      active: sites.filter((item) => item.status === "ACTIVE").length,
    }),
    [sites],
  );

  if (statusFilter === "loading" && !organizationId) {
    return <SkeletonBlock rows={8} />;
  }
  if (statusFilter === "error" || !organizationId) {
    return <ErrorState description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="mx-auto flex max-w-350 flex-col gap-4">
      <PageHeader
        title="Sites"
        description="Service locations across all customers in this organization."
        hideTitleOnMobile
        actions={
          canManage ? (
            <MutationButton
              className="hidden h-8 md:inline-flex"
              onClick={() => setCreateOpen(true)}
            >
              Create Site
            </MutationButton>
          ) : null
        }
      />

      <div className="hidden gap-3 md:grid md:grid-cols-2">
        <SummaryCard label="Sites" value={String(total)} hint="In this organization" />
        <SummaryCard
          label="Active"
          value={String(counts.active)}
          hint="Currently serviceable"
        />
      </div>

      <FilterBar>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search sites…"
          className="h-11 max-w-sm md:h-8"
          aria-label="Search sites"
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
        {sites.length === 0 ? (
          <div className="px-4">
            <EmptyState
              title="No sites yet"
              description="Create a site under a client to start attaching jobs to real locations."
            />
          </div>
        ) : (
          sites.map((site) => (
            <button
              key={site.id}
              type="button"
              className="flex w-full items-start gap-4 px-4 py-3 text-left hover:bg-muted/60"
              onClick={() =>
                router.push(`/app/${params.orgSlug}/clients/${site.clientId}`)
              }
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{site.name}</p>
                  <StatusPill
                    label={site.status === "ACTIVE" ? "Active" : "Inactive"}
                    tone={site.status === "ACTIVE" ? "emerald" : "muted"}
                  />
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {site.client?.name ?? "Unknown client"}
                  {site.siteCode ? ` · ${site.siteCode}` : ""}
                </p>
              </div>
              <div className="hidden min-w-0 flex-1 lg:block">
                <p className="truncate text-sm">
                  {formatSiteAddress(site) || "Address not complete"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {site.timezone ?? "No site timezone"}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      <MobileList
        empty={
          <EmptyState
            title="No sites yet"
            description="Locations you add will appear here as service cards."
          />
        }
      >
        {sites.map((site) => (
          <button
            key={site.id}
            type="button"
            className="w-full text-left"
            onClick={() =>
              router.push(`/app/${params.orgSlug}/clients/${site.clientId}`)
            }
          >
            <MobileListItem
              title={site.name}
              meta={`${site.client?.name ?? "Client"} · ${formatSiteAddress(site) || "No address"}`}
              trailing={
                <StatusPill
                  label={site.status === "ACTIVE" ? "Active" : "Inactive"}
                  tone={site.status === "ACTIVE" ? "emerald" : "muted"}
                />
              }
            />
          </button>
        ))}
      </MobileList>

      {canManage ? (
        <div className="md:hidden">
          <MutationButton className="h-11 w-full" onClick={() => setCreateOpen(true)}>
            Create Site
          </MutationButton>
        </div>
      ) : null}

      <SiteFormSheet
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
