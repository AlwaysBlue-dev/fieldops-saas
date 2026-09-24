"use client";

import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { FormField } from "@/components/fieldops/responsive-form";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api";
import {
  canInviteMembers,
  canManageCrew,
  resolveCurrentMembership,
} from "@/lib/current-org";
import {
  addCertification,
  addTeamMember,
  assignSkill,
  assignSupervisor,
  certificationLabel,
  certificationTone,
  createSkill,
  deactivateTeam,
  getTeam,
  listSkills,
  listTechnicians,
  reactivateTeam,
  removeCertification,
  removeSkill,
  removeTeamMember,
  updateCertification,
  type SkillRecord,
  type TeamDetail,
  type TechnicianSummary,
} from "@/lib/teams";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { InviteTechnicianSheet } from "./invite-technician-sheet";
import { MutationButton } from "./mutation-control";
import { ResponsiveDrawer } from "./responsive-drawer";
import { TeamFormSheet } from "./team-form-sheet";

export function TeamDetailWorkspace() {
  const params = useParams<{ orgSlug: string; teamId: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canInvite, setCanInvite] = useState(false);
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianSummary[]>([]);
  const [catalogSkills, setCatalogSkills] = useState<SkillRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [editingCertId, setEditingCertId] = useState<string | null>(null);

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
    const [next, directory, skills] = await Promise.all([
      getTeam(organizationId, params.teamId),
      listTechnicians(organizationId, { pageSize: 100, status: "ACTIVE" }),
      listSkills(organizationId),
    ]);
    setTeam(next);
    setTechnicians(directory.items);
    setCatalogSkills(skills);
    setStatus("ready");
  }, [organizationId, params.teamId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    Promise.all([
      getTeam(organizationId, params.teamId),
      listTechnicians(organizationId, { pageSize: 100, status: "ACTIVE" }),
      listSkills(organizationId),
    ])
      .then(([next, directory, skills]) => {
        if (cancelled) return;
        setTeam(next);
        setTechnicians(directory.items);
        setCatalogSkills(skills);
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

  const activeMembers = useMemo(
    () =>
      (team?.members ?? []).filter(
        (member) => !member.membershipStatus || member.membershipStatus === "ACTIVE",
      ),
    [team],
  );

  if (status === "loading") {
    return <SkeletonBlock rows={8} />;
  }
  if (status === "error" || !organizationId || !team) {
    return <ErrorState description={error ?? undefined} onRetry={() => void load()} />;
  }

  const memberIds = new Set(team.members.map((member) => member.userId));
  const assignable = technicians.filter((person) => !memberIds.has(person.userId));
  const editingCert = editingCertId
    ? team.certifications.find((cert) => cert.id === editingCertId) ?? null
    : null;

  async function onDeactivate() {
    if (
      !window.confirm(
        "Deactivate this team?\n\nInactive teams remain in FieldOps history but cannot be used for new assignments.",
      )
    ) {
      return;
    }
    await deactivateTeam(organizationId!, team!.id);
    toast.success("Team deactivated");
    await load();
  }

  async function onReactivate() {
    if (
      !window.confirm(
        "Reactivate this team?\n\nThis team will become available again for assignments and normal operations.",
      )
    ) {
      return;
    }
    await reactivateTeam(organizationId!, team!.id);
    toast.success("Team reactivated");
    await load();
  }

  const lifecycleActions = canManage ? (
    <>
      {team.status === "ACTIVE" ? (
        <MutationButton variant="outline" className="h-8" onClick={() => void onDeactivate()}>
          Deactivate team
        </MutationButton>
      ) : (
        <MutationButton className="h-8" onClick={() => void onReactivate()}>
          Reactivate team
        </MutationButton>
      )}
    </>
  ) : null;

  return (
    <div className="mx-auto flex max-w-275 flex-col gap-4">
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
            {lifecycleActions}
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="overview" className="gap-0">
        <div className="w-full overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="h-11 w-max min-w-full justify-start gap-1 md:h-8 md:w-fit md:min-w-0">
            <TabsTrigger value="overview" className="flex-none px-3">
              Overview
            </TabsTrigger>
            <TabsTrigger value="members" className="flex-none px-3">
              Members
            </TabsTrigger>
            <TabsTrigger value="skills" className="flex-none px-3">
              Skills
            </TabsTrigger>
            <TabsTrigger value="certifications" className="flex-none px-3">
              Certifications
            </TabsTrigger>
          </TabsList>
        </div>

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
                <Row label="Status" value={team.status === "ACTIVE" ? "Active" : "Inactive"} />
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
          {canManage && team.status === "ACTIVE" ? (
            <form
              className="mb-3 flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-3 sm:flex-row sm:items-end"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const userId = String(form.get("userId") ?? "");
                if (!userId) return;
                await addTeamMember(organizationId, team.id, userId);
                toast.success("Member assigned");
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
                toast.success("Supervisor updated");
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
                        toast.success("Member removed");
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

        <TabsContent value="skills" className="mt-4 space-y-3">
          {canManage ? (
            <div className="flex justify-end">
              <MutationButton className="h-11 md:h-8" onClick={() => setSkillOpen(true)}>
                Assign skill
              </MutationButton>
            </div>
          ) : null}
          {team.skills.length === 0 ? (
            <EmptyState
              title="No skills have been assigned to this team's members yet."
              description="Assign organization skills to active team members from this tab."
              action={
                canManage ? (
                  <MutationButton className="mt-2 h-11 md:h-8" onClick={() => setSkillOpen(true)}>
                    Assign first skill
                  </MutationButton>
                ) : undefined
              }
            />
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {team.skills.map((skill) => (
                <li
                  key={skill.skillId ?? skill.name}
                  className="rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{skill.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {skill.memberCount ?? skill.holders.length} team member
                        {(skill.memberCount ?? skill.holders.length) === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {skill.holders.map((holder) => (
                      <li
                        key={`${skill.name}-${holder.userId}`}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate text-muted-foreground">{holder.fullName}</span>
                        {canManage && skill.skillId ? (
                          <MutationButton
                            variant="outline"
                            className="h-8 shrink-0"
                            onClick={async () => {
                              await removeSkill(organizationId, holder.userId, skill.skillId!);
                              toast.success(`Removed ${skill.name} from ${holder.fullName}`);
                              await load();
                            }}
                          >
                            Remove
                          </MutationButton>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="certifications" className="mt-4 space-y-3">
          {canManage ? (
            <div className="flex justify-end">
              <MutationButton
                className="h-11 md:h-8"
                onClick={() => {
                  setEditingCertId(null);
                  setCertOpen(true);
                }}
              >
                Add certification
              </MutationButton>
            </div>
          ) : null}
          {team.certifications.length === 0 ? (
            <EmptyState
              title="No certifications have been added for this team's members yet."
              action={
                canManage ? (
                  <MutationButton
                    className="mt-2 h-11 md:h-8"
                    onClick={() => {
                      setEditingCertId(null);
                      setCertOpen(true);
                    }}
                  >
                    Add certification
                  </MutationButton>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Certification</th>
                      <th className="px-4 py-2 font-medium">Technician</th>
                      <th className="px-4 py-2 font-medium">Number</th>
                      <th className="px-4 py-2 font-medium">Issued</th>
                      <th className="px-4 py-2 font-medium">Expiry</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      {canManage ? <th className="px-4 py-2 font-medium">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {team.certifications.map((cert) => (
                      <tr key={cert.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium">{cert.name}</td>
                        <td className="px-4 py-2">{cert.holderName}</td>
                        <td className="px-4 py-2">{cert.certificateNumber ?? "—"}</td>
                        <td className="px-4 py-2">
                          {cert.issuedAt
                            ? new Date(cert.issuedAt).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {cert.expiresAt
                            ? new Date(cert.expiresAt).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-4 py-2">
                          <StatusPill
                            label={certificationLabel(cert.status)}
                            tone={certificationTone(cert.status)}
                          />
                        </td>
                        {canManage ? (
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-1">
                              <MutationButton
                                variant="outline"
                                className="h-8"
                                onClick={() => {
                                  setEditingCertId(cert.id);
                                  setCertOpen(true);
                                }}
                              >
                                Edit
                              </MutationButton>
                              <MutationButton
                                variant="outline"
                                className="h-8"
                                onClick={async () => {
                                  if (
                                    !window.confirm(
                                      `Remove this certification from ${cert.holderName}?`,
                                    )
                                  ) {
                                    return;
                                  }
                                  await removeCertification(
                                    organizationId,
                                    cert.userId,
                                    cert.id,
                                  );
                                  toast.success("Certification removed");
                                  await load();
                                }}
                              >
                                Remove
                              </MutationButton>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
                {team.certifications.map((cert) => (
                  <li key={cert.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{cert.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {cert.holderName}
                          {cert.certificateNumber ? ` · ${cert.certificateNumber}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {cert.expiresAt
                            ? `Expires ${new Date(cert.expiresAt).toLocaleDateString()}`
                            : "No expiry"}
                        </p>
                      </div>
                      <StatusPill
                        label={certificationLabel(cert.status)}
                        tone={certificationTone(cert.status)}
                      />
                    </div>
                    {canManage ? (
                      <div className="flex gap-2">
                        <MutationButton
                          variant="outline"
                          className="h-11 flex-1"
                          onClick={() => {
                            setEditingCertId(cert.id);
                            setCertOpen(true);
                          }}
                        >
                          Edit
                        </MutationButton>
                        <MutationButton
                          variant="outline"
                          className="h-11 flex-1"
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `Remove this certification from ${cert.holderName}?`,
                              )
                            ) {
                              return;
                            }
                            await removeCertification(organizationId, cert.userId, cert.id);
                            toast.success("Certification removed");
                            await load();
                          }}
                        >
                          Remove
                        </MutationButton>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
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
            <MutationButton className="h-11 w-full" variant="outline" onClick={() => void onDeactivate()}>
              Deactivate team
            </MutationButton>
          ) : (
            <MutationButton className="h-11 w-full" onClick={() => void onReactivate()}>
              Reactivate team
            </MutationButton>
          )}
        </div>
      ) : null}

      <TeamFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        organizationId={organizationId}
        team={team}
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
      <AssignSkillDrawer
        open={skillOpen}
        onOpenChange={setSkillOpen}
        organizationId={organizationId}
        members={activeMembers}
        catalogSkills={catalogSkills}
        onSaved={async () => {
          setSkillOpen(false);
          await load();
        }}
      />
      <CertificationDrawer
        open={certOpen}
        onOpenChange={(open) => {
          setCertOpen(open);
          if (!open) setEditingCertId(null);
        }}
        organizationId={organizationId}
        members={activeMembers}
        initial={editingCert}
        onSaved={async () => {
          setCertOpen(false);
          setEditingCertId(null);
          await load();
        }}
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

function AssignSkillDrawer({
  open,
  onOpenChange,
  organizationId,
  members,
  catalogSkills,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  members: TeamDetail["members"];
  catalogSkills: SkillRecord[];
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"existing" | "create">("existing");
  const [skillId, setSkillId] = useState("");
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("existing");
    setSkillId(catalogSkills[0]?.id ?? "");
    setNewName("");
    setSelected(members.map((member) => member.userId));
    setError(null);
  }, [open, catalogSkills, members]);

  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Assign skill"
      description="Assign an organization skill to active members of this team."
    >
      <form
        className="space-y-4 px-4 py-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (selected.length === 0) {
            setError("Select at least one team member.");
            return;
          }
          setBusy(true);
          setError(null);
          try {
            let resolvedSkillId = skillId;
            if (mode === "create") {
              const created = await createSkill(organizationId, newName.trim());
              resolvedSkillId = created.id;
            }
            if (!resolvedSkillId) {
              setError("Choose or create a skill.");
              setBusy(false);
              return;
            }
            for (const userId of selected) {
              try {
                await assignSkill(organizationId, userId, resolvedSkillId);
              } catch (err) {
                if (!(err instanceof ApiError && err.status === 409)) {
                  throw err;
                }
              }
            }
            toast.success("Skill assigned");
            await onSaved();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not assign skill.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            className={mode === "existing" ? "font-medium text-foreground" : "text-muted-foreground"}
            onClick={() => setMode("existing")}
          >
            Existing skill
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            type="button"
            className={mode === "create" ? "font-medium text-foreground" : "text-muted-foreground"}
            onClick={() => setMode("create")}
          >
            Create new skill
          </button>
        </div>
        {mode === "existing" ? (
          <FormField>
            <Label htmlFor="skill-select">Skill</Label>
            <select
              id="skill-select"
              className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              value={skillId}
              onChange={(event) => setSkillId(event.target.value)}
              required
            >
              <option value="">Select a skill</option>
              {catalogSkills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
            </select>
          </FormField>
        ) : (
          <FormField>
            <Label htmlFor="skill-name">Skill name</Label>
            <Input
              id="skill-name"
              className="h-11"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              required
              maxLength={80}
            />
          </FormField>
        )}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Team members</legend>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active members on this team.</p>
          ) : (
            members.map((member) => {
              const checked = selected.includes(member.userId);
              return (
                <label key={member.userId} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelected((current) =>
                        checked
                          ? current.filter((id) => id !== member.userId)
                          : [...current, member.userId],
                      );
                    }}
                  />
                  {member.fullName}
                </label>
              );
            })
          )}
        </fieldset>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <MutationButton type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? "Saving…" : "Assign skill"}
        </MutationButton>
      </form>
    </ResponsiveDrawer>
  );
}

function CertificationDrawer({
  open,
  onOpenChange,
  organizationId,
  members,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  members: TeamDetail["members"];
  initial: (TeamDetail["certifications"][number]) | null;
  onSaved: () => Promise<void>;
}) {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUserId(initial?.userId ?? members[0]?.userId ?? "");
    setName(initial?.name ?? "");
    setCertificateNumber(initial?.certificateNumber ?? "");
    setIssuedAt(initial?.issuedAt ? initial.issuedAt.slice(0, 10) : "");
    setExpiresAt(initial?.expiresAt ? initial.expiresAt.slice(0, 10) : "");
    setError(null);
  }, [open, initial, members]);

  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit certification" : "Add certification"}
      description="Certifications belong to individual technicians on this team."
    >
      <form
        className="space-y-3 px-4 py-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!userId || !name.trim()) {
            setError("Member and certification name are required.");
            return;
          }
          setBusy(true);
          setError(null);
          const body = {
            name: name.trim(),
            certificateNumber: certificateNumber.trim() || undefined,
            issuedAt: issuedAt || undefined,
            expiresAt: expiresAt || undefined,
          };
          try {
            if (initial) {
              await updateCertification(organizationId, initial.userId, initial.id, body);
              toast.success("Certification updated");
            } else {
              await addCertification(organizationId, userId, body);
              toast.success("Certification added");
            }
            await onSaved();
          } catch (err) {
            setError(
              err instanceof ApiError ? err.message : "Could not save certification.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormField>
          <Label htmlFor="cert-member">Team member</Label>
          <select
            id="cert-member"
            className="h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            disabled={Boolean(initial)}
            required
          >
            <option value="">Select a member</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName}
              </option>
            ))}
          </select>
        </FormField>
        <FormField>
          <Label htmlFor="cert-name">Certification name</Label>
          <Input
            id="cert-name"
            className="h-11"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={160}
          />
        </FormField>
        <FormField>
          <Label htmlFor="cert-number">Certificate number</Label>
          <Input
            id="cert-number"
            className="h-11"
            value={certificateNumber}
            onChange={(event) => setCertificateNumber(event.target.value)}
            maxLength={80}
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField>
            <Label htmlFor="cert-issued">Issued date</Label>
            <Input
              id="cert-issued"
              type="date"
              className="h-11"
              value={issuedAt}
              onChange={(event) => setIssuedAt(event.target.value)}
            />
          </FormField>
          <FormField>
            <Label htmlFor="cert-expires">Expiry date</Label>
            <Input
              id="cert-expires"
              type="date"
              className="h-11"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </FormField>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <MutationButton type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? "Saving…" : initial ? "Save changes" : "Add certification"}
        </MutationButton>
      </form>
    </ResponsiveDrawer>
  );
}
