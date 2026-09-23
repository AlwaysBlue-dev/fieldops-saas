"use client";

import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { FormField } from "@/components/fieldops/responsive-form";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api";
import {
  canInviteMembers,
  canManageCrew,
  resolveCurrentMembership,
} from "@/lib/current-org";
import {
  addTeamMember,
  assignSupervisor,
  certificationLabel,
  certificationTone,
  deactivateTeam,
  getTeam,
  listTechnicians,
  removeTeamMember,
  type TeamDetail,
  type TechnicianSummary,
} from "@/lib/teams";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { InviteTechnicianSheet } from "./invite-technician-sheet";
import { MutationButton } from "./mutation-control";
import { TeamFormSheet } from "./team-form-sheet";

export function TeamDetailWorkspace() {
  const params = useParams<{ orgSlug: string; teamId: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canInvite, setCanInvite] = useState(false);
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(params.orgSlug)
      .then((membership) => {
        if (cancelled || !membership) {
          if (!cancelled) {
            setError("Organization not found");
            setStatus("error");
          }
          return;
        }
        setOrganizationId(membership.organization.id);
        setCanManage(canManageCrew(membership));
        setCanInvite(canInviteMembers(membership));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load team.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const [next, directory] = await Promise.all([
      getTeam(organizationId, params.teamId),
      listTechnicians(organizationId, { pageSize: 100 }),
    ]);
    setTeam(next);
    setTechnicians(directory.items);
    setStatus("ready");
  }, [organizationId, params.teamId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    Promise.all([
      getTeam(organizationId, params.teamId),
      listTechnicians(organizationId, { pageSize: 100 }),
    ])
      .then(([next, directory]) => {
        if (cancelled) return;
        setTeam(next);
        setTechnicians(directory.items);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load team.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, params.teamId]);

  if (status === "loading") {
    return <SkeletonBlock rows={8} />;
  }
  if (status === "error" || !organizationId || !team) {
    return <ErrorState description={error ?? undefined} onRetry={() => void load()} />;
  }

  const memberIds = new Set(team.members.map((member) => member.userId));
  const assignable = technicians.filter((person) => !memberIds.has(person.userId));

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/app/${params.orgSlug}/teams`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Teams
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold md:text-xl">{team.name}</h1>
            <StatusPill
              label={team.status === "ACTIVE" ? "Active" : "Inactive"}
              tone={team.status === "ACTIVE" ? "emerald" : "muted"}
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {team.code ? `${team.code} · ` : ""}
            {team.supervisor
              ? `Supervisor ${team.supervisor.fullName}`
              : "No supervisor assigned"}
          </p>
        </div>
        {canManage ? (
          <div className="hidden gap-2 md:flex">
            {canInvite ? (
              <MutationButton variant="outline" className="h-8" onClick={() => setInviteOpen(true)}>
                Invite technician
              </MutationButton>
            ) : null}
            <MutationButton variant="outline" className="h-8" onClick={() => setEditOpen(true)}>
              Edit
            </MutationButton>
            {team.status === "ACTIVE" ? (
              <MutationButton
                variant="outline"
                className="h-8"
                onClick={async () => {
                  await deactivateTeam(organizationId, team.id);
                  await load();
                }}
              >
                Deactivate
              </MutationButton>
            ) : null}
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-11 w-full justify-start overflow-x-auto md:h-8 md:w-fit">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="certifications">Certifications</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Crew</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Code" value={team.code ?? "—"} />
                <Row
                  label="Supervisor"
                  value={team.supervisor?.fullName ?? "Unassigned"}
                />
                <Row label="Active members" value={String(team.memberCount)} />
                <Row
                  label="Skills"
                  value={
                    team.skillSummary.length > 0
                      ? team.skillSummary.join(", ")
                      : "None recorded"
                  }
                />
              </dl>
            </section>
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Notes</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {team.description || "No description on this team."}
              </p>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          {canManage ? (
            <form
              className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-3 sm:flex-row sm:items-end"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const userId = String(form.get("userId") ?? "");
                if (!userId) return;
                await addTeamMember(organizationId, team.id, userId);
                await load();
              }}
            >
              <FormField className="flex-1">
                <Label htmlFor="add-member">Add member</Label>
                <select
                  id="add-member"
                  name="userId"
                  className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
                  defaultValue=""
                >
                  <option value="">Select a person</option>
                  {assignable.map((person) => (
                    <option key={person.userId} value={person.userId}>
                      {person.fullName}
                    </option>
                  ))}
                </select>
              </FormField>
              <MutationButton type="submit" className="h-11 md:h-8">
                Assign
              </MutationButton>
            </form>
          ) : null}

          {canManage ? (
            <form
              className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-3 sm:flex-row sm:items-end"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const supervisorUserId = String(form.get("supervisorUserId") ?? "") || null;
                await assignSupervisor(organizationId, team.id, supervisorUserId);
                await load();
              }}
            >
              <FormField className="flex-1">
                <Label htmlFor="change-supervisor">Supervisor</Label>
                <select
                  id="change-supervisor"
                  name="supervisorUserId"
                  className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
                  defaultValue={team.supervisor?.userId ?? ""}
                >
                  <option value="">Unassigned</option>
                  {technicians.map((person) => (
                    <option key={person.userId} value={person.userId}>
                      {person.fullName}
                    </option>
                  ))}
                </select>
              </FormField>
              <MutationButton type="submit" className="h-11 md:h-8">
                Update supervisor
              </MutationButton>
            </form>
          ) : null}

          {team.members.length === 0 ? (
            <EmptyState
              title="No members"
              description="Assign an existing member or invite a technician."
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {team.members.map((member) => (
                <li
                  key={member.userId}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <Link
                    href={`/app/${params.orgSlug}/teams/technicians/${member.userId}`}
                    className="min-w-0"
                  >
                    <p className="truncate text-sm font-medium">{member.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.role?.replaceAll("_", " ") ?? "Member"}
                      {member.skills && member.skills.length > 0
                        ? ` · ${member.skills.map((skill) => skill.name).join(", ")}`
                        : ""}
                    </p>
                  </Link>
                  {canManage ? (
                    <MutationButton
                      variant="outline"
                      className="h-11 sm:h-8"
                      onClick={async () => {
                        await removeTeamMember(organizationId, team.id, member.userId);
                        await load();
                      }}
                    >
                      Remove
                    </MutationButton>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="skills" className="mt-4">
          {team.skills.length === 0 ? (
            <EmptyState
              title="No skills on this crew"
              description="Skills appear here after they are assigned to members."
            />
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {team.skills.map((skill) => (
                <li
                  key={skill.name}
                  className="rounded-lg border border-border bg-card px-4 py-3"
                >
                  <p className="text-sm font-medium">{skill.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {skill.holders.map((holder) => holder.fullName).join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="certifications" className="mt-4">
          {team.certifications.length === 0 ? (
            <EmptyState
              title="No certifications"
              description="Member certifications will list here when recorded."
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {team.certifications.map((cert) => (
                <li key={cert.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{cert.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cert.holderName}
                      {cert.expiresAt
                        ? ` · expires ${new Date(cert.expiresAt).toLocaleDateString()}`
                        : " · no expiry"}
                    </p>
                  </div>
                  <StatusPill
                    label={certificationLabel(cert.status)}
                    tone={certificationTone(cert.status)}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      {canManage ? (
        <div className="flex flex-col gap-2 md:hidden">
          {canInvite ? (
            <MutationButton className="h-11 w-full" variant="outline" onClick={() => setInviteOpen(true)}>
              Invite technician
            </MutationButton>
          ) : null}
          <MutationButton className="h-11 w-full" variant="outline" onClick={() => setEditOpen(true)}>
            Edit team
          </MutationButton>
          {team.status === "ACTIVE" ? (
            <MutationButton
              className="h-11 w-full"
              variant="outline"
              onClick={async () => {
                await deactivateTeam(organizationId, team.id);
                await load();
              }}
            >
              Deactivate
            </MutationButton>
          ) : null}
        </div>
      ) : null}

      <TeamFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        organizationId={organizationId}
        team={team}
        technicians={technicians}
        onSaved={() => void load()}
      />
      <InviteTechnicianSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={organizationId}
        teams={[team]}
        defaultTeamId={team.id}
        onSaved={() => void load()}
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
