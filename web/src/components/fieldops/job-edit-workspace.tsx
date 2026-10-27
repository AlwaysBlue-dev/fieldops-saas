"use client";

import { ErrorState } from "@/components/fieldops/error-state";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { MutationButton } from "@/components/fieldops/mutation-control";
import { PageHeader } from "@/components/fieldops/page-header";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { resolveCurrentMembership } from "@/lib/current-org";
import {
  getJobCard,
  JOB_TYPES,
  jobTypeLabel,
  updateJob,
  type JobDetail,
  type JobPriority,
  type JobType,
  type JobWriteBody,
} from "@/lib/jobs";
import { utcToZonedInput, zonedLocalToUtc } from "@/lib/timezone";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function JobEditWorkspace() {
  const params = useParams<{ orgSlug: string; jobId: string }>();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      resolveCurrentMembership(params.orgSlug),
    ])
      .then(async ([membership]) => {
        if (cancelled) return;
        if (!membership) {
          setError("Organization not found");
          setLoadState("error");
          return;
        }
        setOrganizationId(membership.organization.id);
        setTimezone(membership.organization.timezone);
        const card = await getJobCard(
          membership.organization.id,
          params.jobId,
        );
        if (cancelled) return;
        if (!card.permissions.canEdit) {
          setError("You cannot edit this job in its current status.");
          setLoadState("error");
          return;
        }
        setJob(card);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Could not load the job.",
        );
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug, params.jobId]);

  if (loadState === "loading") {
    return <SkeletonBlock rows={8} />;
  }
  if (loadState === "error" || !job || !organizationId) {
    return (
      <div className="flex flex-col gap-3">
        <ErrorState
          title="Job cannot be edited"
          description={error ?? "This job is not available for editing."}
        />
        <Link
          href={`/app/${params.orgSlug}/jobs/${params.jobId}`}
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          Back to job
        </Link>
      </div>
    );
  }

  const start = utcToZonedInput(job.scheduledStart, timezone);
  const finish = utcToZonedInput(job.expectedFinish, timezone);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title={`Edit ${job.jobNumber}`}
        description={job.title}
      />
      <ResponsiveForm
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          const form = new FormData(event.currentTarget);
          const title = String(form.get("title") ?? "").trim();
          if (!title) {
            setError("Title is required.");
            return;
          }
          const startDate = String(form.get("startDate") ?? "");
          const startTime = String(form.get("startTime") ?? "");
          const finishDate = String(form.get("finishDate") ?? "");
          const finishTime = String(form.get("finishTime") ?? "");
          const body: Partial<JobWriteBody> = {
            title,
            jobType: String(form.get("jobType") ?? job.jobType) as JobType,
            priority: String(form.get("priority") ?? job.priority) as JobPriority,
            workOrderNumber: String(form.get("workOrderNumber") ?? "").trim() || undefined,
            scope: String(form.get("scope") ?? "").trim() || undefined,
            internalNotes: String(form.get("internalNotes") ?? "").trim() || undefined,
            clientRepName: String(form.get("clientRepName") ?? "").trim() || undefined,
            clientRepTitle: String(form.get("clientRepTitle") ?? "").trim() || undefined,
            clientRepPhone: String(form.get("clientRepPhone") ?? "").trim() || undefined,
            clientRepEmail: String(form.get("clientRepEmail") ?? "").trim() || undefined,
            scheduledStart:
              startDate && startTime
                ? zonedLocalToUtc(
                    startDate,
                    `${startTime}:00`,
                    timezone,
                  ).toISOString()
                : null,
            expectedFinish:
              finishDate && finishTime
                ? zonedLocalToUtc(
                    finishDate,
                    `${finishTime}:00`,
                    timezone,
                  ).toISOString()
                : null,
          };
          setPending(true);
          setError(null);
          void updateJob(organizationId, job.id, body)
            .then((updated) => {
              router.push(`/app/${params.orgSlug}/jobs/${updated.id}`);
            })
            .catch((err: unknown) => {
              setError(
                err instanceof ApiError
                  ? err.message
                  : "Could not save job changes.",
              );
              setPending(false);
            });
        }}
      >
        <section className="rounded-lg border border-border bg-card px-4 py-4">
          <h2 className="text-sm font-semibold">Details</h2>
          <div className="mt-3 flex flex-col gap-3">
            <FormField>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                required
                defaultValue={job.title}
                className="h-11 md:h-8"
              />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField>
                <Label htmlFor="jobType">Type</Label>
                <select
                  id="jobType"
                  name="jobType"
                  defaultValue={job.jobType}
                  className="h-11 rounded-md border border-input bg-transparent px-2 text-sm md:h-8"
                >
                  {JOB_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {jobTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField>
                <Label htmlFor="priority">Priority</Label>
                <select
                  id="priority"
                  name="priority"
                  defaultValue={job.priority}
                  className="h-11 rounded-md border border-input bg-transparent px-2 text-sm md:h-8"
                >
                  {(["LOW", "NORMAL", "HIGH", "URGENT"] as const).map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <FormField>
              <Label htmlFor="workOrderNumber">WO / PO</Label>
              <Input
                id="workOrderNumber"
                name="workOrderNumber"
                defaultValue={job.workOrderNumber ?? ""}
                className="h-11 md:h-8"
              />
            </FormField>
            <FormField>
              <Label htmlFor="scope">Scope</Label>
              <textarea
                id="scope"
                name="scope"
                rows={4}
                defaultValue={job.scope ?? ""}
                className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
              />
            </FormField>
            <FormField>
              <Label htmlFor="internalNotes">Internal notes</Label>
              <textarea
                id="internalNotes"
                name="internalNotes"
                rows={3}
                defaultValue={job.internalNotes ?? ""}
                className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
              />
            </FormField>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card px-4 py-4">
          <h2 className="text-sm font-semibold">Schedule</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <FormField>
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={start.date}
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
                className="h-11 md:h-8"
              />
            </FormField>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card px-4 py-4">
          <h2 className="text-sm font-semibold">Customer contact on site</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <FormField>
              <Label htmlFor="clientRepName">Name</Label>
              <Input
                id="clientRepName"
                name="clientRepName"
                defaultValue={job.clientRepName ?? job.representativeName ?? ""}
                className="h-11 md:h-8"
              />
            </FormField>
            <FormField>
              <Label htmlFor="clientRepTitle">Title</Label>
              <Input
                id="clientRepTitle"
                name="clientRepTitle"
                defaultValue={job.clientRepTitle ?? job.representativeRole ?? ""}
                className="h-11 md:h-8"
              />
            </FormField>
            <FormField>
              <Label htmlFor="clientRepPhone">Phone</Label>
              <Input
                id="clientRepPhone"
                name="clientRepPhone"
                defaultValue={job.clientRepPhone ?? job.representativePhone ?? ""}
                className="h-11 md:h-8"
              />
            </FormField>
            <FormField>
              <Label htmlFor="clientRepEmail">Email</Label>
              <Input
                id="clientRepEmail"
                name="clientRepEmail"
                type="email"
                defaultValue={job.clientRepEmail ?? job.representativeEmail ?? ""}
                className="h-11 md:h-8"
              />
            </FormField>
          </div>
        </section>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Link
            href={`/app/${params.orgSlug}/jobs/${job.id}`}
            className="inline-flex h-11 items-center justify-center rounded-md border border-input px-3 text-sm md:h-8"
          >
            Cancel
          </Link>
          <MutationButton type="submit" className="h-11 md:h-8" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </MutationButton>
        </div>
      </ResponsiveForm>
    </div>
  );
}
