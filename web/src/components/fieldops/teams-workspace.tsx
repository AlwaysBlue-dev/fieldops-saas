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
import {
  canInviteMembers,
  canManageCrew,
  resolveCurrentMembership,
} from "@/lib/current-org";
import {
  listTeams,
  listTechnicians,
  type TeamStatus,
  type TeamSummary,
  type TechnicianSummary,
} from "@/lib/teams";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InviteTechnicianSheet } from "./invite-technician-sheet";
import { MutationButton } from "./mutation-control";
import { PaginationControls } from "./pagination-controls";
import { TeamFormSheet } from "./team-form-sheet";
import { personDisplayName, personSecondaryLine } from "@/lib/person-label";

export function TeamsWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canInvite, setCanInvite] = useState(false);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<TeamStatus | "">("ACTIVE");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(params.orgSlug)
      .then((membership) => {
        if (cancelled || !membership) {
          if (!cancelled) {
            setError("Organization not found");
            setLoadState("error");
          }
          return;
        }
        setOrganizationId(membership.organization.id);
        setCanManage(canManageCrew(membership));
        setCanInvite(canInviteMembers(membership));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load workspace.");
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const [teamResult, techResult] = await Promise.all([
      listTeams(organizationId, {
        search: debouncedSearch || undefined,
        status,
        page,
        pageSize,
      }),
      listTechnicians(organizationId, { pageSize: 20 }),
    ]);
    setTeams(teamResult.items);
    setTotal(teamResult.total);
    setTechnicians(techResult.items);
    setLoadState("ready");
  }, [organizationId, debouncedSearch, status, page, pageSize]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setLoadState("loading");
    Promise.all([
      listTeams(organizationId, {
        search: debouncedSearch || undefined,
        status,
        page,
        pageSize,
      }),
      listTechnicians(organizationId, { pageSize: 20 }),
    ])
      .then(([teamResult, techResult]) => {
        if (cancelled) return;
        setTeams(teamResult.items);
        setTotal(teamResult.total);
        setTechnicians(techResult.items);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load teams.");
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, debouncedSearch, status, page, pageSize]);

  const counts = useMemo(
    () => ({
      active: teams.filter((item) => item.status === "ACTIVE").length,
      members: teams.reduce((sum, item) => sum + item.memberCount, 0),
    }),
    [teams],
  );

  if (loadState === "loading" && !organizationId) {
    return <SkeletonBlock rows={8} />;
  }
  if (loadState === "error" || !organizationId) {
    return <ErrorState description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="mx-auto flex max-w-350 flex-col gap-4">
      <PageHeader
        title="Teams"
        description="Crews, supervisors, and field coverage for this organization."
        hideTitleOnMobile
        actions={
          <div className="hidden gap-2 md:flex">
            {canInvite ? (
              <MutationButton variant="outline" className="h-8" onClick={() => setInviteOpen(true)}>
                Invite technician
              </MutationButton>
            ) : null}
            {canManage ? (
              <MutationButton className="h-8" onClick={() => setCreateOpen(true)}>
                New team
              </MutationButton>
            ) : null}
          </div>
        }
      />

      <div className="hidden gap-3 md:grid md:grid-cols-3">
        <SummaryCard label="Teams" value={String(total)} hint="Visible to your role" />
        <SummaryCard label="Active" value={String(counts.active)} hint="Currently dispatchable" />
        <SummaryCard
          label="Assigned seats"
          value={String(counts.members)}
          hint="Memberships on loaded teams"
        />
      </div>

      <FilterBar>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search team, code, or supervisor"
          className="h-11 max-w-sm md:h-8"
          aria-label="Search teams"
        />
        <select
          aria-label="Filter by status"
          className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as TeamStatus | "");
            setPage(1);
          }}
        >
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="">All statuses</option>
        </select>
      </FilterBar>

      <div className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-3">
        {teams.length === 0 ? (
          <div className="col-span-full rounded-lg border border-border bg-card">
            <EmptyState
              title={
                status === "INACTIVE"
                  ? "No inactive teams"
                  : status === "ACTIVE"
                    ? "No active teams"
                    : "No teams yet"
              }
              description={
                status === "INACTIVE"
                  ? "Deactivated teams appear here so you can review history or reactivate them."
                  : "Create a crew to group technicians for dispatch. This view only shows live organization records."
              }
            />
          </div>
        ) : (
          teams.map((team) => (
            <button
              key={team.id}
              type="button"
              className="flex min-h-42 flex-col rounded-lg border border-border bg-card px-4 py-4 text-left hover:bg-muted/50"
              onClick={() => router.push(`/app/${params.orgSlug}/teams/${team.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{team.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {team.code ?? "No crew code"}
                  </p>
                </div>
                <StatusPill
                  label={team.status === "ACTIVE" ? "Active" : "Inactive"}
                  tone={team.status === "ACTIVE" ? "emerald" : "muted"}
                />
              </div>
              <p className="mt-3 text-sm">
                {team.supervisor
                  ? `Supervisor · ${team.supervisor.fullName}`
                  : "No supervisor assigned"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {team.memberCount === 0
                  ? "No members yet"
                  : team.members
                      .slice(0, 3)
                      .map((member) => member.fullName)
                      .join(", ")}
                {team.memberCount > 3 ? ` +${team.memberCount - 3}` : ""}
              </p>
              <p className="mt-auto pt-3 text-xs text-muted-foreground">
                {team.skillSummary.length > 0
                  ? team.skillSummary.slice(0, 4).join(" · ")
                  : "No skills recorded"}
              </p>
            </button>
          ))
        )}
      </div>

      <MobileList
        empty={
          <EmptyState
            title={
              status === "INACTIVE"
                ? "No inactive teams"
                : status === "ACTIVE"
                  ? "No active teams"
                  : "No teams yet"
            }
            description={
              status === "INACTIVE"
                ? "Deactivated teams appear here so you can reactivate them."
                : "Crews you can see will appear here as cards."
            }
          />
        }
      >
        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            className="w-full text-left"
            onClick={() => router.push(`/app/${params.orgSlug}/teams/${team.id}`)}
          >
            <MobileListItem
              title={team.name}
              meta={`${team.supervisor?.fullName ?? "No supervisor"} · ${team.memberCount} members`}
              trailing={
                <StatusPill
                  label={team.status === "ACTIVE" ? "Active" : "Inactive"}
                  tone={team.status === "ACTIVE" ? "emerald" : "muted"}
                />
              }
            />
          </button>
        ))}
      </MobileList>

      {technicians.length > 0 ? (
        <section className="hidden rounded-lg border border-border bg-card md:block">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Crew directory</h2>
            <p className="text-xs text-muted-foreground">
              People visible from your team membership.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {technicians.slice(0, 8).map((person) => (
              <li key={person.userId}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/50"
                  onClick={() =>
                    router.push(
                      `/app/${params.orgSlug}/teams/technicians/${person.userId}`,
                    )
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {personDisplayName(person)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {personSecondaryLine(person) ??
                        (person.teams.map((team) => team.name).join(", ") ||
                          "Unassigned")}
                      {person.skills.length > 0
                        ? ` · ${person.skills.slice(0, 3).join(", ")}`
                        : ""}
                    </span>
                  </span>
                  <StatusPill label={person.role.replaceAll("_", " ")} tone="cobalt" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-2 md:hidden">
        {canInvite ? (
          <MutationButton className="h-11 w-full" variant="outline" onClick={() => setInviteOpen(true)}>
            Invite technician
          </MutationButton>
        ) : null}
        {canManage ? (
          <MutationButton className="h-11 w-full" onClick={() => setCreateOpen(true)}>
            New team
          </MutationButton>
        ) : null}
      </div>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      <TeamFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizationId={organizationId}
        onSaved={() => void load()}
      />
      <InviteTechnicianSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={organizationId}
        teams={teams}
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
