"use client";

import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { MutationButton } from "@/components/fieldops/mutation-control";
import { PageHeader } from "@/components/fieldops/page-header";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  approvalStatusLabel,
  approvalStatusTone,
  bulkApproveTimesheets,
  decideApproval,
  getApproval,
  listApprovals,
  type ApprovalRecord,
  type ApprovalType,
  type JobApprovalDetail,
  type TimesheetApprovalSubject,
} from "@/lib/approvals";
import {
  canApproveOperations,
  resolveCurrentMembership,
} from "@/lib/current-org";
import { formatHours, typeLabel } from "@/lib/timesheets";
import {
  formatOvertimeWindow,
  formatMaxDuration,
} from "@/lib/overtime";
import { locationStatusLabel } from "@/lib/location";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const TABS: Array<{ id: ApprovalType; label: string }> = [
  { id: "JOB_COMPLETION", label: "Jobs" },
  { id: "TIMESHEET", label: "Timesheets" },
  { id: "OVERTIME", label: "Overtime" },
];

export function ApprovalsWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [canDecide, setCanDecide] = useState(false);
  const [tab, setTab] = useState<ApprovalType>("JOB_COMPLETION");
  const [items, setItems] = useState<ApprovalRecord[]>([]);
  const [counts, setCounts] = useState({
    JOB_COMPLETION: 0,
    TIMESHEET: 0,
    OVERTIME: 0,
  });
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [returnComment, setReturnComment] = useState("");
  const [expanded, setExpanded] = useState<ApprovalRecord | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(params.orgSlug)
      .then((membership) => {
        if (cancelled) return;
        if (!membership) {
          setError("Organization not found");
          setLoadState("error");
          return;
        }
        setOrganizationId(membership.organization.id);
        setTimezone(membership.organization.timezone);
        setCanDecide(canApproveOperations(membership));
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

  const load = useCallback(async () => {
    if (!organizationId) return;
    const next = await listApprovals(organizationId, {
      type: tab,
      status: canDecide ? "PENDING" : undefined,
    });
    setItems(next.items);
    setCounts(next.counts);
    setCanDecide(next.canDecide);
    setLoadState("ready");
    setSelected([]);
  }, [organizationId, tab, canDecide]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    listApprovals(organizationId, {
      type: tab,
      status: canDecide ? "PENDING" : undefined,
    })
      .then((next) => {
        if (cancelled) return;
        setItems(next.items);
        setCounts(next.counts);
        setCanDecide(next.canDecide);
        setError(null);
        setLoadState("ready");
        setSelected([]);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Unable to load approvals",
        );
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, tab, canDecide]);

  const clearTimesheets = useMemo(
    () =>
      items.filter(
        (item) =>
          item.type === "TIMESHEET" &&
          item.status === "PENDING" &&
          item.subject.kind === "TIMESHEET" &&
          item.subject.entry.validation.status === "CLEAR",
      ),
    [items],
  );

  async function decide(
    item: ApprovalRecord,
    decision: "APPROVED" | "RETURNED" | "REJECTED",
    comment?: string,
  ) {
    if (!organizationId) return;
    setActingId(item.id);
    try {
      await decideApproval(organizationId, item.id, decision, comment);
      setReturnId(null);
      setReturnComment("");
      setExpanded(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Unable to decide",
      );
    } finally {
      setActingId(null);
    }
  }

  async function openEvidence(item: ApprovalRecord) {
    if (!organizationId) return;
    setActingId(item.id);
    try {
      const detail = await getApproval(organizationId, item.id);
      setExpanded(detail);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Unable to open evidence",
      );
    } finally {
      setActingId(null);
    }
  }

  async function bulkApprove() {
    if (!organizationId || selected.length === 0) return;
    setBulkBusy(true);
    try {
      const result = await bulkApproveTimesheets(organizationId, selected);
      const failed = result.results.filter((row) => row.status !== "APPROVED");
      if (failed.length > 0) {
        setError(
          `${result.results.length - failed.length} approved. ${failed.length} skipped or failed after server checks.`,
        );
      } else {
        setError(null);
      }
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to bulk approve timesheets",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  if (loadState === "loading") {
    return <SkeletonBlock className="h-72" />;
  }
  if (loadState === "error" && items.length === 0) {
    return (
      <ErrorState title="Approvals" description={error ?? "Unable to load."} />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        description="One action center for job, timesheet, and overtime decisions. Records stay on the original job or timesheet."
      />
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={tab === item.id ? "default" : "outline"}
            className="h-11 shrink-0 md:h-8"
            onClick={() => setTab(item.id)}
          >
            {item.label}
            <span className="ml-1.5 tabular-nums text-xs opacity-80">
              {counts[item.id]}
            </span>
          </Button>
        ))}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {tab === "TIMESHEET" && canDecide && clearTimesheets.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Bulk approve only CLEAR, pending timesheets in your scope. The
            server re-checks every id.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 md:h-8"
              onClick={() =>
                setSelected(clearTimesheets.map((item) => item.id))
              }
            >
              Select clear
            </Button>
            <MutationButton
              type="button"
              disabled={bulkBusy || selected.length === 0}
              onClick={() => void bulkApprove()}
            >
              Approve selected ({selected.length})
            </MutationButton>
          </div>
        </div>
      ) : null}
      {items.length === 0 ? (
        <EmptyState
          title="Inbox is clear"
          description="Pending approvals in your scope will appear here. No sample records are shown."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              {item.type === "JOB_COMPLETION" &&
              item.subject.kind === "JOB_COMPLETION" ? (
                <JobApprovalCard
                  item={item}
                  orgSlug={params.orgSlug}
                  timezone={timezone}
                  busy={actingId === item.id}
                  returnId={returnId}
                  returnComment={returnComment}
                  expanded={expanded?.id === item.id ? expanded : null}
                  onReturnOpen={setReturnId}
                  onReturnComment={setReturnComment}
                  onApprove={() => void decide(item, "APPROVED")}
                  onReturn={() => void decide(item, "RETURNED", returnComment)}
                  onOpenEvidence={() => void openEvidence(item)}
                />
              ) : null}
              {item.type === "TIMESHEET" && item.subject.kind === "TIMESHEET" ? (
                <TimesheetApprovalCard
                  item={item}
                  subject={item.subject}
                  timezone={timezone}
                  busy={actingId === item.id}
                  selected={selected.includes(item.id)}
                  onToggle={(checked) =>
                    setSelected((current) =>
                      checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                  returnId={returnId}
                  returnComment={returnComment}
                  onReturnOpen={setReturnId}
                  onReturnComment={setReturnComment}
                  onApprove={() => void decide(item, "APPROVED")}
                  onReturn={() => void decide(item, "RETURNED", returnComment)}
                />
              ) : null}
              {item.type === "OVERTIME" && item.subject.kind === "OVERTIME" ? (
                <OvertimeApprovalCard
                  item={item}
                  timezone={timezone}
                  busy={actingId === item.id}
                  returnId={returnId}
                  returnComment={returnComment}
                  onReturnOpen={setReturnId}
                  onReturnComment={setReturnComment}
                  onApprove={() => void decide(item, "APPROVED")}
                  onReject={() => void decide(item, "REJECTED", returnComment)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JobApprovalCard({
  item,
  orgSlug,
  timezone,
  busy,
  returnId,
  returnComment,
  expanded,
  onReturnOpen,
  onReturnComment,
  onApprove,
  onReturn,
  onOpenEvidence,
}: {
  item: ApprovalRecord;
  orgSlug: string;
  timezone: string;
  busy: boolean;
  returnId: string | null;
  returnComment: string;
  expanded: ApprovalRecord | null;
  onReturnOpen: (id: string | null) => void;
  onReturnComment: (value: string) => void;
  onApprove: () => void;
  onReturn: () => void;
  onOpenEvidence: () => void;
}) {
  const summary =
    item.subject.kind === "JOB_COMPLETION" &&
    "hoursMinutes" in item.subject.job
      ? item.subject.job
      : null;
  if (!summary) return null;
  const detail =
    expanded?.subject.kind === "JOB_COMPLETION" &&
    "files" in expanded.subject.job
      ? (expanded.subject as JobApprovalDetail).job
      : null;
  return (
    <article className="rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {summary.jobNumber} · {summary.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {summary.client.name} · {summary.site.name}
          </p>
        </div>
        <StatusPill
          label={approvalStatusLabel(item.status)}
          tone={approvalStatusTone(item.status)}
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Fact label="Team / crew">
          {summary.team?.name ?? "—"}
          {summary.technicians.length
            ? ` · ${summary.technicians.map((row) => row.fullName).join(", ")}`
            : ""}
        </Fact>
        <Fact label="Hours">{formatHours(summary.hoursMinutes)}</Fact>
        <Fact label="Safety">
          {summary.safetySatisfied ? "Satisfied" : "Incomplete"}
        </Fact>
        <Fact label="Signature">{summary.hasSignature ? "Captured" : "None"}</Fact>
      </dl>
      {summary.workPerformed ? (
        <p className="mt-2 text-sm text-muted-foreground">{summary.workPerformed}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 md:h-8"
          disabled={busy}
          onClick={onOpenEvidence}
        >
          Open evidence
        </Button>
        <Button asChild variant="ghost" className="h-11 md:h-8">
          <Link href={`/app/${orgSlug}/jobs/${summary.id}`}>Open job</Link>
        </Button>
      </div>
      {detail ? (
        <JobEvidence job={detail} timezone={timezone} />
      ) : null}
      <DecisionRow
        canDecide={item.canDecide}
        busy={busy}
        returnId={returnId}
        itemId={item.id}
        returnComment={returnComment}
        returnLabel="Return comment"
        confirmLabel="Confirm return"
        onReturnOpen={onReturnOpen}
        onReturnComment={onReturnComment}
        onApprove={onApprove}
        onConfirm={onReturn}
      />
    </article>
  );
}

function JobEvidence({
  job,
  timezone,
}: {
  job: JobApprovalDetail["job"];
  timezone: string;
}) {
  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Completion
        </h3>
        <p>{job.workPerformed ?? "No work summary."}</p>
        <p className="text-muted-foreground">
          Outcome {job.outcome ?? "—"}
          {job.outcomeReason ? ` · ${job.outcomeReason}` : ""}
        </p>
      </section>
      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Safety
        </h3>
        <ul className="mt-1 space-y-1">
          {job.safetyControls.map((row) => (
            <li key={row.id}>
              {row.title}: {row.status}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Materials
        </h3>
        {job.materials.length === 0 ? (
          <p className="text-muted-foreground">None recorded.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {job.materials.map((row) => (
              <li key={row.id}>
                {row.name} · {row.quantity} {row.unit}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Photos
        </h3>
        {job.files.length === 0 ? (
          <p className="text-muted-foreground">No files.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {job.files.map((row) => (
              <li key={row.id}>{row.originalName}</li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Client representative / signature
        </h3>
        <p>
          {job.clientRepName ?? job.representativeName ?? "—"}
          {job.clientRepTitle ? ` · ${job.clientRepTitle}` : ""}
        </p>
        {job.signatures.map((row) => (
          <p key={row.id} className="text-muted-foreground">
            Signed by {row.signerName}
            {row.signerTitle ? ` · ${row.signerTitle}` : ""}
          </p>
        ))}
      </section>
      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Hours and GPS
        </h3>
        <ul className="mt-1 space-y-1">
          {job.clockSessions.map((row) => (
            <li key={row.id}>
              {row.technician.fullName}:{" "}
              {new Intl.DateTimeFormat("en-US", {
                timeZone: timezone,
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(row.clockInAt))}
              {row.clockInEvidence
                ? ` · ${locationStatusLabel(row.clockInEvidence.locationStatus)}`
                : ""}
            </li>
          ))}
          {job.timeEntries.map((row) => (
            <li key={row.id}>
              {row.user.fullName}: {formatHours(row.durationMinutes)} ({row.source})
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Activity
        </h3>
        <ul className="mt-1 space-y-1 text-muted-foreground">
          {job.activity.slice(0, 6).map((row) => (
            <li key={row.id}>
              {row.action}
              {row.actorName ? ` · ${row.actorName}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function TimesheetApprovalCard({
  item,
  subject,
  timezone,
  busy,
  selected,
  onToggle,
  returnId,
  returnComment,
  onReturnOpen,
  onReturnComment,
  onApprove,
  onReturn,
}: {
  item: ApprovalRecord;
  subject: TimesheetApprovalSubject;
  timezone: string;
  busy: boolean;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  returnId: string | null;
  returnComment: string;
  onReturnOpen: (id: string | null) => void;
  onReturnComment: (value: string) => void;
  onApprove: () => void;
  onReturn: () => void;
}) {
  const entry = subject.entry;
  const validation = entry.validation;
  const warnings = validation.checks.filter((row) => row.severity === "WARNING");
  const errors = validation.checks.filter((row) => row.severity === "ERROR");
  const canBulk =
    item.canDecide &&
    item.status === "PENDING" &&
    validation.status === "CLEAR";
  return (
    <article className="rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {canBulk ? (
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={selected}
              onChange={(event) => onToggle(event.target.checked)}
              aria-label={`Select ${entry.technician.fullName} timesheet`}
            />
          ) : null}
          <div>
            <p className="text-sm font-semibold">{entry.technician.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {entry.workDate} · week {subject.weekStart}–{subject.weekEnd}
            </p>
          </div>
        </div>
        <StatusPill
          label={validation.status}
          tone={
            validation.status === "BLOCKED"
              ? "crimson"
              : validation.status === "REVIEW"
                ? "amber"
                : "emerald"
          }
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Fact label="Type">{typeLabel(entry.type)}</Fact>
        <Fact label="Hours">{formatHours(entry.durationMinutes)}</Fact>
        <Fact label="Job">
          {entry.job ? `${entry.job.jobNumber} · ${entry.job.title}` : "—"}
        </Fact>
        <Fact label="Window">
          {new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(entry.startAt))}
        </Fact>
      </dl>
      {validation.status === "REVIEW" || warnings.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-amber-800">
          {warnings.map((row) => (
            <li key={row.code}>{row.message}</li>
          ))}
        </ul>
      ) : null}
      {validation.status === "BLOCKED" || errors.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-destructive">
          {errors.map((row) => (
            <li key={row.code}>{row.message}</li>
          ))}
        </ul>
      ) : null}
      <DecisionRow
        canDecide={item.canDecide}
        busy={busy}
        approveDisabled={validation.status === "BLOCKED"}
        returnId={returnId}
        itemId={item.id}
        returnComment={returnComment}
        returnLabel="Return comment"
        confirmLabel="Confirm return"
        onReturnOpen={onReturnOpen}
        onReturnComment={onReturnComment}
        onApprove={onApprove}
        onConfirm={onReturn}
      />
    </article>
  );
}

function OvertimeApprovalCard({
  item,
  timezone,
  busy,
  returnId,
  returnComment,
  onReturnOpen,
  onReturnComment,
  onApprove,
  onReject,
}: {
  item: ApprovalRecord;
  timezone: string;
  busy: boolean;
  returnId: string | null;
  returnComment: string;
  onReturnOpen: (id: string | null) => void;
  onReturnComment: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (item.subject.kind !== "OVERTIME") return null;
  const authorization = item.subject.authorization;
  return (
    <article className="rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {authorization.technician.fullName}
          </p>
          <p className="text-xs text-muted-foreground">
            {authorization.job.jobNumber} · {authorization.workDate}
          </p>
        </div>
        <StatusPill
          label={approvalStatusLabel(item.status)}
          tone={approvalStatusTone(item.status)}
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Fact label="Window">
          {formatOvertimeWindow(
            authorization.authorizedStart,
            authorization.authorizedEnd,
            timezone,
          )}
        </Fact>
        <Fact label="Max">{formatMaxDuration(authorization.maxMinutes)}</Fact>
      </dl>
      <p className="mt-2 text-sm text-muted-foreground">{authorization.reason}</p>
      <DecisionRow
        canDecide={item.canDecide}
        busy={busy}
        rejectMode
        returnId={returnId}
        itemId={item.id}
        returnComment={returnComment}
        returnLabel="Rejection comment"
        confirmLabel="Confirm reject"
        onReturnOpen={onReturnOpen}
        onReturnComment={onReturnComment}
        onApprove={onApprove}
        onConfirm={onReject}
      />
    </article>
  );
}

function DecisionRow({
  canDecide,
  busy,
  approveDisabled,
  rejectMode,
  returnId,
  itemId,
  returnComment,
  returnLabel,
  confirmLabel,
  onReturnOpen,
  onReturnComment,
  onApprove,
  onConfirm,
}: {
  canDecide: boolean;
  busy: boolean;
  approveDisabled?: boolean;
  rejectMode?: boolean;
  returnId: string | null;
  itemId: string;
  returnComment: string;
  returnLabel: string;
  confirmLabel: string;
  onReturnOpen: (id: string | null) => void;
  onReturnComment: (value: string) => void;
  onApprove: () => void;
  onConfirm: () => void;
}) {
  if (!canDecide) return null;
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <MutationButton
          type="button"
          size="sm"
          disabled={busy || approveDisabled}
          onClick={onApprove}
        >
          Approve
        </MutationButton>
        <MutationButton
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onReturnOpen(returnId === itemId ? null : itemId)}
        >
          {rejectMode ? "Reject" : "Return"}
        </MutationButton>
      </div>
      {returnId === itemId ? (
        <div className="space-y-2">
          <Label htmlFor={`comment-${itemId}`}>{returnLabel}</Label>
          <Input
            id={`comment-${itemId}`}
            value={returnComment}
            onChange={(event) => onReturnComment(event.target.value)}
            placeholder="Required"
            className="h-11 md:h-8"
          />
          <MutationButton
            type="button"
            size="sm"
            className="w-full md:w-auto"
            disabled={busy || returnComment.trim().length < 4}
            onClick={onConfirm}
          >
            {confirmLabel}
          </MutationButton>
        </div>
      ) : null}
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
      <dd>{children}</dd>
    </div>
  );
}
