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
import { createOvertimeAuthorization } from "@/lib/overtime";
import { useEffect, useState } from "react";

export function RequestOvertimeSheet({
  open,
  onOpenChange,
  organizationId,
  technicianUserId,
  technicians,
  defaultDate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  technicianUserId?: string;
  technicians?: Array<{ userId: string; fullName: string }>;
  defaultDate: string;
  onCreated: () => void;
}) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      title="Request overtime"
      description="Requests stay pending until a supervisor or manager approves them."
    >
      <ResponsiveForm
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setPending(true);
          setError(null);
          try {
            await createOvertimeAuthorization(organizationId, {
              jobId: String(form.get("jobId") ?? ""),
              workDate: String(form.get("workDate") ?? ""),
              startTime: String(form.get("startTime") ?? ""),
              endTime: String(form.get("endTime") ?? ""),
              maxMinutes: Number(form.get("maxMinutes") ?? 0),
              reason: String(form.get("reason") ?? ""),
              userId:
                String(form.get("userId") || technicianUserId || "") ||
                undefined,
            });
            onCreated();
            onOpenChange(false);
          } catch (caught) {
            setError(
              caught instanceof ApiError
                ? caught.message
                : "Unable to request overtime",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {technicians && technicians.length > 1 ? (
          <FormField>
            <Label htmlFor="userId">Technician</Label>
            <select
              id="userId"
              name="userId"
              defaultValue={technicianUserId ?? ""}
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
            >
              {technicians.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.fullName}
                </option>
              ))}
            </select>
          </FormField>
        ) : null}
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
            defaultValue={defaultDate}
            className="h-11 md:h-8"
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField>
            <Label htmlFor="startTime">Authorized start</Label>
            <Input
              id="startTime"
              name="startTime"
              type="time"
              required
              defaultValue="17:00"
              className="h-11 md:h-8"
            />
          </FormField>
          <FormField>
            <Label htmlFor="endTime">Authorized finish</Label>
            <Input
              id="endTime"
              name="endTime"
              type="time"
              required
              defaultValue="20:00"
              className="h-11 md:h-8"
            />
          </FormField>
        </div>
        <FormField>
          <Label htmlFor="maxMinutes">Max duration (minutes)</Label>
          <Input
            id="maxMinutes"
            name="maxMinutes"
            type="number"
            min={15}
            max={1440}
            step={15}
            required
            defaultValue={120}
            className="h-11 md:h-8"
          />
        </FormField>
        <FormField>
          <Label htmlFor="reason">Reason</Label>
          <Textarea
            id="reason"
            name="reason"
            required
            minLength={8}
            rows={4}
            placeholder="Why is overtime required?"
          />
        </FormField>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <MutationButton type="submit" disabled={pending}>
            {pending ? "Submitting…" : "Submit request"}
          </MutationButton>
        </div>
      </ResponsiveForm>
    </ResponsiveDrawer>
  );
}
