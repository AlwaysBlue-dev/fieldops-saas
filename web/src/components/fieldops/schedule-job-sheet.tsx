"use client";

import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
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
import { utcToZonedInput, zonedLocalToUtc } from "@/lib/timezone";
import type { TechnicianSummary, TeamSummary } from "@/lib/teams";
import Link from "next/link";
import { useState } from "react";
import { MutationButton } from "./mutation-control";
import { ResponsiveDrawer } from "./responsive-drawer";

export function ScheduleJobSheet({
  open,
  onOpenChange,
  organizationId,
  orgSlug,
  timezone,
  job,
  technicians,
  teams,
  canEdit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  orgSlug: string;
  timezone: string;
  job: ScheduleJob | null;
  technicians: TechnicianSummary[];
  teams: TeamSummary[];
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const start = utcToZonedInput(job?.scheduledStart ?? null, timezone);
  const finish = utcToZonedInput(job?.expectedFinish ?? null, timezone);

  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={job ? `${job.jobNumber} · ${job.title}` : "Job"}
      description="Schedule times use the organization timezone."
    >
      {!job ? null : (
        <ResponsiveForm
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canEdit) return;
            const form = new FormData(event.currentTarget);
            const startDate = String(form.get("startDate") ?? "");
            const startTime = String(form.get("startTime") ?? "");
            const finishDate = String(form.get("finishDate") ?? "");
            const finishTime = String(form.get("finishTime") ?? "");
            const technicianUserIds = form.getAll("technicianUserIds").map(String);
            const body: ScheduleWriteBody = {
              scheduledStart:
                startDate && startTime
                  ? zonedLocalToUtc(startDate, `${startTime}:00`, timezone).toISOString()
                  : null,
              expectedFinish:
                finishDate && finishTime
                  ? zonedLocalToUtc(finishDate, `${finishTime}:00`, timezone).toISOString()
                  : null,
              teamId: String(form.get("teamId") ?? "") || null,
              supervisorUserId: String(form.get("supervisorUserId") ?? "") || null,
              technicianUserIds,
              confirmOverlap: conflicts.length > 0,
            };
            setPending(true);
            setError(null);
            try {
              await scheduleJob(organizationId, job.id, body);
              setConflicts([]);
              onOpenChange(false);
              onSaved();
            } catch (err) {
              if (isScheduleConflict(err)) {
                setConflicts(err.conflicts);
                setError(err.message);
              } else {
                setError(err instanceof ApiError ? err.message : "Could not save schedule.");
              }
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="flex flex-wrap gap-1.5">
            <StatusPill label={statusLabel(job.status)} tone={statusTone(job.status)} />
            <StatusPill
              label={job.priority}
              tone={priorityTone(job.priority as JobPriority)}
            />
          </div>
          <p className="text-sm">
            {job.client.name}
            <span className="text-muted-foreground"> · {job.site.name}</span>
          </p>
          <p className="text-xs text-muted-foreground">Times shown in {timezone}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField>
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={start.date}
                disabled={!canEdit}
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
                disabled={!canEdit}
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
                disabled={!canEdit}
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
                disabled={!canEdit}
                className="h-11 md:h-8"
              />
            </FormField>
          </div>

          <FormField>
            <Label htmlFor="teamId">Team</Label>
            <select
              id="teamId"
              name="teamId"
              disabled={!canEdit}
              defaultValue={job.team?.id ?? ""}
              className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
            >
              <option value="">Unassigned</option>
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
              disabled={!canEdit}
              defaultValue={job.supervisor?.userId ?? ""}
              className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
            >
              <option value="">Unassigned</option>
              {technicians.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.fullName}
                </option>
              ))}
            </select>
          </FormField>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Technicians</legend>
            {technicians.map((person) => (
              <label key={person.userId} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="technicianUserIds"
                  value={person.userId}
                  disabled={!canEdit}
                  defaultChecked={job.technicians.some((item) => item.userId === person.userId)}
                />
                {person.fullName}
              </label>
            ))}
          </fieldset>

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
              <MutationButton type="submit" className="h-11 w-full md:h-8" disabled={pending}>
                {conflicts.length > 0 ? "Confirm and save" : "Save schedule"}
              </MutationButton>
            ) : null}
            <Button asChild variant="outline" className="h-11 md:h-8">
              <Link href={`/app/${orgSlug}/jobs/${job.id}`}>Open job</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Default visit length is {Math.round(jobDurationMs(job) / 60_000)} minutes if no
            finish is set.
          </p>
        </ResponsiveForm>
      )}
    </ResponsiveDrawer>
  );
}
