"use client";

import { ErrorState } from "@/components/fieldops/error-state";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { MutationButton } from "@/components/fieldops/mutation-control";
import { PageHeader } from "@/components/fieldops/page-header";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { listClientSites, listClients, type ClientSummary, type SiteRecord } from "@/lib/clients";
import { canCreateJobs, resolveCurrentMembership } from "@/lib/current-org";
import { createJob, JOB_TYPES, jobTypeLabel, type JobWriteBody } from "@/lib/jobs";
import { listTeams, listTechnicians, type TeamSummary, type TechnicianSummary } from "@/lib/teams";
import { zonedLocalToUtc } from "@/lib/timezone";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export function JobFormWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [allowed, setAllowed] = useState(false);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [clientId, setClientId] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(params.orgSlug)
      .then(async (membership) => {
        if (cancelled || !membership) {
          if (!cancelled) {
            setError("Organization not found");
            setLoadState("error");
          }
          return;
        }
        if (!canCreateJobs(membership)) {
          setError("Your role cannot create jobs.");
          setLoadState("error");
          return;
        }
        setOrganizationId(membership.organization.id);
        setTimezone(membership.organization.timezone);
        setAllowed(true);
        const [clientResult, teamResult, techResult] = await Promise.all([
          listClients(membership.organization.id, { pageSize: 50, status: "ACTIVE" }),
          listTeams(membership.organization.id, { pageSize: 50, status: "ACTIVE" }),
          listTechnicians(membership.organization.id, { pageSize: 100 }),
        ]);
        if (cancelled) return;
        setClients(clientResult.items);
        setTeams(teamResult.items);
        setTechnicians(techResult.items);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load the form.");
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  useEffect(() => {
    if (!organizationId || !clientId) return;
    let cancelled = false;
    listClientSites(organizationId, clientId, { status: "ACTIVE", pageSize: 50 })
      .then((result) => {
        if (!cancelled) setSites(result.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load sites.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, clientId]);

  if (loadState === "loading") return <SkeletonBlock rows={8} />;
  if (loadState === "error" || !organizationId || !allowed) {
    return <ErrorState description={error ?? undefined} />;
  }

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <PageHeader
        title="Create job"
        description={`Draft card. Schedule times use ${timezone}. The job number is assigned on save.`}
      />
      <ResponsiveForm
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const startDate = String(form.get("startDate") ?? "");
          const startTime = String(form.get("startTime") ?? "");
          const finishDate = String(form.get("finishDate") ?? "");
          const finishTime = String(form.get("finishTime") ?? "");
          const body: JobWriteBody = {
            title: String(form.get("title") ?? "").trim(),
            clientId: String(form.get("clientId") ?? ""),
            siteId: String(form.get("siteId") ?? ""),
            jobType: String(form.get("jobType") ?? "SERVICE_CALL") as JobWriteBody["jobType"],
            priority: String(form.get("priority") ?? "NORMAL") as JobWriteBody["priority"],
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
            technicianUserIds: form.getAll("technicianUserIds").map(String),
            workOrderNumber: String(form.get("workOrderNumber") ?? "") || undefined,
            scope: String(form.get("scope") ?? "") || undefined,
            internalNotes: String(form.get("internalNotes") ?? "") || undefined,
            clientRepName: String(form.get("clientRepName") ?? "") || undefined,
            clientRepTitle: String(form.get("clientRepTitle") ?? "") || undefined,
            clientRepPhone: String(form.get("clientRepPhone") ?? "") || undefined,
            clientRepEmail: String(form.get("clientRepEmail") ?? "") || undefined,
            requireRiskAssessment: form.get("requireRiskAssessment") === "on",
            requirePermit: form.get("requirePermit") === "on",
            requireLoto: form.get("requireLoto") === "on",
            requireClientSignOff: form.get("requireClientSignOff") === "on",
          };
          setPending(true);
          setError(null);
          try {
            const created = await createJob(organizationId, body);
            router.push(`/app/${params.orgSlug}/jobs/${created.id}`);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not create job.");
            setPending(false);
          }
        }}
      >
        <Section title="Customer" description="Client first, then a site on that account.">
          <FormField>
            <Label htmlFor="clientId">Client</Label>
            <select
              id="clientId"
              name="clientId"
              required
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                setSites([]);
              }}
              className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
            >
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField>
            <Label htmlFor="siteId">Site</Label>
            <select
              id="siteId"
              name="siteId"
              required
              key={clientId || "none"}
              disabled={!clientId}
              className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
            >
              <option value="">{clientId ? "Select site" : "Choose a client first"}</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                  {site.city ? ` · ${site.city}` : ""}
                </option>
              ))}
            </select>
          </FormField>
        </Section>

        <Section title="Work" description="What the crew is going on site to do.">
          <FormField>
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required className="h-11 md:h-8" />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField>
              <Label htmlFor="jobType">Job type</Label>
              <select
                id="jobType"
                name="jobType"
                defaultValue="SERVICE_CALL"
                className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
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
                defaultValue="NORMAL"
                className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </FormField>
          </div>
          <FormField>
            <Label htmlFor="workOrderNumber">Work order / PO</Label>
            <Input id="workOrderNumber" name="workOrderNumber" className="h-11 md:h-8" />
          </FormField>
          <FormField>
            <Label htmlFor="scope">Scope of work</Label>
            <textarea
              id="scope"
              name="scope"
              rows={4}
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
            />
          </FormField>
        </Section>

        <Section title="Schedule" description="Optional on a draft. Dispatch still requires a start.">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField>
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" name="startDate" type="date" className="h-11 md:h-8" />
            </FormField>
            <FormField>
              <Label htmlFor="startTime">Start time</Label>
              <Input id="startTime" name="startTime" type="time" className="h-11 md:h-8" />
            </FormField>
            <FormField>
              <Label htmlFor="finishDate">Finish date</Label>
              <Input id="finishDate" name="finishDate" type="date" className="h-11 md:h-8" />
            </FormField>
            <FormField>
              <Label htmlFor="finishTime">Finish time</Label>
              <Input id="finishTime" name="finishTime" type="time" className="h-11 md:h-8" />
            </FormField>
          </div>
        </Section>

        <Section title="Assignment">
          <FormField>
            <Label htmlFor="teamId">Team</Label>
            <select
              id="teamId"
              name="teamId"
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
                <input type="checkbox" name="technicianUserIds" value={person.userId} />
                {person.fullName}
              </label>
            ))}
          </fieldset>
        </Section>

        <Section title="Safety">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="requireRiskAssessment" />
            Risk assessment required
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="requirePermit" />
            Permit required
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="requireLoto" />
            LOTO / isolation required
          </label>
        </Section>

        <Section title="Client sign-off">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="requireClientSignOff" defaultChecked />
            Client sign-off required
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField>
              <Label htmlFor="clientRepName">Representative</Label>
              <Input id="clientRepName" name="clientRepName" className="h-11 md:h-8" />
            </FormField>
            <FormField>
              <Label htmlFor="clientRepTitle">Title</Label>
              <Input id="clientRepTitle" name="clientRepTitle" className="h-11 md:h-8" />
            </FormField>
            <FormField>
              <Label htmlFor="clientRepPhone">Phone</Label>
              <Input id="clientRepPhone" name="clientRepPhone" className="h-11 md:h-8" />
            </FormField>
            <FormField>
              <Label htmlFor="clientRepEmail">Email</Label>
              <Input id="clientRepEmail" name="clientRepEmail" type="email" className="h-11 md:h-8" />
            </FormField>
          </div>
        </Section>

        <Section title="Internal">
          <FormField>
            <Label htmlFor="internalNotes">Internal notes</Label>
            <textarea
              id="internalNotes"
              name="internalNotes"
              rows={3}
              className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
            />
          </FormField>
        </Section>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <MutationButton type="submit" className="h-11 md:h-8" disabled={pending}>
            Save draft
          </MutationButton>
          <Link
            href={`/app/${params.orgSlug}/jobs`}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-input px-3 text-sm md:h-8"
          >
            Cancel
          </Link>
        </div>
      </ResponsiveForm>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card px-4 py-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}
