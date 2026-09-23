"use client";

import { ActivityTimeline } from "@/components/fieldops/activity-timeline";
import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { MutationButton } from "@/components/fieldops/mutation-control";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { resolveCurrentMembership } from "@/lib/current-org";
import {
  activityLabel,
  cancelJob,
  completeJob,
  dispatchJob,
  getJobCard,
  jobTypeLabel,
  priorityTone,
  resumeJob,
  returnJob,
  startJob,
  statusLabel,
  statusTone,
  submitJob,
  type JobDetail,
} from "@/lib/jobs";
import {
  formatAccuracy,
  formatDistanceFromSite,
  locationStatusLabel,
  type LocationEvidence,
} from "@/lib/location";
import { formatDateTimeInZone, formatTimeInZone } from "@/lib/timezone";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const TABS = ["Overview", "Execution", "Time", "Files", "Activity"] as const;

export function JobDetailWorkspace() {
  const params = useParams<{ orgSlug: string; jobId: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [job, setJob] = useState<JobDetail | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(params.orgSlug)
      .then((membership) => {
        if (cancelled || !membership) {
          if (!cancelled) {
            setError("Organization not found");
            setStatus("error");
          }
          return;
        }
        setOrganizationId(membership.organization.id);
        setTimezone(membership.organization.timezone);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load job.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const next = await getJobCard(organizationId, params.jobId);
    setJob(next);
    setStatus("ready");
  }, [organizationId, params.jobId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    getJobCard(organizationId, params.jobId)
      .then((next) => {
        if (cancelled) return;
        setJob(next);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load job.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, params.jobId]);

  async function run(action: () => Promise<JobDetail>) {
    setPending(true);
    setError(null);
    try {
      setJob(await action());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update job.");
    } finally {
      setPending(false);
    }
  }

  if (status === "loading") return <SkeletonBlock rows={8} />;
  if (status === "error" || !job || !organizationId) {
    return <ErrorState description={error ?? undefined} onRetry={() => void load()} />;
  }

  const showExecution =
    Boolean(job.scope) ||
    job.workLogs.length > 0 ||
    job.materials.length > 0 ||
    job.requireRiskAssessment ||
    job.requirePermit ||
    job.requireLoto ||
    job.requireClientSignOff;
  const showTime = job.clockSessions.length > 0 || job.timeEntries.length > 0;
  const showFiles = job.files.length > 0 || job.signatures.length > 0;
  const visibleTabs = TABS.filter((item) => {
    if (item === "Execution") return showExecution;
    if (item === "Time") return showTime;
    if (item === "Files") return showFiles;
    return true;
  });
  const activeTab = visibleTabs.includes(tab) ? tab : "Overview";

  return (
    <div className="mx-auto flex max-w-[880px] flex-col gap-4">
      <div>
        <Link
          href={`/app/${params.orgSlug}/jobs`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Jobs
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold md:text-xl">
            {job.jobNumber} · {job.title}
          </h1>
          <StatusPill label={statusLabel(job.status)} tone={statusTone(job.status)} />
          <StatusPill label={job.priority} tone={priorityTone(job.priority)} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {jobTypeLabel(job.jobType)}
          {job.workOrderNumber ? ` · WO ${job.workOrderNumber}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {job.status === "SCHEDULED" && job.permissions.canDispatch ? (
          <MutationButton
            className="h-11 md:h-8"
            disabled={pending}
            onClick={() => void run(() => dispatchJob(organizationId, job.id))}
          >
            Dispatch
          </MutationButton>
        ) : null}
        {job.status === "DISPATCHED" && job.permissions.canFieldAdvance ? (
          <MutationButton
            className="h-11 md:h-8"
            disabled={pending}
            onClick={() => void run(() => startJob(organizationId, job.id))}
          >
            Start work
          </MutationButton>
        ) : null}
        {job.status === "IN_PROGRESS" && job.permissions.canFieldAdvance ? (
          <MutationButton
            className="h-11 md:h-8"
            disabled={pending}
            onClick={() => void run(() => submitJob(organizationId, job.id))}
          >
            Submit for approval
          </MutationButton>
        ) : null}
        {job.status === "PENDING_APPROVAL" && job.permissions.canApprove ? (
          <>
            <MutationButton
              className="h-11 md:h-8"
              disabled={pending}
              onClick={() => void run(() => completeJob(organizationId, job.id))}
            >
              Complete
            </MutationButton>
            <MutationButton
              variant="outline"
              className="h-11 md:h-8"
              disabled={pending}
              onClick={() => void run(() => returnJob(organizationId, job.id, "Returned from review"))}
            >
              Return
            </MutationButton>
          </>
        ) : null}
        {job.status === "RETURNED" && job.permissions.canFieldAdvance ? (
          <MutationButton
            className="h-11 md:h-8"
            disabled={pending}
            onClick={() => void run(() => resumeJob(organizationId, job.id))}
          >
            Resume
          </MutationButton>
        ) : null}
        {job.permissions.canCancel &&
        ["DRAFT", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "RETURNED"].includes(job.status) ? (
          <MutationButton
            variant="outline"
            className="h-11 md:h-8"
            disabled={pending}
            onClick={() =>
              void run(() =>
                cancelJob(
                  organizationId,
                  job.id,
                  job.status === "IN_PROGRESS" ? "Cancelled from job card" : undefined,
                ),
              )
            }
          >
            Cancel job
          </MutationButton>
        ) : null}
        <Button asChild variant="outline" className="h-11 md:h-8">
          <Link href={`/app/${params.orgSlug}/schedule`}>Schedule</Link>
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-1 border-b border-border pb-1">
        {visibleTabs.map((item) => (
          <Button
            key={item}
            type="button"
            variant={activeTab === item ? "default" : "ghost"}
            className="h-11 md:h-8"
            onClick={() => setTab(item)}
          >
            {item}
          </Button>
        ))}
      </div>

      {activeTab === "Overview" ? (
        <section className="rounded-lg border border-border bg-card px-4 py-4">
          <dl className="space-y-2 text-sm">
            <Row label="Client" value={job.client.name} />
            <Row
              label="Site"
              value={[job.site.name, job.site.city].filter(Boolean).join(" · ")}
            />
            <Row
              label="Window"
              value={`${formatDateTimeInZone(job.scheduledStart, timezone)} – ${
                job.expectedFinish
                  ? formatDateTimeInZone(job.expectedFinish, timezone)
                  : "open"
              }`}
            />
            <Row label="Team" value={job.team?.name ?? "Unassigned"} />
            <Row label="Supervisor" value={job.supervisor?.fullName ?? "Unassigned"} />
            <Row
              label="Technicians"
              value={
                job.technicians.length > 0
                  ? job.technicians.map((item) => item.fullName).join(", ")
                  : "Unassigned"
              }
            />
            {job.client.phone ? <Row label="Client phone" value={job.client.phone} /> : null}
            {job.client.email ? <Row label="Client email" value={job.client.email} /> : null}
            {job.clientRepName ? (
              <Row
                label="On-site contact"
                value={[job.clientRepName, job.clientRepTitle, job.clientRepPhone, job.clientRepEmail]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ) : null}
            {job.cancelReason ? <Row label="Cancel reason" value={job.cancelReason} /> : null}
          </dl>
        </section>
      ) : null}

      {activeTab === "Execution" ? (
        <div className="flex flex-col gap-3">
          {job.scope ? (
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Scope</h2>
              <p className="mt-2 text-sm text-muted-foreground">{job.scope}</p>
            </section>
          ) : null}
          <section className="rounded-lg border border-border bg-card px-4 py-4">
            <h2 className="text-sm font-semibold">Safety</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li>Risk assessment {job.requireRiskAssessment ? "required" : "not required"}</li>
              <li>Permit {job.requirePermit ? "required" : "not required"}</li>
              <li>LOTO / isolation {job.requireLoto ? "required" : "not required"}</li>
              <li>Client sign-off {job.requireClientSignOff ? "required" : "not required"}</li>
            </ul>
          </section>
          {job.workLogs.length > 0 ? (
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Work log</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {job.workLogs.map((row) => (
                  <li key={row.id}>
                    <p>{row.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.author.fullName} · {formatDateTimeInZone(row.loggedAt, timezone)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {job.materials.length > 0 ? (
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Materials</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {job.materials.map((row) => (
                  <li key={row.id}>
                    {row.name} · {row.quantity} {row.unit}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {activeTab === "Time" ? (
        <section className="rounded-lg border border-border bg-card px-4 py-4">
          <ul className="space-y-4 text-sm">
            {job.clockSessions.map((row) => (
              <li key={row.id} className="space-y-1">
                <p className="font-medium">
                  {row.technician.fullName} · Clocked in{" "}
                  {formatTimeInZone(row.clockInAt, timezone)}
                </p>
                <ClockEvidenceLines evidence={row.clockInEvidence} />
                {row.clockOutAt ? (
                  <p className="pt-1">
                    Clocked out {formatTimeInZone(row.clockOutAt, timezone)}
                  </p>
                ) : null}
                <ClockEvidenceLines evidence={row.clockOutEvidence} />
              </li>
            ))}
            {job.timeEntries.map((row) => (
              <li key={row.id} className="text-muted-foreground">
                {row.user.fullName} · {formatDateTimeInZone(row.startedAt, timezone)}
                {row.durationMinutes != null ? ` · ${row.durationMinutes} min` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeTab === "Files" ? (
        <section className="rounded-lg border border-border bg-card px-4 py-4">
          <ul className="space-y-2 text-sm">
            {job.files.map((row) => (
              <li key={row.id}>
                {row.originalName} · {row.type.toLowerCase()}
              </li>
            ))}
            {job.signatures.map((row) => (
              <li key={row.id}>
                Signature · {row.signerName} · {formatDateTimeInZone(row.signedAt, timezone)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeTab === "Activity" ? (
        <section className="rounded-lg border border-border bg-card px-4 py-4">
          <ActivityTimeline
            items={job.activity.map((row) => ({
              id: row.id,
              title: activityLabel(row.action),
              detail: row.actorName ?? undefined,
              time: formatDateTimeInZone(row.createdAt, timezone),
            }))}
            empty={
              <EmptyState
                title="No activity yet"
                description="Lifecycle events will appear here after the first write."
              />
            }
          />
        </section>
      ) : null}
    </div>
  );
}

function ClockEvidenceLines({
  evidence,
}: {
  evidence?: LocationEvidence | null;
}) {
  if (!evidence) return null;
  const distance = formatDistanceFromSite(evidence.distanceFromSiteMeters);
  const accuracy = formatAccuracy(evidence.accuracyMeters);
  return (
    <div className="text-muted-foreground">
      <p>{locationStatusLabel(evidence.locationStatus)}</p>
      {distance ? <p>{distance}</p> : null}
      {accuracy ? <p>{accuracy}</p> : null}
      {evidence.mapsUrl ? (
        <a
          href={evidence.mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          Open in Maps
        </a>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
