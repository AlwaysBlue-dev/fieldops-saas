"use client";

import { ActivityTimeline } from "@/components/fieldops/activity-timeline";
import { EmptyState } from "@/components/fieldops/empty-state";
import { JobFilesPanel } from "@/components/fieldops/job-files-panel";
import { ErrorState } from "@/components/fieldops/error-state";
import {
  MutationButton,
  MutationHint,
  useCanMutate,
} from "@/components/fieldops/mutation-control";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { StickyMobileActionBar } from "@/components/fieldops/sticky-mobile-action-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { resolveCurrentMembership } from "@/lib/current-org";
import {
  activityLabel,
  addJobMaterialRecord,
  addJobWorkLog,
  cancelJob,
  completeJob,
  confirmSafetyControl,
  dispatchJob,
  getJobCard,
  jobTypeLabel,
  MATERIAL_UNITS,
  outcomeLabel,
  priorityTone,
  removeJobMaterialRecord,
  resumeJob,
  returnJob,
  safetyStatusLabel,
  startJob,
  statusLabel,
  statusTone,
  submitJob,
  updateJobClientContact,
  updateJobCompletion,
  updateJobMaterialRecord,
  updateJobWorkLog,
  type JobDetail,
  type JobOutcome,
  type MaterialUnit,
} from "@/lib/jobs";
import {
  formatAccuracy,
  formatDistanceFromSite,
  locationStatusLabel,
  type LocationEvidence,
} from "@/lib/location";
import { formatDateTimeInZone, formatTimeInZone } from "@/lib/timezone";
import { Navigation } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const MOBILE_TABS = ["Overview", "Work", "Time", "Files", "Activity"] as const;

export function JobDetailWorkspace() {
  const params = useParams<{ orgSlug: string; jobId: string }>();
  const { canMutate } = useCanMutate();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [tab, setTab] = useState<(typeof MOBILE_TABS)[number]>("Overview");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([resolveCurrentMembership(params.orgSlug), getMe()])
      .then(([membership, me]) => {
        if (cancelled) return;
        if (!membership) {
          setError("Organization not found");
          setStatus("error");
          return;
        }
        setOrganizationId(membership.organization.id);
        setTimezone(membership.organization.timezone);
        setRole(membership.role);
        setUserId(me.user.id);
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
    return next;
  }, [organizationId, params.jobId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    getJobCard(organizationId, params.jobId)
      .then((next) => {
        if (cancelled) return;
        setJob(next);
        setStatus("ready");
        if (role === "TECHNICIAN" && next.permissions.canExecute) {
          setTab("Work");
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load job.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, params.jobId, role]);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (result && typeof result === "object" && "jobNumber" in result) {
        setJob(result as JobDetail);
      } else {
        await load();
      }
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

  const canEditRecords = Boolean(
    canMutate && job.permissions.canEditExecutionRecords,
  );
  const address =
    job.addressLabel ||
    [job.site.addressLine1, job.site.city, job.site.stateRegion]
      .filter(Boolean)
      .join(", ");

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-4">
      <Header job={job} orgSlug={params.orgSlug} />

      {job.status === "RETURNED" && job.returnReason ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm">
          <p className="font-medium text-foreground">Returned for more work</p>
          <p className="mt-1 text-muted-foreground">{job.returnReason}</p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <MutationHint />

      <div className="flex gap-1 overflow-x-auto border-b border-border pb-1 lg:hidden">
        {MOBILE_TABS.map((item) => (
          <Button
            key={item}
            type="button"
            variant={tab === item ? "default" : "ghost"}
            className="h-11 shrink-0"
            onClick={() => setTab(item)}
          >
            {item}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <div className={tab === "Overview" ? "lg:hidden" : "hidden"}>
            <OverviewFacts job={job} timezone={timezone} address={address} />
          </div>
          <div className={tab === "Work" || tab === "Overview" ? "space-y-4 max-lg:contents" : "hidden lg:block lg:space-y-4"}>
            <div className={tab === "Work" ? "space-y-4" : "hidden lg:space-y-4 lg:block"}>
              <SafetySection
                job={job}
                timezone={timezone}
                canEdit={canEditRecords}
                pending={pending}
                onConfirm={(code, note) =>
                  void run(() =>
                    confirmSafetyControl(organizationId, job.id, code, note).then(
                      () => load(),
                    ),
                  )
                }
              />
              <WorkLogsSection
                job={job}
                userId={userId}
                timezone={timezone}
                canEdit={canEditRecords}
                pending={pending}
                onAdd={(text) =>
                  void run(() => addJobWorkLog(organizationId, job.id, text).then(() => load()))
                }
                onUpdate={(id, text) =>
                  void run(() =>
                    updateJobWorkLog(organizationId, job.id, id, text).then(() => load()),
                  )
                }
              />
              <MaterialsSection
                job={job}
                userId={userId}
                canEdit={canEditRecords}
                pending={pending}
                onAdd={(body) =>
                  void run(() =>
                    addJobMaterialRecord(organizationId, job.id, body).then(() => load()),
                  )
                }
                onUpdate={(id, body) =>
                  void run(() =>
                    updateJobMaterialRecord(organizationId, job.id, id, body).then(
                      () => load(),
                    ),
                  )
                }
                onRemove={(id) =>
                  void run(() =>
                    removeJobMaterialRecord(organizationId, job.id, id).then(() => load()),
                  )
                }
              />
              <ClientContactSection
                key={`${job.id}-contact-${job.updatedAt}-${job.clientRepName ?? ""}`}
                job={job}
                canEdit={canEditRecords}
                pending={pending}
                onSave={(body) =>
                  void run(() => updateJobClientContact(organizationId, job.id, body))
                }
              />
              <CompletionSection
                key={`${job.id}-completion-${job.updatedAt}-${job.outcome ?? ""}`}
                job={job}
                canEdit={canEditRecords}
                pending={pending}
                onSave={(body) =>
                  void run(() => updateJobCompletion(organizationId, job.id, body))
                }
              />
            </div>
          </div>
          <div className={tab === "Time" ? "block" : "hidden lg:block"}>
            <TimeSection job={job} timezone={timezone} />
          </div>
          <div className={tab === "Files" ? "block" : "hidden lg:block"}>
            <JobFilesPanel
              organizationId={organizationId}
              job={job}
              timezone={timezone}
              userId={userId}
              canEdit={canEditRecords}
              onChanged={load}
            />
          </div>
          <div className={tab === "Activity" ? "block" : "hidden lg:block"}>
            <ActivitySection job={job} timezone={timezone} />
          </div>
        </div>

        <aside className="hidden lg:block">
          <Sidebar
            job={job}
            timezone={timezone}
            address={address}
            orgSlug={params.orgSlug}
            organizationId={organizationId}
            pending={pending}
            onAction={(action) => void run(action)}
          />
        </aside>
      </div>

      <div className="lg:hidden">
        <StickyMobileActionBar>
          <PrimaryActions
            job={job}
            organizationId={organizationId}
            pending={pending}
            fullWidth
            onAction={(action) => void run(action)}
          />
        </StickyMobileActionBar>
      </div>
    </div>
  );
}

function Header({ job, orgSlug }: { job: JobDetail; orgSlug: string }) {
  return (
    <div>
      <Link
        href={`/app/${orgSlug}/jobs`}
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
        {job.client.name ? ` · ${job.client.name}` : ""}
      </p>
    </div>
  );
}

function OverviewFacts({
  job,
  timezone,
  address,
}: {
  job: JobDetail;
  timezone: string;
  address: string;
}) {
  const maps = job.navigationUrl;
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-4">
      <h2 className="text-sm font-semibold">Job overview</h2>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label="Client" value={job.client.name} />
        <Row label="Site" value={job.site.name} />
        {address ? <Row label="Address" value={address} /> : null}
        <Row
          label="Scheduled"
          value={formatDateTimeInZone(job.scheduledStart, timezone)}
        />
        <Row
          label="Expected finish"
          value={
            job.expectedFinish
              ? formatDateTimeInZone(job.expectedFinish, timezone)
              : "Open"
          }
        />
        <Row label="Team" value={job.team?.name ?? "Unassigned"} />
        <Row label="Supervisor" value={job.supervisor?.fullName ?? "Unassigned"} />
        <Row
          label="Assigned"
          value={
            job.technicians.length > 0
              ? job.technicians.map((item) => item.fullName).join(", ")
              : "Unassigned"
          }
        />
        <Row label="Priority" value={job.priority} />
        {job.workOrderNumber ? <Row label="WO / PO" value={job.workOrderNumber} /> : null}
        {(job.representativeName ?? job.clientRepName) ? (
          <Row
            label="On-site contact"
            value={[
              job.representativeName ?? job.clientRepName,
              job.representativeRole ?? job.clientRepTitle,
              job.representativePhone ?? job.clientRepPhone,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ) : null}
      </dl>
      {job.scope ? (
        <div className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Scope of work
          </h3>
          <p className="mt-1 text-sm">{job.scope}</p>
        </div>
      ) : null}
      {maps ? (
        <Button asChild variant="outline" className="mt-4 h-11 w-full">
          <a href={maps} target="_blank" rel="noreferrer">
            <Navigation className="size-4" />
            Open in Maps
          </a>
        </Button>
      ) : null}
    </section>
  );
}

function Sidebar({
  job,
  timezone,
  address,
  orgSlug,
  organizationId,
  pending,
  onAction,
}: {
  job: JobDetail;
  timezone: string;
  address: string;
  orgSlug: string;
  organizationId: string;
  pending: boolean;
  onAction: (action: () => Promise<unknown>) => void;
}) {
  return (
    <div className="sticky top-4 space-y-3">
      <OverviewFacts job={job} timezone={timezone} address={address} />
      <section className="rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Time on this job</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {job.clockSessions[0]
            ? `${job.clockSessions[0].technician.fullName} · ${formatTimeInZone(job.clockSessions[0].clockInAt, timezone)}`
            : "No clock sessions yet"}
        </p>
        {job.execution?.clockedInOnThisJob ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Clocked in — clock out before submit.
          </p>
        ) : null}
      </section>
      <section className="space-y-2 rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Actions</h2>
        <PrimaryActions
          job={job}
          organizationId={organizationId}
          pending={pending}
          onAction={onAction}
        />
        <Button asChild variant="outline" className="h-8 w-full">
          <Link href={`/app/${orgSlug}/schedule`}>Schedule</Link>
        </Button>
      </section>
    </div>
  );
}

function PrimaryActions({
  job,
  organizationId,
  pending,
  onAction,
  fullWidth,
}: {
  job: JobDetail;
  organizationId: string;
  pending: boolean;
  onAction: (action: () => Promise<unknown>) => void;
  fullWidth?: boolean;
}) {
  const width = fullWidth ? "h-11 w-full" : "h-11 w-full md:h-8";
  const [returnComment, setReturnComment] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const safetyReady = job.execution?.safetySatisfied ?? true;
  const canSubmit =
    job.status === "IN_PROGRESS" &&
    job.permissions.canFieldAdvance &&
    safetyReady &&
    !job.execution?.clockedInOnThisJob &&
    Boolean(job.workPerformed);

  return (
    <div className="flex flex-col gap-2">
      {job.status === "SCHEDULED" && job.permissions.canDispatch ? (
        <MutationButton
          className={width}
          disabled={pending}
          onClick={() => onAction(() => dispatchJob(organizationId, job.id))}
        >
          Dispatch
        </MutationButton>
      ) : null}
      {job.status === "DISPATCHED" && job.permissions.canFieldAdvance ? (
        <MutationButton
          className={width}
          disabled={pending}
          onClick={() => onAction(() => startJob(organizationId, job.id))}
        >
          Start work
        </MutationButton>
      ) : null}
      {job.status === "IN_PROGRESS" && job.permissions.canFieldAdvance ? (
        <MutationButton
          className={width}
          disabled={pending || !canSubmit}
          onClick={() => onAction(() => submitJob(organizationId, job.id))}
        >
          Submit for approval
        </MutationButton>
      ) : null}
      {job.status === "PENDING_APPROVAL" && job.permissions.canApprove ? (
        <>
          <MutationButton
            className={width}
            disabled={pending}
            onClick={() => onAction(() => completeJob(organizationId, job.id))}
          >
            Approve / complete
          </MutationButton>
          <MutationButton
            variant="outline"
            className={width}
            disabled={pending}
            onClick={() => setReturnOpen((open) => !open)}
          >
            Return
          </MutationButton>
          {returnOpen ? (
            <div className="space-y-2">
              <Label htmlFor={`return-${job.id}`}>Return comment</Label>
              <Input
                id={`return-${job.id}`}
                value={returnComment}
                onChange={(event) => setReturnComment(event.target.value)}
                placeholder="Required"
                className="h-11 md:h-8"
              />
              <MutationButton
                className={width}
                disabled={pending || returnComment.trim().length < 4}
                onClick={() =>
                  onAction(() =>
                    returnJob(organizationId, job.id, returnComment.trim()),
                  )
                }
              >
                Confirm return
              </MutationButton>
            </div>
          ) : null}
        </>
      ) : null}
      {job.status === "RETURNED" && job.permissions.canFieldAdvance ? (
        <MutationButton
          className={width}
          disabled={pending}
          onClick={() => onAction(() => resumeJob(organizationId, job.id))}
        >
          Resume
        </MutationButton>
      ) : null}
      {job.permissions.canCancel &&
      ["DRAFT", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "RETURNED"].includes(
        job.status,
      ) ? (
        <MutationButton
          variant="outline"
          className={width}
          disabled={pending}
          onClick={() =>
            onAction(() =>
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
    </div>
  );
}

function SafetySection({
  job,
  timezone,
  canEdit,
  pending,
  onConfirm,
}: {
  job: JobDetail;
  timezone: string;
  canEdit: boolean;
  pending: boolean;
  onConfirm: (code: string, note?: string) => void;
}) {
  const controls = job.safetyControls ?? [];
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-4">
      <h2 className="text-sm font-semibold">Safety</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Required confirmations are recorded on the server. Frontend checks cannot mark them done.
      </p>
      <ul className="mt-3 space-y-3">
        {controls.map((control) => (
          <li key={control.id} className="rounded-md border border-border px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{control.title}</p>
              <StatusPill
                label={safetyStatusLabel(control.status)}
                tone={
                  control.status === "CONFIRMED"
                    ? "emerald"
                    : control.status === "PENDING"
                      ? "amber"
                      : "muted"
                }
              />
            </div>
            {control.confirmedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {control.confirmedBy?.fullName} ·{" "}
                {formatDateTimeInZone(control.confirmedAt, timezone)}
                {control.note ? ` · ${control.note}` : ""}
              </p>
            ) : null}
            {control.status === "PENDING" && canEdit ? (
              <div className="mt-3 space-y-2">
                <Input
                  className="h-11 md:h-9"
                  placeholder="Optional note"
                  value={notes[control.code] ?? ""}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [control.code]: event.target.value,
                    }))
                  }
                />
                <MutationButton
                  className="h-11 w-full md:h-8"
                  disabled={pending}
                  onClick={() => onConfirm(control.code, notes[control.code] || undefined)}
                >
                  Confirm {control.title}
                </MutationButton>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function WorkLogsSection({
  job,
  userId,
  timezone,
  canEdit,
  pending,
  onAdd,
  onUpdate,
}: {
  job: JobDetail;
  userId: string | null;
  timezone: string;
  canEdit: boolean;
  pending: boolean;
  onAdd: (text: string) => void;
  onUpdate: (id: string, text: string) => void;
}) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-4">
      <h2 className="text-sm font-semibold">Work logs</h2>
      {job.workLogs.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No work notes yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {job.workLogs.map((row) => (
            <li key={row.id} className="text-sm">
              {editing === row.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                  />
                  <MutationButton
                    className="h-11 md:h-8"
                    disabled={pending}
                    onClick={() => {
                      onUpdate(row.id, editText);
                      setEditing(null);
                    }}
                  >
                    Save note
                  </MutationButton>
                </div>
              ) : (
                <>
                  <p>{row.text ?? row.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.author.fullName} · {formatDateTimeInZone(row.loggedAt, timezone)}
                  </p>
                  {canEdit && userId === row.author.userId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-1 h-11 px-0 md:h-8"
                      onClick={() => {
                        setEditing(row.id);
                        setEditText(row.text ?? row.body);
                      }}
                    >
                      Edit
                    </Button>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="mt-4 space-y-2">
          <Label htmlFor="work-log">Add work note</Label>
          <Textarea
            id="work-log"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Arrived onsite and met client representative."
          />
          <MutationButton
            className="h-11 w-full md:h-8 md:w-auto"
            disabled={pending || !text.trim()}
            onClick={() => {
              onAdd(text.trim());
              setText("");
            }}
          >
            Add work log
          </MutationButton>
        </div>
      ) : null}
    </section>
  );
}

function MaterialsSection({
  job,
  userId,
  canEdit,
  pending,
  onAdd,
  onUpdate,
  onRemove,
}: {
  job: JobDetail;
  userId: string | null;
  canEdit: boolean;
  pending: boolean;
  onAdd: (body: {
    itemName: string;
    partNumber?: string;
    quantity: number;
    unit: MaterialUnit;
    notes?: string;
  }) => void;
  onUpdate: (
    id: string,
    body: { itemName?: string; quantity?: number; unit?: MaterialUnit },
  ) => void;
  onRemove: (id: string) => void;
}) {
  const [itemName, setItemName] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<MaterialUnit>("ea");
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");

  return (
    <section className="rounded-lg border border-border bg-card px-4 py-4">
      <h2 className="text-sm font-semibold">Materials</h2>
      {job.materials.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No materials recorded.</p>
      ) : (
        <ul className="mt-3 space-y-3 text-sm">
          {job.materials.map((row) => {
            const own = userId != null && row.addedBy?.userId === userId;
            return (
              <li key={row.id} className="rounded-md border border-border px-3 py-3">
                <p className="font-medium">
                  {row.itemName ?? row.name} · {row.quantity} {row.unit}
                </p>
                {row.partNumber ? (
                  <p className="text-xs text-muted-foreground">PN {row.partNumber}</p>
                ) : null}
                {row.notes ? <p className="text-muted-foreground">{row.notes}</p> : null}
                {canEdit && own ? (
                  editing === row.id ? (
                    <div className="mt-2 flex gap-2">
                      <Input
                        className="h-11 md:h-9"
                        value={editQty}
                        onChange={(event) => setEditQty(event.target.value)}
                      />
                      <MutationButton
                        className="h-11 md:h-8"
                        disabled={pending}
                        onClick={() => {
                          onUpdate(row.id, { quantity: Number(editQty) });
                          setEditing(null);
                        }}
                      >
                        Save
                      </MutationButton>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 md:h-8"
                        onClick={() => {
                          setEditing(row.id);
                          setEditQty(String(Number(row.quantity)));
                        }}
                      >
                        Edit
                      </Button>
                      <MutationButton
                        variant="outline"
                        className="h-11 md:h-8"
                        disabled={pending}
                        onClick={() => onRemove(row.id)}
                      >
                        Remove
                      </MutationButton>
                    </div>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="material-name">Item name</Label>
            <Input
              id="material-name"
              className="h-11 md:h-9"
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="material-pn">Part number</Label>
            <Input
              id="material-pn"
              className="h-11 md:h-9"
              value={partNumber}
              onChange={(event) => setPartNumber(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="material-qty">Quantity</Label>
            <Input
              id="material-qty"
              className="h-11 md:h-9"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="material-unit">Unit</Label>
            <select
              id="material-unit"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm md:h-9"
              value={unit}
              onChange={(event) => setUnit(event.target.value as MaterialUnit)}
            >
              {MATERIAL_UNITS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="material-notes">Notes</Label>
            <Input
              id="material-notes"
              className="h-11 md:h-9"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <MutationButton
            className="h-11 sm:col-span-2 md:h-8"
            disabled={pending || !itemName.trim()}
            onClick={() => {
              onAdd({
                itemName: itemName.trim(),
                partNumber: partNumber.trim() || undefined,
                quantity: Number(quantity),
                unit,
                notes: notes.trim() || undefined,
              });
              setItemName("");
              setPartNumber("");
              setQuantity("1");
              setNotes("");
            }}
          >
            Add material
          </MutationButton>
        </div>
      ) : null}
    </section>
  );
}

function ClientContactSection({
  job,
  canEdit,
  pending,
  onSave,
}: {
  job: JobDetail;
  canEdit: boolean;
  pending: boolean;
  onSave: (body: {
    representativeName?: string;
    representativeRole?: string;
    representativePhone?: string;
    representativeEmail?: string;
  }) => void;
}) {
  const [name, setName] = useState(job.representativeName ?? job.clientRepName ?? "");
  const [role, setRole] = useState(job.representativeRole ?? job.clientRepTitle ?? "");
  const [phone, setPhone] = useState(job.representativePhone ?? job.clientRepPhone ?? "");
  const [email, setEmail] = useState(job.representativeEmail ?? job.clientRepEmail ?? "");

  return (
    <section className="rounded-lg border border-border bg-card px-4 py-4">
      <h2 className="text-sm font-semibold">Client details</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Job-specific contact only. This does not change the client or site record.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Representative" id="rep-name" value={name} onChange={setName} disabled={!canEdit} />
        <Field label="Role" id="rep-role" value={role} onChange={setRole} disabled={!canEdit} />
        <Field label="Phone" id="rep-phone" value={phone} onChange={setPhone} disabled={!canEdit} />
        <Field label="Email" id="rep-email" value={email} onChange={setEmail} disabled={!canEdit} />
      </div>
      {canEdit ? (
        <MutationButton
          className="mt-3 h-11 w-full md:h-8 md:w-auto"
          disabled={pending}
          onClick={() =>
            onSave({
              representativeName: name,
              representativeRole: role,
              representativePhone: phone,
              representativeEmail: email,
            })
          }
        >
          Save job contact
        </MutationButton>
      ) : null}
    </section>
  );
}

function CompletionSection({
  job,
  canEdit,
  pending,
  onSave,
}: {
  job: JobDetail;
  canEdit: boolean;
  pending: boolean;
  onSave: (body: {
    workPerformed: string;
    completionNotes?: string;
    outcome: JobOutcome;
    outcomeReason?: string;
  }) => void;
}) {
  const [workPerformed, setWorkPerformed] = useState(job.workPerformed ?? "");
  const [notes, setNotes] = useState(job.completionNotes ?? "");
  const [outcome, setOutcome] = useState<JobOutcome>(job.outcome ?? "COMPLETED");
  const [reason, setReason] = useState(job.outcomeReason ?? "");

  const needsReason =
    outcome === "FOLLOW_UP_REQUIRED" || outcome === "UNABLE_TO_COMPLETE";

  return (
    <section className="rounded-lg border border-border bg-card px-4 py-4">
      <h2 className="text-sm font-semibold">Completion summary</h2>
      <div className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="work-performed">Work performed</Label>
          <Textarea
            id="work-performed"
            disabled={!canEdit}
            value={workPerformed}
            onChange={(event) => setWorkPerformed(event.target.value)}
            placeholder="Replaced damaged contactor and tested system."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="completion-notes">Completion notes</Label>
          <Textarea
            id="completion-notes"
            disabled={!canEdit}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="outcome">Outcome</Label>
          <select
            id="outcome"
            disabled={!canEdit}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm md:h-9"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as JobOutcome)}
          >
            {(["COMPLETED", "PARTIALLY_COMPLETED", "FOLLOW_UP_REQUIRED", "UNABLE_TO_COMPLETE"] as const).map(
              (item) => (
                <option key={item} value={item}>
                  {outcomeLabel(item)}
                </option>
              ),
            )}
          </select>
        </div>
        {needsReason ? (
          <Field
            label="Reason"
            id="outcome-reason"
            value={reason}
            onChange={setReason}
            disabled={!canEdit}
          />
        ) : null}
      </div>
      {canEdit ? (
        <MutationButton
          className="mt-3 h-11 w-full md:h-8 md:w-auto"
          disabled={pending || workPerformed.trim().length < 8}
          onClick={() =>
            onSave({
              workPerformed: workPerformed.trim(),
              completionNotes: notes.trim() || undefined,
              outcome,
              outcomeReason: reason.trim() || undefined,
            })
          }
        >
          Save completion
        </MutationButton>
      ) : job.outcome ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {outcomeLabel(job.outcome)}
          {job.outcomeReason ? ` · ${job.outcomeReason}` : ""}
        </p>
      ) : null}
    </section>
  );
}

function TimeSection({ job, timezone }: { job: JobDetail; timezone: string }) {
  if (job.clockSessions.length === 0 && job.timeEntries.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card px-4 py-4">
        <EmptyState title="No time recorded" description="Clock sessions will appear here." />
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-4">
      <h2 className="text-sm font-semibold">Time</h2>
      <ul className="mt-3 space-y-4 text-sm">
        {job.clockSessions.map((row) => (
          <li key={row.id} className="space-y-1">
            <p className="font-medium">
              {row.technician.fullName} · Clocked in {formatTimeInZone(row.clockInAt, timezone)}
            </p>
            <ClockEvidenceLines evidence={row.clockInEvidence} />
            {row.clockOutAt ? (
              <p>Clocked out {formatTimeInZone(row.clockOutAt, timezone)}</p>
            ) : null}
            <ClockEvidenceLines evidence={row.clockOutEvidence} />
          </li>
        ))}
      </ul>
    </section>
  );
}


function ActivitySection({ job, timezone }: { job: JobDetail; timezone: string }) {
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-4">
      <h2 className="text-sm font-semibold">Activity</h2>
      <div className="mt-3">
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
              description="Lifecycle events appear here after the first write."
            />
          }
        />
      </div>
    </section>
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

function Field({
  label,
  id,
  value,
  onChange,
  disabled,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className="h-11 md:h-9"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
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
