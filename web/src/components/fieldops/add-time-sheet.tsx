"use client";

import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { MutationButton } from "@/components/fieldops/mutation-control";
import { ResponsiveDrawer } from "@/components/fieldops/responsive-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { listJobs, type JobSummary } from "@/lib/jobs";
import {
  createManualTimeEntry,
  type TimeEntryType,
  type TimesheetValidation,
} from "@/lib/timesheets";
import { useEffect, useState } from "react";

const TYPES: Array<{ value: TimeEntryType; label: string }> = [
  { value: "NORMAL", label: "Normal" },
  { value: "OVERTIME", label: "Overtime" },
  { value: "TRAVEL", label: "Travel" },
  { value: "STANDBY", label: "Standby" },
];

export function AddTimeSheet({
  open,
  onOpenChange,
  organizationId,
  technicianUserId,
  defaultDate,
  maxDate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  technicianUserId?: string;
  defaultDate: string;
  maxDate: string;
  onCreated: () => void;
}) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<TimesheetValidation | null>(null);

  useEffect(() => {
    if (!open || !organizationId) return;
    let cancelled = false;
    listJobs(organizationId, { pageSize: 50, sort: "updatedAt", order: "desc" })
      .then((result) => {
        if (!cancelled) setJobs(result.items);
      })
      .catch(() => {
        if (!cancelled) setJobs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, organizationId]);

  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Add time"
      description="Manual time is validated by the server. Duration is calculated from start and finish."
    >
      <ResponsiveForm
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setPending(true);
          setError(null);
          setChecks(null);
          try {
            await createManualTimeEntry(organizationId, {
              jobId: String(form.get("jobId") ?? ""),
              workDate: String(form.get("workDate") ?? ""),
              type: String(form.get("type") ?? "NORMAL") as TimeEntryType,
              startTime: String(form.get("startTime") ?? ""),
              endTime: String(form.get("endTime") ?? ""),
              description: String(form.get("description") ?? ""),
              userId: technicianUserId,
            });
            onCreated();
            onOpenChange(false);
          } catch (caught) {
            if (caught instanceof ApiError) {
              setError(caught.message);
              if (caught.validation && typeof caught.validation === "object") {
                setChecks(caught.validation as TimesheetValidation);
              }
            } else {
              setError("Unable to save time entry");
            }
          } finally {
            setPending(false);
          }
        }}
      >
        <FormField>
          <Label htmlFor="jobId">Job</Label>
          <select
            id="jobId"
            name="jobId"
            required
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          >
            <option value="">Select a job</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.jobNumber} · {job.title}
              </option>
            ))}
          </select>
        </FormField>
        <FormField>
          <Label htmlFor="workDate">Date</Label>
          <Input
            id="workDate"
            name="workDate"
            type="date"
            required
            max={maxDate}
            defaultValue={defaultDate}
            className="h-11 md:h-8"
          />
        </FormField>
        <FormField>
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            defaultValue="NORMAL"
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
          >
            {TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField>
            <Label htmlFor="startTime">Start</Label>
            <Input
              id="startTime"
              name="startTime"
              type="time"
              required
              defaultValue="08:00"
              className="h-11 md:h-8"
            />
          </FormField>
          <FormField>
            <Label htmlFor="endTime">Finish</Label>
            <Input
              id="endTime"
              name="endTime"
              type="time"
              required
              defaultValue="16:30"
              className="h-11 md:h-8"
            />
          </FormField>
        </div>
        <FormField>
          <Label htmlFor="description">Work description</Label>
          <Textarea
            id="description"
            name="description"
            required
            minLength={8}
            rows={4}
            placeholder="What work was performed?"
          />
        </FormField>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {checks?.checks.length ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {checks.checks.map((check) => (
              <li key={check.code}>
                {check.severity === "ERROR" ? "Blocked" : "Review"} · {check.message}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <MutationButton type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save time"}
          </MutationButton>
        </div>
      </ResponsiveForm>
    </ResponsiveDrawer>
  );
}
