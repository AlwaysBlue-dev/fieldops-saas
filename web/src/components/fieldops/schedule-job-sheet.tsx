"use client";

import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { OutsideWorkingDayDialog } from "@/components/fieldops/outside-working-day-dialog";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { getOrganization } from "@/lib/organizations";
import {
  isScheduleConflict,
  jobDurationMs,
  priorityTone,
  scheduleJob,
  statusLabel,
  statusTone,
  type JobPriority,
  type ScheduleConflict,
  type ScheduleJob,
  type ScheduleWriteBody,
} from "@/lib/schedule";
import {
  isOutsideWorkingWeek,
  outsideWorkingDayMessage,
  utcToZonedInput,
  zonedLocalToUtc,
} from "@/lib/timezone";
import { listTechnicians, type TechnicianSummary, type TeamSummary } from "@/lib/teams";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MutationButton } from "./mutation-control";
import { ResponsiveDrawer } from "./responsive-drawer";

export function ScheduleJobSheet({
  open,
  onOpenChange,
  organizationId,
  orgSlug,
  timezone,
  workingWeek: workingWeekProp,
  job,
  teams,
  canEdit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  orgSlug: string;
  timezone: string;
  workingWeek?: string[];
  job: ScheduleJob | null;
  technicians?: TechnicianSummary[];
  teams: TeamSummary[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [selectedTeam, setSelectedTeam] = useState(job?.team?.id ?? "");
  const [supervisors, setSupervisors] = useState<TechnicianSummary[]>([]);
  const [eligibleTechnicians, setEligibleTechnicians] = useState<TechnicianSummary[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState(false);
  useEffect(() => { setSelectedTeam(job?.team?.id ?? ""); }, [job?.id, open]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPeopleLoading(true);
    setPeopleError(false);
    setError(null);
    async function loadPeople(roles: string, teamId?: string) {
      const people: TechnicianSummary[] = [];
      let page = 1;
      while (true) {
        const result = await listTechnicians(organizationId, { roles, teamId, status: "ACTIVE", page, pageSize: 100 });
        people.push(...result.items);
        if (page >= result.totalPages) return people;
        page++;
      }
    }
    Promise.all([loadPeople("TECHNICIAN", selectedTeam || undefined), loadPeople("OWNER,ADMIN,OPERATIONS_MANAGER,SUPERVISOR")])
      .then(([techs, supervisors]) => { if (!cancelled) { setEligibleTechnicians(techs); setSupervisors(supervisors); } })
      .catch(() => { if (!cancelled) { setEligibleTechnicians([]); setSupervisors([]); setPeopleError(true); setError("Could not load eligible assignees. Reopen the schedule to retry."); } })
      .finally(() => { if (!cancelled) setPeopleLoading(false); });
    return () => { cancelled = true; };
  }, [open, organizationId, selectedTeam]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [workingWeek, setWorkingWeek] = useState<string[]>(workingWeekProp ?? []);
  const [outsidePrompt, setOutsidePrompt] = useState<{
    message: string;
    body: ScheduleWriteBody;
  } | null>(null);
  const unavailableAssignments = job?.technicians.filter((person) => !eligibleTechnicians.some((eligible) => eligible.userId === person.userId)) ?? [];
  const start = utcToZonedInput(job?.scheduledStart ?? null, timezone);
  const finish = utcToZonedInput(job?.expectedFinish ?? null, timezone);

  useEffect(() => {
    if (workingWeekProp) {
      setWorkingWeek(workingWeekProp);
      return;
    }
    if (!open || !organizationId) return;
    let cancelled = false;
    getOrganization(organizationId)
      .then((org) => {
        if (!cancelled) {
          setWorkingWeek(org.settings?.workingWeek ?? []);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, workingWeekProp]);

  async function submitBody(body: ScheduleWriteBody) {
    if (!job) return;
    setPending(true);
    setError(null);
    try {
      await scheduleJob(organizationId, job.id, body);
      setConflicts([]);
      setOutsidePrompt(null);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      if (isScheduleConflict(err)) {
        setConflicts(err.conflicts);
        setError(err.message);
        setOutsidePrompt(null);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not save schedule.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ResponsiveDrawer
        open={open}
        onOpenChange={onOpenChange}
        title={job ? `${job.jobNumber} · ${job.title}` : "Job"}
        description="Schedule times use the organization timezone."
      >
        {!job ? null : (
          <ResponsiveForm key={job.id}
            onSubmit={async (event) => {
              event.preventDefault();
              if (!canEdit || pending || peopleLoading || peopleError) return;
              const form = new FormData(event.currentTarget);
              const startDate = String(form.get("startDate") ?? "");
              const startTime = String(form.get("startTime") ?? "");
              const finishDate = String(form.get("finishDate") ?? "");
              const finishTime = String(form.get("finishTime") ?? "");
              const technicianUserIds = form
                .getAll("technicianUserIds")
                .map(String);
              const removed = new Set(form.getAll("removeUnavailable").map(String));
              technicianUserIds.push(...unavailableAssignments.filter((person) => !removed.has(person.userId)).map((person) => person.userId));
              const scheduledStart =
                startDate && startTime
                  ? zonedLocalToUtc(
                      startDate,
                      `${startTime}:00`,
                      timezone,
                    ).toISOString()
                  : null;
              const body: ScheduleWriteBody = {
                scheduledStart,
                expectedFinish:
                  finishDate && finishTime
                    ? zonedLocalToUtc(
                        finishDate,
                        `${finishTime}:00`,
                        timezone,
                      ).toISOString()
                    : null,
                teamId: String(form.get("teamId") ?? "") || null,
                supervisorUserId:
                  String(form.get("supervisorUserId") ?? "") || null,
                technicianUserIds,
                confirmOverlap: conflicts.length > 0,
              };

              const check = isOutsideWorkingWeek(
                scheduledStart,
                timezone,
                workingWeek,
              );
              if (check.outside && !outsidePrompt) {
                setOutsidePrompt({
                  message: outsideWorkingDayMessage(check.weekdayName),
                  body,
                });
                return;
              }

              await submitBody(body);
            }}
          >
            <div className="flex flex-wrap gap-1.5">
              <StatusPill
                label={statusLabel(job.status)}
                tone={statusTone(job.status)}
              />
              <StatusPill
                label={job.priority}
                tone={priorityTone(job.priority as JobPriority)}
              />
            </div>
            <p className="text-sm">
              {job.client.name}
              <span className="text-muted-foreground"> · {job.site.name}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Times shown in {timezone}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField>
                <Label htmlFor="startDate">Start date</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="date"
                  defaultValue={start.date}
                  disabled={!canEdit || peopleLoading}
                  className="h-11 md:h-8"
                />
              </FormField>
              <FormField>
                <Label htmlFor="startTime">Start time</Label>
                <Input
                  id="startTime"
                  name="startTime"
                  type="time"
                  defaultValue={start.time}
                  disabled={!canEdit || peopleLoading}
                  className="h-11 md:h-8"
                />
              </FormField>
              <FormField>
                <Label htmlFor="finishDate">Finish date</Label>
                <Input
                  id="finishDate"
                  name="finishDate"
                  type="date"
                  defaultValue={finish.date}
                  disabled={!canEdit || peopleLoading}
                  className="h-11 md:h-8"
                />
              </FormField>
              <FormField>
                <Label htmlFor="finishTime">Finish time</Label>
                <Input
                  id="finishTime"
                  name="finishTime"
                  type="time"
                  defaultValue={finish.time}
                  disabled={!canEdit || peopleLoading}
                  className="h-11 md:h-8"
                />
              </FormField>
            </div>

            <FormField>
              <Label htmlFor="teamId">Team</Label>
              <select
                id="teamId"
                name="teamId"
                disabled={!canEdit || peopleLoading}
                value={selectedTeam}
                onChange={(event) => setSelectedTeam(event.target.value)}
                className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
              >
                <option value="">Select…</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField>
              <Label htmlFor="supervisorUserId">Supervisor</Label>
              <select
                id="supervisorUserId"
                name="supervisorUserId"
                disabled={!canEdit || peopleLoading}
                defaultValue={job.supervisor?.userId ?? ""}
                className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
              >
                <option value="">Select…</option>
                {job.supervisor && !supervisors.some((person) => person.userId === job.supervisor?.userId) ? <option value={job.supervisor.userId}>{job.supervisor.fullName} (existing; review eligibility)</option> : null}
                {supervisors.map((person) => (
                  <option key={person.userId} value={person.userId}>
                    {person.fullName}
                  </option>
                ))}
              </select>
            </FormField>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Technicians</legend>
              {eligibleTechnicians.map((person) => (
                <label
                  key={person.userId}
                  className="flex min-h-11 items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="technicianUserIds"
                    value={person.userId}
                    disabled={!canEdit || peopleLoading}
                    defaultChecked={job.technicians.some(
                      (item) => item.userId === person.userId,
                    )}
                  />
                  {person.fullName}
                </label>
              ))}
            </fieldset>

            {!peopleLoading && unavailableAssignments.length > 0 ? (
              <fieldset className="space-y-2 rounded-lg border p-3 text-sm">
                <legend className="font-medium">Existing assignments needing review</legend>
                <p className="text-muted-foreground">These people are outside the current eligible technician selection. Existing assignments remain unless you explicitly remove them. Ineligible organization roles cannot be saved as technicians.</p>
                {unavailableAssignments.map((person) => <label key={person.userId} className="flex items-center gap-2">
                  <input type="checkbox" name="removeUnavailable" value={person.userId} disabled={!canEdit} /> Remove assignment: {person.fullName}
                </label>)}
              </fieldset>
            ) : null}
            {conflicts.length > 0 ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium">Overlap warning</p>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {conflicts.map((item) => (
                    <li key={`${item.jobId}-${item.userId}`}>
                      {item.fullName} on {item.jobNumber}
                    </li>
                  ))}
                </ul>
                <p className="mt-2">Save again to confirm the override.</p>
              </div>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="flex flex-col gap-2">
              {canEdit ? (
                <MutationButton
                  type="submit"
                  className="h-11 w-full md:h-8"
                  disabled={pending || peopleLoading || peopleError}
                >
                  {conflicts.length > 0 ? "Confirm and save" : "Save schedule"}
                </MutationButton>
              ) : null}
              <Button asChild variant="outline" className="h-11 md:h-8">
                <Link href={`/app/${orgSlug}/jobs/${job.id}`}>Open job</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Default visit length is {Math.round(jobDurationMs(job) / 60_000)}{" "}
              minutes if no finish is set.
            </p>
          </ResponsiveForm>
        )}
      </ResponsiveDrawer>

      <OutsideWorkingDayDialog
        open={Boolean(outsidePrompt)}
        message={outsidePrompt?.message ?? ""}
        pending={pending}
        onCancel={() => setOutsidePrompt(null)}
        onContinue={() => {
          if (outsidePrompt) void submitBody(outsidePrompt.body);
        }}
      />
    </>
  );
}
