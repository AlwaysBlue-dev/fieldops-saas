"use client";

import { AddTimeSheet } from "@/components/fieldops/add-time-sheet";
import { RequestOvertimeSheet } from "@/components/fieldops/request-overtime-sheet";
import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { FilterBar } from "@/components/fieldops/filter-bar";
import { MutationButton } from "@/components/fieldops/mutation-control";
import { PageHeader } from "@/components/fieldops/page-header";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { resolveCurrentMembership } from "@/lib/current-org";
import { addCalendarDays, formatYmdInZone } from "@/lib/timezone";
import {
  decideTimeEntry,
  formatEntryTime,
  formatHours,
  getTimesheetWeek,
  sourceLabel,
  statusLabel,
  statusTone,
  submitTimeEntry,
  typeLabel,
  validationLabel,
  validationTone,
  type TimeEntryRecord,
  type TimesheetWeek,
} from "@/lib/timesheets";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function TimesheetWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [sheet, setSheet] = useState<TimesheetWeek | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

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
        setWeekStart(
          mondayOf(
            formatYmdInZone(new Date(), membership.organization.timezone),
          ),
        );
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
    if (!organizationId || !weekStart) return;
    const next = await getTimesheetWeek(organizationId, {
      weekStart,
      userId: userId || undefined,
    });
    setSheet(next);
    setWeekStart(next.weekStart);
    setError(null);
    setLoadState("ready");
  }, [organizationId, weekStart, userId]);

  useEffect(() => {
    if (!organizationId || !weekStart) return;
    let cancelled = false;
    getTimesheetWeek(organizationId, {
      weekStart,
      userId: userId || undefined,
    })
      .then((next) => {
        if (cancelled) return;
        setSheet(next);
        setWeekStart(next.weekStart);
        setError(null);
        setLoadState("ready");
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof ApiError ? caught.message : "Unable to load timesheet",
        );
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, weekStart, userId]);

  const today = sheet
    ? formatYmdInZone(new Date(), sheet.timezone)
    : formatYmdInZone(new Date(), "UTC");

  async function act(
    entryId: string,
    work: () => Promise<unknown>,
  ) {
    if (!organizationId) return;
    setActingId(entryId);
    try {
      await work();
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Unable to update time",
      );
    } finally {
      setActingId(null);
    }
  }

  if (loadState === "loading" && !sheet) {
    return <SkeletonBlock className="h-72" />;
  }
  if (loadState === "error" && !sheet) {
    return <ErrorState title="Time" description={error ?? "Unable to load."} />;
  }
  if (!sheet || !organizationId) {
    return null;
  }

  const previous = addCalendarDays(sheet.weekStart, -7);
  const next = addCalendarDays(sheet.weekStart, 7);
  const canGoNext = next <= sheet.maxWeekStart;
  const addDate =
    sheet.weekStart <= today && today <= sheet.weekEnd
      ? today
      : sheet.weekEnd < today
        ? sheet.weekEnd
        : today;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Time"
        description={`${sheet.technician.fullName} · week of ${sheet.weekStart}`}
        hideTitleOnMobile
        actions={
          <>
            {sheet.canRequestOvertime ? (
              <MutationButton
                className="hidden h-8 md:inline-flex"
                variant="outline"
                onClick={() => setOvertimeOpen(true)}
              >
                Request overtime
              </MutationButton>
            ) : null}
            {sheet.canCreateManual ? (
              <MutationButton
                className="hidden h-8 md:inline-flex"
                onClick={() => setAddOpen(true)}
              >
                Add time
              </MutationButton>
            ) : null}
          </>
        }
      />

      <div className="md:hidden">
        <h1 className="text-lg font-semibold tracking-tight">This week</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {sheet.technician.fullName}
        </p>
      </div>

      <FilterBar className="hidden md:flex">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setWeekStart(previous)}
        >
          Previous week
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setWeekStart(sheet.currentWeekStart)}
        >
          This week
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canGoNext}
          onClick={() => {
            if (canGoNext) setWeekStart(next);
          }}
        >
          Next week
        </Button>
        {sheet.canSelectTechnician ? (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Employee</span>
            <select
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              value={userId || sheet.technician.userId}
              onChange={(event) => setUserId(event.target.value)}
            >
              {sheet.technicians.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.fullName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </FilterBar>

      <div className="hidden gap-2 md:grid md:grid-cols-5">
        <Metric label="Week total" value={formatHours(sheet.totals.weekMinutes)} />
        <Metric label="Normal" value={formatHours(sheet.totals.normalMinutes)} />
        <Metric label="Overtime" value={formatHours(sheet.totals.overtimeMinutes)} />
        <Metric label="Pending" value={formatHours(sheet.totals.pendingMinutes)} />
        <Metric label="Approved" value={formatHours(sheet.totals.approvedMinutes)} />
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 font-medium">Entries</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {sheet.days.map((day) => (
                <tr key={day.date} className="border-b border-border/70 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5 align-top">
                    <div className="font-medium">
                      {day.weekdayLabel} {day.date.slice(8)}
                    </div>
                    <div className="text-xs text-muted-foreground">{day.date}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {day.entries.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No time</span>
                    ) : (
                      <ul className="space-y-1">
                        {day.entries.map((entry) => (
                          <li key={entry.id} className="flex flex-wrap items-center gap-2">
                            <span>
                              {entry.job
                                ? `${entry.job.jobNumber} · ${entry.job.title}`
                                : "Unassigned"}
                            </span>
                            <span className="text-muted-foreground">
                              {formatEntryTime(entry.startAt, entry.endAt, sheet.timezone)}
                            </span>
                            <StatusPill
                              label={typeLabel(entry.type)}
                              tone={entry.type === "OVERTIME" ? "amber" : "muted"}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                    {formatHours(day.totalMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-border md:hidden">
          {sheet.days.map((day) => (
            <li
              key={day.date}
              className="flex min-h-11 items-center justify-between px-3 py-2"
            >
              <span className="text-sm font-medium">{day.weekdayLabel}</span>
              <span className="text-sm tabular-nums">{formatHours(day.totalMinutes)}</span>
            </li>
          ))}
          <li className="flex min-h-11 items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatHours(sheet.totals.weekMinutes)}
            </span>
          </li>
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 className="text-sm font-semibold">Recent time entries</h2>
        </div>
        {sheet.recent.length === 0 ? (
          <EmptyState
            title="No time entries"
            description="Clock out or add authorized manual time. No sample hours are shown."
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Job</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Duration</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Validation</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {sheet.recent.map((entry) => (
                    <tr key={entry.id} className="border-b border-border/70 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2">{entry.workDate}</td>
                      <td className="px-3 py-2">
                        {entry.job
                          ? `${entry.job.jobNumber} · ${entry.job.title}`
                          : "Unassigned"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatEntryTime(entry.startAt, entry.endAt, sheet.timezone)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatHours(entry.durationMinutes)}
                      </td>
                      <td className="px-3 py-2">{typeLabel(entry.type)}</td>
                      <td className="px-3 py-2">{sourceLabel(entry.source)}</td>
                      <td className="px-3 py-2">
                        <StatusPill
                          label={statusLabel(entry.status)}
                          tone={statusTone(entry.status)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill
                          label={validationLabel(entry.validation.status)}
                          tone={validationTone(entry.validation.status)}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <EntryActions
                          entry={entry}
                          canApprove={sheet.canApprove}
                          busy={actingId === entry.id}
                          onSubmit={() =>
                            act(entry.id, () =>
                              submitTimeEntry(organizationId, entry.id),
                            )
                          }
                          onDecide={(decision) =>
                            act(entry.id, () =>
                              decideTimeEntry(organizationId, entry.id, decision),
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {sheet.recent.map((entry) => (
                <li key={entry.id} className="space-y-2 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {entry.job?.jobNumber ?? "Time"} · {entry.workDate}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatEntryTime(entry.startAt, entry.endAt, sheet.timezone)} ·{" "}
                        {formatHours(entry.durationMinutes)} · {sourceLabel(entry.source)}
                      </p>
                    </div>
                    <StatusPill
                      label={statusLabel(entry.status)}
                      tone={statusTone(entry.status)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill label={typeLabel(entry.type)} tone="muted" />
                    <StatusPill
                      label={validationLabel(entry.validation.status)}
                      tone={validationTone(entry.validation.status)}
                    />
                  </div>
                  <EntryActions
                    entry={entry}
                    canApprove={sheet.canApprove}
                    busy={actingId === entry.id}
                    onSubmit={() =>
                      act(entry.id, () => submitTimeEntry(organizationId, entry.id))
                    }
                    onDecide={(decision) =>
                      act(entry.id, () =>
                        decideTimeEntry(organizationId, entry.id, decision),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {sheet.canCreateManual || sheet.canRequestOvertime ? (
        <div className="flex flex-col gap-2 md:hidden">
          {sheet.canRequestOvertime ? (
            <MutationButton
              className="h-11 w-full"
              variant="outline"
              onClick={() => setOvertimeOpen(true)}
            >
              Request overtime
            </MutationButton>
          ) : null}
          {sheet.canCreateManual ? (
            <MutationButton className="h-11 w-full" onClick={() => setAddOpen(true)}>
              Add time
            </MutationButton>
          ) : null}
        </div>
      ) : null}

      {error && sheet ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      <AddTimeSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        organizationId={organizationId}
        technicianUserId={sheet.canSelectTechnician ? sheet.technician.userId : undefined}
        defaultDate={addDate}
        maxDate={today}
        onCreated={() => {
          void load();
        }}
      />
      <RequestOvertimeSheet
        open={overtimeOpen}
        onOpenChange={setOvertimeOpen}
        organizationId={organizationId}
        technicianUserId={sheet.canSelectTechnician ? sheet.technician.userId : undefined}
        technicians={sheet.canSelectTechnician ? sheet.technicians : undefined}
        defaultDate={addDate}
        onCreated={() => {
          void load();
        }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function EntryActions({
  entry,
  canApprove,
  busy,
  onSubmit,
  onDecide,
}: {
  entry: TimeEntryRecord;
  canApprove: boolean;
  busy: boolean;
  onSubmit: () => void;
  onDecide: (decision: "APPROVED" | "RETURNED" | "REJECTED") => void;
}) {
  const pending = entry.status === "PENDING" || entry.status === "SUBMITTED";
  const draft = entry.status === "DRAFT" || entry.status === "RETURNED";
  if (!pending && !draft) return null;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {draft ? (
        <MutationButton
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onSubmit}
        >
          Submit
        </MutationButton>
      ) : null}
      {pending && canApprove ? (
        <>
          <MutationButton
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => onDecide("APPROVED")}
          >
            Approve
          </MutationButton>
          <MutationButton
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onDecide("RETURNED")}
          >
            Return
          </MutationButton>
          <MutationButton
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onDecide("REJECTED")}
          >
            Reject
          </MutationButton>
        </>
      ) : null}
    </div>
  );
}

function mondayOf(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addCalendarDays(ymd, offset);
}
