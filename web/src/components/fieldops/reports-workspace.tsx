"use client";

import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { MutationButton } from "@/components/fieldops/mutation-control";
import { PageHeader } from "@/components/fieldops/page-header";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { MobileList } from "@/components/fieldops/mobile-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  listClientSites,
  listClients,
  type ClientSummary,
  type SiteRecord,
} from "@/lib/clients";
import { resolveCurrentMembership } from "@/lib/current-org";
import {
  downloadJobReportPdf,
  downloadReportCsv,
  formatMinutesLabel,
  getJobStatusReport,
  getJobsReport,
  getLabourReport,
  getReportSummary,
  jobStatusLabel,
  type JobStatusReport,
  type JobsReportTable,
  type LabourReport,
  type ReportFilters,
  type ReportSummary,
} from "@/lib/reports";
import { statusTone, type JobStatus } from "@/lib/schedule";
import {
  listTeams,
  listTechnicians,
  type TeamSummary,
  type TechnicianSummary,
} from "@/lib/teams";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STATUSES = [
  "ALL",
  "SCHEDULED",
  "DISPATCHED",
  "IN_PROGRESS",
  "PENDING_APPROVAL",
  "COMPLETED",
  "RETURNED",
  "CANCELLED",
] as const;

const PRIORITIES = ["ALL", "LOW", "NORMAL", "HIGH", "URGENT"] as const;

function defaultRange(timezone: string) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const end = new Date(`${today}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 13);
  const from = start.toISOString().slice(0, 10);
  return { from, to: today };
}

export function ReportsWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [filters, setFilters] = useState<ReportFilters>({});
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [statusReport, setStatusReport] = useState<JobStatusReport | null>(null);
  const [labour, setLabour] = useState<LabourReport | null>(null);
  const [jobs, setJobs] = useState<JobsReportTable | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(params.orgSlug)
      .then(async (membership) => {
        if (cancelled) return;
        if (!membership) {
          setError("Organization not found");
          setLoadState("error");
          return;
        }
        const orgId = membership.organization.id;
        const tz = membership.organization.timezone;
        setOrganizationId(orgId);
        setTimezone(tz);
        setFilters(defaultRange(tz));
        const [clientRows, teamRows, techRows] = await Promise.all([
          listClients(orgId, { pageSize: 100, status: "ACTIVE" }),
          listTeams(orgId, { pageSize: 50, status: "ACTIVE" }),
          listTechnicians(orgId, { pageSize: 100 }),
        ]);
        if (cancelled) return;
        setClients(clientRows.items);
        setTeams(teamRows.items);
        setTechnicians(techRows.items);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load organization");
          setLoadState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  useEffect(() => {
    if (!organizationId || !filters.clientId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear sites when client cleared
      setSites([]);
      return;
    }
    let cancelled = false;
    listClientSites(organizationId, filters.clientId, {
      status: "ACTIVE",
      pageSize: 50,
    })
      .then((result) => {
        if (!cancelled) setSites(result.items);
      })
      .catch(() => {
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, filters.clientId]);

  const refresh = useCallback(async () => {
    if (!organizationId || !filters.from || !filters.to) return;
    const [nextSummary, nextStatus, nextLabour, nextJobs] = await Promise.all([
      getReportSummary(organizationId),
      getJobStatusReport(organizationId, filters),
      getLabourReport(organizationId, filters),
      getJobsReport(organizationId, { ...filters, page: 1, pageSize: 25 }),
    ]);
    setSummary(nextSummary);
    setStatusReport(nextStatus);
    setLabour(nextLabour);
    setJobs(nextJobs);
    setLoadState("ready");
    setError(null);
  }, [organizationId, filters]);

  useEffect(() => {
    if (!organizationId || !filters.from || !filters.to) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter-triggered remote load
    setLoadState("loading");
    refresh().catch((caught: unknown) => {
      setError(
        caught instanceof ApiError ? caught.message : "Unable to load reports",
      );
      setLoadState("error");
    });
  }, [organizationId, filters.from, filters.to, refresh]);

  const chartData = useMemo(
    () =>
      (labour?.daily ?? []).map((row) => ({
        date: row.date.slice(5),
        Normal: Number((row.normalMinutes / 60).toFixed(2)),
        Overtime: Number((row.overtimeMinutes / 60).toFixed(2)),
      })),
    [labour],
  );

  const statusChart = useMemo(
    () =>
      (statusReport?.items ?? [])
        .filter((row) => row.count > 0)
        .map((row) => ({
          status: jobStatusLabel(row.status),
          count: row.count,
        })),
    [statusReport],
  );

  async function runExport(kind: "jobs" | "timesheets" | "labour") {
    if (!organizationId) return;
    setBusy(kind);
    try {
      const { blob, filename } = await downloadReportCsv(
        organizationId,
        kind,
        filters,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Export failed",
      );
    } finally {
      setBusy(null);
    }
  }

  async function runPdf(jobId: string) {
    if (!organizationId) return;
    setBusy(jobId);
    try {
      const { blob, filename } = await downloadJobReportPdf(
        organizationId,
        jobId,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "PDF failed",
      );
    } finally {
      setBusy(null);
    }
  }

  if (loadState === "loading" && !summary) {
    return <SkeletonBlock className="h-96" />;
  }
  if (loadState === "error" && !summary) {
    return (
      <ErrorState
        title="Reports"
        description={error ?? "Unable to load reports."}
      />
    );
  }

  const kpis = summary?.kpis;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Tenant-scoped operational analytics. Aggregates run on the server using your organization timezone."
        actions={
          <div className="flex flex-wrap gap-2">
            <MutationButton
              type="button"
              variant="outline"
              className="h-11 md:h-8"
              disabled={busy === "jobs"}
              onClick={() => void runExport("jobs")}
            >
              Export jobs CSV
            </MutationButton>
            <MutationButton
              type="button"
              variant="outline"
              className="h-11 md:h-8"
              disabled={busy === "timesheets"}
              onClick={() => void runExport("timesheets")}
            >
              Export timesheets CSV
            </MutationButton>
            <MutationButton
              type="button"
              variant="outline"
              className="h-11 md:h-8"
              disabled={busy === "labour"}
              onClick={() => void runExport("labour")}
            >
              Export labour CSV
            </MutationButton>
          </div>
        }
      />

      <section className="rounded-lg border border-border bg-card p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <FilterField label="From">
            <Input
              type="date"
              value={filters.from ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
            />
          </FilterField>
          <FilterField label="To">
            <Input
              type="date"
              value={filters.to ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
            />
          </FilterField>
          <FilterField label="Client">
            <select
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-sm md:h-8"
              value={filters.clientId ?? "ALL"}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  clientId:
                    event.target.value === "ALL"
                      ? undefined
                      : event.target.value,
                  siteId: undefined,
                }))
              }
            >
              <option value="ALL">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Site">
            <select
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-sm md:h-8"
              value={filters.siteId ?? "ALL"}
              disabled={!filters.clientId}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  siteId:
                    event.target.value === "ALL"
                      ? undefined
                      : event.target.value,
                }))
              }
            >
              <option value="ALL">All sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Team">
            <select
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-sm md:h-8"
              value={filters.teamId ?? "ALL"}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  teamId:
                    event.target.value === "ALL"
                      ? undefined
                      : event.target.value,
                }))
              }
            >
              <option value="ALL">All teams</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Technician">
            <select
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-sm md:h-8"
              value={filters.technicianUserId ?? "ALL"}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  technicianUserId:
                    event.target.value === "ALL"
                      ? undefined
                      : event.target.value,
                }))
              }
            >
              <option value="ALL">All technicians</option>
              {technicians.map((tech) => (
                <option key={tech.userId} value={tech.userId}>
                  {tech.fullName}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Status">
            <select
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-sm md:h-8"
              value={filters.status ?? "ALL"}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status:
                    event.target.value === "ALL"
                      ? undefined
                      : event.target.value,
                }))
              }
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status === "ALL" ? "All statuses" : jobStatusLabel(status)}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Priority">
            <select
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2 text-sm md:h-8"
              value={filters.priority ?? "ALL"}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  priority:
                    event.target.value === "ALL"
                      ? undefined
                      : event.target.value,
                }))
              }
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority === "ALL" ? "All priorities" : priority}
                </option>
              ))}
            </select>
          </FilterField>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {kpis ? (
        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <Kpi label="Jobs today" value={String(kpis.jobsToday)} />
          <Kpi label="Active" value={String(kpis.activeJobs)} />
          <Kpi label="Completed today" value={String(kpis.completedJobs)} />
          <Kpi label="Pending approval" value={String(kpis.pendingApproval)} tone="amber" />
          <Kpi label="Overdue" value={String(kpis.overdueJobs)} tone="crimson" />
          <Kpi
            label="Labour today"
            value={formatMinutesLabel(kpis.totalLabourMinutes)}
          />
          <Kpi
            label="Completion rate"
            value={
              kpis.completionRate == null
                ? "—"
                : `${Math.round(kpis.completionRate * 100)}%`
            }
          />
          <Kpi
            label="Review time"
            value={String(kpis.timeEntriesRequiringReview)}
            tone={kpis.timeEntriesRequiringReview ? "amber" : "muted"}
          />
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Labour trend</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Normal vs overtime hours by day ({timezone})
          </p>
          {chartData.length === 0 ? (
            <EmptyState
              title="No labour in range"
              description="Hours appear after time entries are recorded."
            />
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="h" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Normal" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Overtime" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {labour ? (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <Fact label="Normal">
                {formatMinutesLabel(labour.totals.normalMinutes)}
              </Fact>
              <Fact label="Overtime">
                {formatMinutesLabel(labour.totals.overtimeMinutes)}
              </Fact>
              <Fact label="Total">
                {formatMinutesLabel(labour.totals.totalMinutes)}
              </Fact>
            </dl>
          ) : null}
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Job status</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Filtered pipeline for the selected range
          </p>
          {statusChart.length === 0 ? (
            <EmptyState
              title="No jobs in range"
              description="Adjust filters or schedule work to populate the pipeline."
            />
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusChart} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="status"
                    width={110}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill="#334155" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TableCard
          title="Hours by technician"
          rows={(labour?.byTechnician ?? []).map((row) => [
            row.fullName,
            formatMinutesLabel(row.minutes),
          ])}
        />
        <TableCard
          title="Hours by client"
          rows={(labour?.byClient ?? []).map((row) => [
            row.clientName,
            formatMinutesLabel(row.minutes),
          ])}
        />
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Jobs</h2>
            <p className="text-xs text-muted-foreground">
              {jobs?.total ?? 0} matching jobs · page {jobs?.page ?? 1}
            </p>
          </div>
        </div>
        {!jobs || jobs.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No jobs match"
              description="Widen the date range or clear filters."
            />
          </div>
        ) : (
          <>
            <MobileList className="p-3">
              {jobs.items.map((job) => (
                <article
                  key={job.id}
                  className="rounded-lg border border-border bg-card px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {job.jobNumber} · {job.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {job.client.name} · {job.site.name}
                      </p>
                    </div>
                    <StatusPill
                      label={jobStatusLabel(job.status)}
                      tone={statusTone(job.status as JobStatus)}
                    />
                  </div>
                  <p className="mt-2 type-numeric text-sm text-muted-foreground">
                    {formatMinutesLabel(job.labourMinutes)} labour
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild className="h-11 flex-1">
                      <Link href={`/app/${params.orgSlug}/jobs/${job.id}`}>
                        Open
                      </Link>
                    </Button>
                    <MutationButton
                      type="button"
                      variant="outline"
                      className="h-11 flex-1"
                      disabled={busy === job.id}
                      onClick={() => void runPdf(job.id)}
                    >
                      PDF
                    </MutationButton>
                  </div>
                </article>
              ))}
            </MobileList>
            <div className="scroll-x-pane hidden md:block">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted/40 type-label">
                  <tr>
                    <th className="px-3 py-2 font-medium">Job</th>
                    <th className="px-3 py-2 font-medium">Client / site</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Labour</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.items.map((job) => (
                    <tr key={job.id} className="border-t border-border">
                      <td className="px-3 py-2.5">
                        <p className="font-medium">
                          {job.jobNumber} · {job.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {job.technicians.map((row) => row.fullName).join(", ") ||
                            "Unassigned"}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {job.client.name}
                        <br />
                        {job.site.name}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill
                          label={jobStatusLabel(job.status)}
                          tone={statusTone(job.status as JobStatus)}
                        />
                      </td>
                      <td className="px-3 py-2.5 type-numeric">
                        {formatMinutesLabel(job.labourMinutes)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-2">
                          <Button asChild variant="ghost" className="h-8 px-2">
                            <Link href={`/app/${params.orgSlug}/jobs/${job.id}`}>
                              Open
                            </Link>
                          </Button>
                          <MutationButton
                            type="button"
                            variant="outline"
                            className="h-8"
                            disabled={busy === job.id}
                            onClick={() => void runPdf(job.id)}
                          >
                            PDF
                          </MutationButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "amber" | "crimson";
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={
          tone === "crimson"
            ? "mt-1 text-lg font-semibold tabular-nums text-destructive"
            : tone === "amber"
              ? "mt-1 text-lg font-semibold tabular-nums text-[oklch(0.45_0.12_70)]"
              : "mt-1 text-lg font-semibold tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function TableCard({
  title,
  rows,
}: {
  title: string;
  rows: string[][];
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No rows" description="No labour in this slice." />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.slice(0, 8).map((row) => (
            <li
              key={`${row[0]}-${row[1]}`}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span className="truncate">{row[0]}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {row[1]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
