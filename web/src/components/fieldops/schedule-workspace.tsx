"use client";

import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { FilterBar } from "@/components/fieldops/filter-bar";
import { PageHeader } from "@/components/fieldops/page-header";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { listClients, type ClientSummary } from "@/lib/clients";
import {
  canEditSchedule,
  resolveCurrentMembership,
} from "@/lib/current-org";
import {
  getSchedule,
  isScheduleConflict,
  priorityTone,
  scheduleJob,
  statusLabel,
  statusTone,
  type JobPriority,
  type JobStatus,
  type ScheduleBoard as ScheduleBoardData,
  type ScheduleConflict,
  type ScheduleJob,
} from "@/lib/schedule";
import { listTeams, listTechnicians, type TeamSummary, type TechnicianSummary } from "@/lib/teams";
import { addCalendarDays, formatYmdInZone } from "@/lib/timezone";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScheduleAgenda } from "./schedule-agenda";
import { ScheduleBoard } from "./schedule-board";
import { ScheduleJobSheet } from "./schedule-job-sheet";

export function ScheduleWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [canEdit, setCanEdit] = useState(false);
  const [showTechnician, setShowTechnician] = useState(false);
  const [board, setBoard] = useState<ScheduleBoardData | null>(null);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [view, setView] = useState<"day" | "week">("day");
  const [date, setDate] = useState(() => formatYmdInZone(new Date(), "UTC"));
  const [teamId, setTeamId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<JobStatus | "">("");
  const [priority, setPriority] = useState<JobPriority | "">("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ScheduleJob | null>(null);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [pendingDrop, setPendingDrop] = useState<{
    jobId: string;
    scheduledStart: string;
    expectedFinish: string;
    technicianUserIds?: string[];
    teamId?: string | null;
    confirmOverlap?: boolean;
  } | null>(null);

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
        setCanEdit(canEditSchedule(membership));
        setShowTechnician(membership.role === "TECHNICIAN");
        setDate(formatYmdInZone(new Date(), membership.organization.timezone));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load schedule.");
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const [next, teamResult, techResult, clientResult] = await Promise.all([
      getSchedule(organizationId, {
        date,
        range: "week",
        teamId: teamId || undefined,
        technicianId: technicianId || undefined,
        clientId: clientId || undefined,
        status,
        priority,
      }),
      listTeams(organizationId, { pageSize: 50, status: "ACTIVE" }),
      listTechnicians(organizationId, { pageSize: 100 }),
      listClients(organizationId, { pageSize: 50, status: "ACTIVE" }),
    ]);
    setBoard(next);
    setTeams(teamResult.items);
    setTechnicians(techResult.items);
    setClients(clientResult.items);
    setLoadState("ready");
  }, [organizationId, date, teamId, technicianId, clientId, status, priority]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    Promise.all([
      getSchedule(organizationId, {
        date,
        range: "week",
        teamId: teamId || undefined,
        technicianId: technicianId || undefined,
        clientId: clientId || undefined,
        status,
        priority,
      }),
      listTeams(organizationId, { pageSize: 50, status: "ACTIVE" }),
      listTechnicians(organizationId, { pageSize: 100 }),
      listClients(organizationId, { pageSize: 50, status: "ACTIVE" }),
    ])
      .then(([next, teamResult, techResult, clientResult]) => {
        if (cancelled) return;
        setBoard(next);
        setTeams(teamResult.items);
        setTechnicians(techResult.items);
        setClients(clientResult.items);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load schedule.");
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, date, teamId, technicianId, clientId, status, priority]);

  const visibleBoard = useMemo(() => {
    if (!board) return null;
    if (view === "week") {
      return { ...board, range: "week" as const, date: board.date };
    }
    return {
      ...board,
      range: "day" as const,
      date,
      lanes: board.lanes.map((lane) => ({
        ...lane,
        jobs: lane.jobs.filter((job) =>
          job.scheduledStart
            ? formatYmdInZone(new Date(job.scheduledStart), board.timezone) === date
            : false,
        ),
      })),
    };
  }, [board, view, date]);

  async function persistDrop(input: {
    jobId: string;
    scheduledStart: string;
    expectedFinish: string;
    technicianUserIds?: string[];
    teamId?: string | null;
    confirmOverlap?: boolean;
  }) {
    if (!organizationId) return;
    try {
      await scheduleJob(organizationId, input.jobId, {
        scheduledStart: input.scheduledStart,
        expectedFinish: input.expectedFinish,
        technicianUserIds: input.technicianUserIds,
        teamId: input.teamId,
        confirmOverlap: input.confirmOverlap,
      });
      setConflicts([]);
      setPendingDrop(null);
      await load();
    } catch (err) {
      if (isScheduleConflict(err)) {
        setPendingDrop(input);
        setConflicts(err.conflicts);
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not move job.");
      }
    }
  }

  if (loadState === "loading" && !organizationId) {
    return <SkeletonBlock rows={8} />;
  }
  if (loadState === "error" || !organizationId || !visibleBoard) {
    return <ErrorState description={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <PageHeader
        title="Schedule"
        description={`Dispatch board in ${visibleBoard.timezone}. Times are stored in UTC.`}
        hideTitleOnMobile
        actions={
          <div className="hidden items-center gap-2 md:flex">
            <Button variant={view === "day" ? "default" : "outline"} className="h-8" onClick={() => setView("day")}>
              Day
            </Button>
            <Button variant={view === "week" ? "default" : "outline"} className="h-8" onClick={() => setView("week")}>
              Week
            </Button>
            <Button
              variant="outline"
              className="h-8"
              onClick={() => setDate(formatYmdInZone(new Date(), timezone))}
            >
              Today
            </Button>
          </div>
        }
      />

      <FilterBar>
        <Input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="h-11 w-auto md:h-8"
          aria-label="Schedule date"
        />
        <Button
          variant="outline"
          className="h-11 md:hidden"
          onClick={() => setDate(formatYmdInZone(new Date(), timezone))}
        >
          Today
        </Button>
        <Button
          variant="outline"
          className="h-11 md:h-8"
          onClick={() => setDate(addCalendarDays(date, view === "week" ? -7 : -1))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          className="h-11 md:h-8"
          onClick={() => setDate(addCalendarDays(date, view === "week" ? 7 : 1))}
        >
          Next
        </Button>
        {!showTechnician ? (
          <>
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
          </>
        ) : null}
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
      </FilterBar>

      {conflicts.length > 0 && pendingDrop ? (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <p className="font-medium">Overlap needs confirmation</p>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {conflicts.map((item) => (
              <li key={`${item.jobId}-${item.userId}`}>
                {item.fullName} is already on {item.jobNumber}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button
              className="h-11 md:h-8"
              onClick={() => void persistDrop({ ...pendingDrop, confirmOverlap: true })}
            >
              Confirm move
            </Button>
            <Button
              variant="outline"
              className="h-11 md:h-8"
              onClick={() => {
                setConflicts([]);
                setPendingDrop(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error && conflicts.length === 0 ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <ScheduleBoard
            board={visibleBoard}
            canEdit={canEdit}
            onOpenJob={setSelected}
            onDropSchedule={(input) => void persistDrop(input)}
          />
          <ScheduleAgenda
            board={board ?? visibleBoard}
            onOpenJob={setSelected}
          />
        </div>
        {!showTechnician ? (
          <aside className="rounded-lg border border-border bg-card px-3 py-3">
            <h2 className="text-sm font-semibold">Unassigned</h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Jobs with no team and no technician.
            </p>
            {visibleBoard.unassigned.length === 0 ? (
              <EmptyState
                title="Queue clear"
                description="Unassigned work will list here when it exists."
              />
            ) : (
              <ul className="space-y-2">
                {visibleBoard.unassigned.map((job) => (
                  <li key={job.id}>
                    <button
                      type="button"
                      className="w-full rounded-md border border-border px-2 py-2 text-left hover:bg-muted/50"
                      onClick={() => setSelected(job)}
                    >
                      <p className="text-sm font-medium">
                        {job.jobNumber} · {job.client.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{job.site.name}</p>
                      <div className="mt-1 flex gap-1">
                        <StatusPill label={job.priority} tone={priorityTone(job.priority)} />
                        <StatusPill label={statusLabel(job.status)} tone={statusTone(job.status)} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        ) : null}
      </div>

      <ScheduleJobSheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        organizationId={organizationId}
        orgSlug={params.orgSlug}
        timezone={visibleBoard.timezone}
        job={selected}
        technicians={technicians}
        teams={teams}
        canEdit={canEdit}
        onSaved={() => void load()}
      />
    </div>
  );
}
