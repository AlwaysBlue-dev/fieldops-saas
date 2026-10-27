"use client";

import { useRefreshLoader } from "./data-refresh-provider";
import { Button } from "@/components/ui/button";
import { getMe, getMyOrganizations } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { resolveCurrentMembership } from "@/lib/current-org";
import { listJobs, statusLabel, statusTone, type JobSummary } from "@/lib/jobs";
import { getReportSummary, type ReportKpis } from "@/lib/reports";
import { formatTimeInZone } from "@/lib/timezone";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { MetricCard } from "./metric-card";
import { PageHeader } from "./page-header";
import { SkeletonBlock } from "./skeleton-block";
import { StatusPill } from "./status-pill";

type BoardState = "loading" | "ready" | "error";

export function OverviewBoard({ orgSlug }: { orgSlug: string }) {
  const [state, setState] = useState<BoardState>("loading");
  const [dayLabel, setDayLabel] = useState("");
  const [orgName, setOrgName] = useState("Organization");
  const [userName, setUserName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [kpis, setKpis] = useState<ReportKpis | null>(null);
  const [todayJobs, setTodayJobs] = useState<JobSummary[]>([]);
  const [attentionJobs, setAttentionJobs] = useState<JobSummary[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [{ user }, memberships, membership] = await Promise.all([
        getMe(),
        getMyOrganizations(),
        resolveCurrentMembership(orgSlug),
      ]);
      if (!membership) {
        setState("error");
        return;
      }
      const orgId = membership.organization.id;
      setUserName(user.fullName);
      setOrgName(
        memberships.find((item) => item.organization.slug === orgSlug)
          ?.organization.name ?? membership.organization.name,
      );
      setTimezone(membership.organization.timezone);
      setDayLabel(
        new Intl.DateTimeFormat(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: membership.organization.timezone,
        }).format(new Date()),
      );

      const [summary, today, unassigned, approval] = await Promise.all([
        getReportSummary(orgId),
        listJobs(orgId, { preset: "today", pageSize: 8, sort: "scheduledStart", order: "asc" }),
        listJobs(orgId, { preset: "unassigned", pageSize: 5, sort: "updatedAt", order: "desc" }),
        listJobs(orgId, { preset: "approval", pageSize: 5, sort: "updatedAt", order: "desc" }),
      ]);
      setKpis(summary.kpis);
      setTodayJobs(today.items);
      const attention = [...unassigned.items, ...approval.items];
      const seen = new Set<string>();
      setAttentionJobs(
        attention.filter((job) => {
          if (seen.has(job.id)) return false;
          seen.add(job.id);
          return true;
        }).slice(0, 8),
      );
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState("error");
        return;
      }
      setState("error");
    }
  }, [orgSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  useRefreshLoader(load);

  const firstName = userName.split(" ")[0] ?? userName;
  const labourHours =
    kpis != null ? (kpis.totalLabourMinutes / 60).toFixed(1) : "—";

  return (
    <div className="mx-auto flex max-w-350 flex-col gap-4">
      <PageHeader
        title={`Good ${greeting()}, ${firstName || "there"}`}
        description={`${orgName} · ${dayLabel || "Operational day"}`}
        actions={<StatusPill label="Workspace ready" tone="cobalt" />}
      />

      {state === "loading" ? <SkeletonBlock rows={7} /> : null}
      {state === "error" ? (
        <ErrorState
          title="Overview is unavailable"
          description="The workspace could not refresh operational data."
          onRetry={() => void load()}
        />
      ) : null}

      {state === "ready" && kpis ? (
        <>
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="grid grid-cols-2 md:grid-cols-4">
              <MetricCard
                label="Open jobs"
                value={String(kpis.activeJobs)}
                hint="Not completed or cancelled"
              />
              <MetricCard
                label="Jobs today"
                value={String(kpis.jobsToday)}
                hint="Scheduled start today"
              />
              <MetricCard
                label="Approvals"
                value={String(kpis.pendingApproval)}
                hint={
                  kpis.timeEntriesRequiringReview > 0
                    ? `${kpis.timeEntriesRequiringReview} time reviews`
                    : "Job completions waiting"
                }
              />
              <MetricCard
                label="Hours today"
                value={labourHours}
                hint={`${kpis.techniciansActiveToday} tech${kpis.techniciansActiveToday === 1 ? "" : "s"} active`}
              />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
            <Pane
              title="Today's work"
              action={
                <Button asChild variant="outline" className="h-8">
                  <Link href={`/app/${orgSlug}/schedule`}>Open schedule</Link>
                </Button>
              }
            >
              {todayJobs.length === 0 ? (
                <EmptyState
                  title="No jobs scheduled today"
                  description="When jobs have a scheduled start today, they will list here."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {todayJobs.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={`/app/${orgSlug}/jobs/${job.id}`}
                        className="flex items-start justify-between gap-3 py-2.5 text-sm hover:bg-muted/40"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">
                            {job.jobNumber} · {job.title}
                          </span>
                          <span className="mt-0.5 block text-muted-foreground">
                            {job.client.name}
                            {job.site.city ? ` · ${job.site.city}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <StatusPill
                            label={statusLabel(job.status)}
                            tone={statusTone(job.status)}
                          />
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {job.scheduledStart
                              ? formatTimeInZone(job.scheduledStart, timezone)
                              : "—"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Pane>
            <Pane
              title="Needs attention"
              action={
                <Button asChild variant="outline" className="h-8">
                  <Link href={`/app/${orgSlug}/jobs`}>Open jobs</Link>
                </Button>
              }
            >
              {attentionJobs.length === 0 ? (
                <EmptyState
                  title="Nothing needs action"
                  description="Unassigned and pending-approval jobs will collect here."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {attentionJobs.map((job) => (
                    <li key={job.id}>
                      <Link
                        href={`/app/${orgSlug}/jobs/${job.id}`}
                        className="flex items-center justify-between gap-2 py-2.5 text-sm hover:bg-muted/40"
                      >
                        <span className="min-w-0 truncate font-medium">
                          {job.jobNumber} · {job.title}
                        </span>
                        <StatusPill
                          label={statusLabel(job.status)}
                          tone={statusTone(job.status)}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Pane>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Pane title="Overdue">
              <p className="text-2xl font-semibold tabular-nums">
                {kpis.overdueJobs}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Scheduled or dispatched jobs past their start time.
              </p>
              <Button asChild variant="outline" className="mt-3 h-8">
                <Link href={`/app/${orgSlug}/jobs`}>Review jobs</Link>
              </Button>
            </Pane>
            <Pane title="Approval inbox">
              <p className="text-2xl font-semibold tabular-nums">
                {kpis.pendingApproval}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Job completions waiting for review
                {kpis.timeEntriesRequiringReview > 0
                  ? ` · ${kpis.timeEntriesRequiringReview} time entries need attention`
                  : ""}
                .
              </p>
              <Button asChild variant="outline" className="mt-3 h-8">
                <Link href={`/app/${orgSlug}/approvals`}>Open approvals</Link>
              </Button>
            </Pane>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Pane({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
