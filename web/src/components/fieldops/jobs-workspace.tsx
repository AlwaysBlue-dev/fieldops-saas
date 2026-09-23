"use client";

import { DataGrid } from "@/components/fieldops/data-grid";
import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { FilterBar } from "@/components/fieldops/filter-bar";
import { MobileList, MobileListItem } from "@/components/fieldops/mobile-list";
import { MutationButton } from "@/components/fieldops/mutation-control";
import { PageHeader } from "@/components/fieldops/page-header";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { listClients, type ClientSummary } from "@/lib/clients";
import { canCreateJobs, resolveCurrentMembership } from "@/lib/current-org";
import {
  dispatchJob,
  listJobs,
  priorityTone,
  statusLabel,
  statusTone,
  type JobPriority,
  type JobStatus,
  type JobSummary,
} from "@/lib/jobs";
import { listTeams, listTechnicians, type TeamSummary, type TechnicianSummary } from "@/lib/teams";
import { formatDateTimeInZone, formatYmdInZone } from "@/lib/timezone";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const PRESETS = [
  { id: "", label: "All" },
  { id: "open", label: "Open" },
  { id: "today", label: "Today" },
  { id: "unassigned", label: "Unassigned" },
  { id: "approval", label: "Needs approval" },
] as const;

export function JobsWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [canCreate, setCanCreate] = useState(false);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState<JobStatus | "">(
    (searchParams.get("status") as JobStatus) ?? "",
  );
  const [priority, setPriority] = useState<JobPriority | "">(
    (searchParams.get("priority") as JobPriority) ?? "",
  );
  const [teamId, setTeamId] = useState(searchParams.get("team") ?? "");
  const [technicianId, setTechnicianId] = useState(searchParams.get("tech") ?? "");
  const [clientId, setClientId] = useState(searchParams.get("client") ?? "");
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>(
    (searchParams.get("preset") as (typeof PRESETS)[number]["id"]) ?? "open",
  );
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

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
        setTimezone(membership.organization.timezone);
        setCanCreate(canCreateJobs(membership));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load jobs.");
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const date =
      preset === "today" ? formatYmdInZone(new Date(), timezone) : undefined;
    const [result, teamResult, techResult, clientResult] = await Promise.all([
      listJobs(organizationId, {
        search: search.trim() || undefined,
        status,
        priority,
        teamId: teamId || undefined,
        technicianId: technicianId || undefined,
        clientId: clientId || undefined,
        preset: preset || undefined,
        date,
        pageSize: 50,
        sort: "scheduledStart",
        order: "asc",
      }),
      listTeams(organizationId, { pageSize: 50, status: "ACTIVE" }),
      listTechnicians(organizationId, { pageSize: 100 }),
      listClients(organizationId, { pageSize: 50, status: "ACTIVE" }),
    ]);
    setJobs(result.items);
    setTotal(result.total);
    setTeams(teamResult.items);
    setTechnicians(techResult.items);
    setClients(clientResult.items);
    setLoadState("ready");
  }, [
    organizationId,
    search,
    status,
    priority,
    teamId,
    technicianId,
    clientId,
    preset,
    timezone,
  ]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    const date =
      preset === "today" ? formatYmdInZone(new Date(), timezone) : undefined;
    Promise.all([
      listJobs(organizationId, {
        search: search.trim() || undefined,
        status,
        priority,
        teamId: teamId || undefined,
        technicianId: technicianId || undefined,
        clientId: clientId || undefined,
        preset: preset || undefined,
        date,
        pageSize: 50,
        sort: "scheduledStart",
        order: "asc",
      }),
      listTeams(organizationId, { pageSize: 50, status: "ACTIVE" }),
      listTechnicians(organizationId, { pageSize: 100 }),
      listClients(organizationId, { pageSize: 50, status: "ACTIVE" }),
    ])
      .then(([result, teamResult, techResult, clientResult]) => {
        if (cancelled) return;
        setJobs(result.items);
        setTotal(result.total);
        setTeams(teamResult.items);
        setTechnicians(techResult.items);
        setClients(clientResult.items);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load jobs.");
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [
    organizationId,
    search,
    status,
    priority,
    teamId,
    technicianId,
    clientId,
    preset,
    timezone,
  ]);

  const createHref = `/app/${params.orgSlug}/jobs/new`;

  const counts = useMemo(
    () => ({
      open: jobs.filter(
        (job) => job.status !== "COMPLETED" && job.status !== "CANCELLED",
      ).length,
      field: jobs.filter((job) => job.status === "IN_PROGRESS").length,
    }),
    [jobs],
  );

  async function quickDispatch(job: JobSummary) {
    if (!organizationId) return;
    try {
      await dispatchJob(organizationId, job.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not dispatch job.");
    }
  }

  if (loadState === "loading" && !organizationId) {
    return <SkeletonBlock rows={8} />;
  }
  if (loadState === "error" || !organizationId) {
    return <ErrorState description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <PageHeader
        title="Jobs"
        description="Operational job cards for this organization. Times use the organization timezone."
        hideTitleOnMobile
        actions={
          canCreate ? (
            <MutationButton className="hidden h-8 md:inline-flex" asChild>
              <Link href={createHref}>Create job</Link>
            </MutationButton>
          ) : null
        }
      />

      <div className="hidden gap-3 md:grid md:grid-cols-3">
        <SummaryCard label="In view" value={String(total)} hint="Matching current filters" />
        <SummaryCard label="Open on page" value={String(counts.open)} hint="Not completed or cancelled" />
        <SummaryCard label="In field" value={String(counts.field)} hint="Currently in progress" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((item) => (
          <Button
            key={item.id || "all"}
            type="button"
            variant={preset === item.id ? "default" : "outline"}
            className="h-11 md:h-8"
            onClick={() => setPreset(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <FilterBar>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search number, title, client, or site"
          className="h-11 max-w-sm md:h-8"
          aria-label="Search jobs"
        />
        <select
          aria-label="Filter by status"
          className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={status}
          onChange={(event) => setStatus(event.target.value as JobStatus | "")}
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="DISPATCHED">Dispatched</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="PENDING_APPROVAL">Pending approval</option>
          <option value="COMPLETED">Completed</option>
          <option value="RETURNED">Returned</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select
          aria-label="Filter by priority"
          className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={priority}
          onChange={(event) => setPriority(event.target.value as JobPriority | "")}
        >
          <option value="">All priorities</option>
          <option value="LOW">Low</option>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
        <select
          aria-label="Filter by team"
          className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
        >
          <option value="">All teams</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by technician"
          className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={technicianId}
          onChange={(event) => setTechnicianId(event.target.value)}
        >
          <option value="">All technicians</option>
          {technicians.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.fullName}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by client"
          className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
        >
          <option value="">All clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </FilterBar>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <DataGrid
        rows={jobs}
        empty={
          <EmptyState
            title="No jobs in this view"
            description="Create a draft or change filters. This list only shows live organization records."
          />
        }
        columns={[
          {
            key: "job",
            header: "Job",
            cell: (job) => (
              <Link href={`/app/${params.orgSlug}/jobs/${job.id}`} className="block min-w-0">
                <p className="font-medium">
                  {job.jobNumber} · {job.title}
                </p>
                {job.workOrderNumber ? (
                  <p className="text-xs text-muted-foreground">WO {job.workOrderNumber}</p>
                ) : null}
              </Link>
            ),
          },
          {
            key: "customer",
            header: "Customer / site",
            cell: (job) => (
              <div>
                <p>{job.client.name}</p>
                <p className="text-xs text-muted-foreground">{job.site.name}</p>
              </div>
            ),
          },
          {
            key: "schedule",
            header: "Schedule",
            cell: (job) => (
              <span className="text-sm">
                {formatDateTimeInZone(job.scheduledStart, timezone)}
              </span>
            ),
          },
          {
            key: "team",
            header: "Team",
            cell: (job) => (
              <span>
                {job.team?.name ??
                  (job.technicians[0]?.fullName ?? "Unassigned")}
              </span>
            ),
          },
          {
            key: "priority",
            header: "Priority",
            cell: (job) => (
              <StatusPill label={job.priority} tone={priorityTone(job.priority)} />
            ),
          },
          {
            key: "status",
            header: "Status",
            cell: (job) => (
              <StatusPill label={statusLabel(job.status)} tone={statusTone(job.status)} />
            ),
          },
          {
            key: "actions",
            header: "",
            className: "w-40 text-right",
            cell: (job) => (
              <div className="flex justify-end gap-1">
                {canCreate && job.status === "SCHEDULED" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8"
                    onClick={() => void quickDispatch(job)}
                  >
                    Dispatch
                  </Button>
                ) : null}
                <Button asChild variant="ghost" className="h-8">
                  <Link href={`/app/${params.orgSlug}/jobs/${job.id}`}>Open</Link>
                </Button>
              </div>
            ),
          },
        ]}
      />

      <MobileList
        empty={
          <EmptyState
            title="No jobs"
            description="Assigned and created work will appear here as cards."
          />
        }
      >
        {jobs.map((job) => (
          <button
            key={job.id}
            type="button"
            className="w-full text-left"
            onClick={() => router.push(`/app/${params.orgSlug}/jobs/${job.id}`)}
          >
            <MobileListItem
              title={`${job.jobNumber} · ${job.title}`}
              meta={`${job.client.name} · ${job.site.name} · ${formatDateTimeInZone(job.scheduledStart, timezone)}`}
              trailing={
                <div className="flex flex-col items-end gap-1">
                  <StatusPill label={job.priority} tone={priorityTone(job.priority)} />
                  <StatusPill label={statusLabel(job.status)} tone={statusTone(job.status)} />
                </div>
              }
            />
          </button>
        ))}
      </MobileList>

      {canCreate ? (
        <div className="md:hidden">
          <MutationButton className="h-11 w-full" asChild>
            <Link href={createHref}>Create job</Link>
          </MutationButton>
        </div>
      ) : null}
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
