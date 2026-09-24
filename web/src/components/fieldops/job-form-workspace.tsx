"use client";

import { AsyncEntityCombobox } from "@/components/fieldops/async-entity-combobox";
import { ErrorState } from "@/components/fieldops/error-state";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { MutationButton } from "@/components/fieldops/mutation-control";
import { PageHeader } from "@/components/fieldops/page-header";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { listClientSites, listClients } from "@/lib/clients";
import { canCreateJobs, resolveCurrentMembership } from "@/lib/current-org";
import { createJob, JOB_TYPES, jobTypeLabel, type JobWriteBody } from "@/lib/jobs";
import { personDisplayName, personSecondaryLine } from "@/lib/person-label";
import { listTeams, listTechnicians } from "@/lib/teams";
import { zonedLocalToUtc } from "@/lib/timezone";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

export function JobFormWorkspace() {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("UTC");
  const [allowed, setAllowed] = useState(false);
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [supervisorUserId, setSupervisorUserId] = useState("");
  const [technicianIds, setTechnicianIds] = useState<string[]>([]);
  const [techOptions, setTechOptions] = useState<
    Array<{ userId: string; label: string; description: string | null }>
  >([]);
  const [techPage, setTechPage] = useState(1);
  const [techTotal, setTechTotal] = useState(0);
  const [techSearch, setTechSearch] = useState("");
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

  const fetchClients = useCallback(
    async ({
      search,
      page,
      pageSize,
    }: {
      search: string;
      page: number;
      pageSize: number;
    }) => {
      if (!organizationId) return { items: [], page: 1, pageSize, total: 0 };
      const result = await listClients(organizationId, {
        search: search || undefined,
        status: "ACTIVE",
        page,
        pageSize,
      });
      return {
        items: result.items.map((client) => ({
          value: client.id,
          label: client.name,
          description: client.clientCode,
        })),
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      };
    },
    [organizationId],
  );

  const fetchSites = useCallback(
    async ({
      search,
      page,
      pageSize,
    }: {
      search: string;
      page: number;
      pageSize: number;
    }) => {
      if (!organizationId || !clientId) {
        return { items: [], page: 1, pageSize, total: 0 };
      }
      const result = await listClientSites(organizationId, clientId, {
        search: search || undefined,
        status: "ACTIVE",
        page,
        pageSize,
      });
      return {
        items: result.items.map((site) => ({
          value: site.id,
          label: site.name,
          description: site.city,
        })),
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      };
    },
    [organizationId, clientId],
  );

  const fetchTeams = useCallback(
    async ({
      search,
      page,
      pageSize,
    }: {
      search: string;
      page: number;
      pageSize: number;
    }) => {
      if (!organizationId) return { items: [], page: 1, pageSize, total: 0 };
      const result = await listTeams(organizationId, {
        search: search || undefined,
        status: "ACTIVE",
        page,
        pageSize,
      });
      return {
        items: result.items.map((team) => ({
          value: team.id,
          label: team.name,
          description: team.code,
        })),
        page: result.page ?? page,
        pageSize: result.pageSize ?? pageSize,
        total: result.total,
      };
    },
    [organizationId],
  );

  const fetchSupervisors = useCallback(
    async ({
      search,
      page,
      pageSize,
    }: {
      search: string;
      page: number;
      pageSize: number;
    }) => {
      if (!organizationId) return { items: [], page: 1, pageSize, total: 0 };
      const result = await listTechnicians(organizationId, {
        search: search || undefined,
        page,
        pageSize,
        roles: "OWNER,ADMIN,OPERATIONS_MANAGER,SUPERVISOR",
      });
      return {
        items: result.items.map((person) => ({
          value: person.userId,
          label: personDisplayName(person),
          description: personSecondaryLine(person),
        })),
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
      };
    },
    [organizationId],
  );

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      listTechnicians(organizationId, {
        search: techSearch.trim() || undefined,
        page: 1,
        pageSize: 20,
        roles: "TECHNICIAN,SUPERVISOR",
      })
        .then((result) => {
          if (cancelled) return;
          setTechOptions(
            result.items.map((person) => ({
              userId: person.userId,
              label: personDisplayName(person),
              description: personSecondaryLine(person),
            })),
          );
          setTechPage(result.page);
          setTechTotal(result.total);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [organizationId, techSearch]);

  if (loadState === "loading") return <SkeletonBlock rows={8} />;
  if (loadState === "error" || !organizationId || !allowed) {
    return <ErrorState description={error ?? undefined} />;
  }

  return (
    <div className="mx-auto flex max-w-190 flex-col gap-4">
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
            clientId,
            siteId,
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
            teamId: teamId || null,
            supervisorUserId: supervisorUserId || null,
            technicianUserIds: technicianIds,
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
            <Label>Client</Label>
            <AsyncEntityCombobox
              value={clientId}
              onValueChange={(next) => {
                setClientId(next);
                setSiteId("");
              }}
              fetchPage={fetchClients}
              placeholder="Search clients…"
              emptyLabel="No clients found."
              ariaLabel="Client"
            />
          </FormField>
          <FormField>
            <Label>Site</Label>
            <AsyncEntityCombobox
              key={clientId || "no-client"}
              value={siteId}
              onValueChange={setSiteId}
              fetchPage={fetchSites}
              placeholder={clientId ? "Search sites…" : "Choose a client first"}
              emptyLabel="No sites found."
              disabled={!clientId}
              ariaLabel="Site"
            />
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
            <Label>Team</Label>
            <AsyncEntityCombobox
              value={teamId}
              onValueChange={setTeamId}
              fetchPage={fetchTeams}
              placeholder="Search teams…"
              emptyLabel="No teams found."
              ariaLabel="Team"
            />
          </FormField>
          <FormField>
            <Label>Supervisor</Label>
            <AsyncEntityCombobox
              value={supervisorUserId}
              onValueChange={setSupervisorUserId}
              fetchPage={fetchSupervisors}
              placeholder="Search supervisors…"
              emptyLabel="No supervisors found."
              ariaLabel="Supervisor"
            />
          </FormField>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Technicians</legend>
            <Input
              value={techSearch}
              onChange={(event) => setTechSearch(event.target.value)}
              placeholder="Search technicians…"
              className="h-11 md:h-8"
              aria-label="Search technicians"
            />
            {techOptions.map((person) => (
              <label key={person.userId} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={technicianIds.includes(person.userId)}
                  onChange={(event) => {
                    setTechnicianIds((current) =>
                      event.target.checked
                        ? [...current, person.userId]
                        : current.filter((id) => id !== person.userId),
                    );
                  }}
                />
                <span className="min-w-0">
                  <span className="block">{person.label}</span>
                  {person.description ? (
                    <span className="block text-xs text-muted-foreground">
                      {person.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
            {techOptions.length < techTotal ? (
              <MutationButton
                type="button"
                variant="outline"
                className="h-9"
                onClick={async () => {
                  if (!organizationId) return;
                  const next = await listTechnicians(organizationId, {
                    search: techSearch.trim() || undefined,
                    page: techPage + 1,
                    pageSize: 20,
                    roles: "TECHNICIAN,SUPERVISOR",
                  });
                  setTechPage(next.page);
                  setTechTotal(next.total);
                  setTechOptions((current) => {
                    const seen = new Set(current.map((item) => item.userId));
                    return [
                      ...current,
                      ...next.items
                        .filter((person) => !seen.has(person.userId))
                        .map((person) => ({
                          userId: person.userId,
                          label: personDisplayName(person),
                          description: personSecondaryLine(person),
                        })),
                    ];
                  });
                }}
              >
                Load more
              </MutationButton>
            ) : null}
          </fieldset>
        </Section>

        <Section title="Customer contact on site">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField>
              <Label htmlFor="clientRepName">Name</Label>
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

        <Section title="Controls">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requireRiskAssessment" />
            Risk assessment required
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requirePermit" />
            Permit required
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requireLoto" />
            LOTO required
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="requireClientSignOff" />
            Client sign-off required
          </label>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Link
            href={`/app/${params.orgSlug}/jobs`}
            className="inline-flex h-11 items-center justify-center rounded-md border border-input px-3 text-sm md:h-8"
          >
            Cancel
          </Link>
          <MutationButton type="submit" className="h-11 md:h-8" disabled={pending || !clientId || !siteId}>
            {pending ? "Creating…" : "Create job"}
          </MutationButton>
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
