"use client";

import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { FormField } from "@/components/fieldops/responsive-form";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { canManageCrew, resolveCurrentMembership } from "@/lib/current-org";
import {
  addCertification,
  assignSkill,
  certificationLabel,
  certificationTone,
  createSkill,
  getTechnician,
  listSkills,
  updateCertification,
  type SkillRecord,
  type TechnicianProfile,
} from "@/lib/teams";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MutationButton } from "./mutation-control";

export function TechnicianProfileWorkspace() {
  const params = useParams<{ orgSlug: string; userId: string }>();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [profile, setProfile] = useState<TechnicianProfile | null>(null);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

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
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load profile.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.orgSlug]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    const [next, catalog] = await Promise.all([
      getTechnician(organizationId, params.userId),
      listSkills(organizationId),
    ]);
    setProfile(next);
    setSkills(catalog);
    setStatus("ready");
  }, [organizationId, params.userId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    Promise.all([
      getTechnician(organizationId, params.userId),
      listSkills(organizationId),
    ])
      .then(([next, catalog]) => {
        if (cancelled) return;
        setProfile(next);
        setSkills(catalog);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load profile.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, params.userId]);

  if (status === "loading") {
    return <SkeletonBlock rows={8} />;
  }
  if (status === "error" || !organizationId || !profile) {
    return <ErrorState description={error ?? undefined} onRetry={() => void load()} />;
  }

  const assignedSkillIds = new Set(profile.skills.map((skill) => skill.skillId));
  const availableSkills = skills.filter((skill) => !assignedSkillIds.has(skill.id));

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4">
      <div>
        <Link
          href={`/app/${params.orgSlug}/teams`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Teams
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold md:text-xl">{profile.fullName}</h1>
          <StatusPill label={profile.role.replaceAll("_", " ")} tone="cobalt" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {profile.email ?? "Email hidden"}
          {profile.phone ? ` · ${profile.phone}` : ""}
        </p>
      </div>

      <section className="rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Teams</h2>
        {profile.teams.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Not assigned to a team.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {profile.teams.map((team) => (
              <li key={team.id}>
                <Link
                  href={`/app/${params.orgSlug}/teams/${team.id}`}
                  className="text-sm hover:underline"
                >
                  {team.name}
                  {team.isSupervisor ? " · Supervisor" : ""}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Skills</h2>
        {profile.skills.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No skills assigned.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {profile.skills.map((skill) => (
              <li key={skill.id}>
                <StatusPill label={skill.name} tone="teal" />
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <form
              className="flex flex-col gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const skillId = String(form.get("skillId") ?? "");
                if (!skillId) return;
                await assignSkill(organizationId, profile.userId, skillId);
                await load();
              }}
            >
              <Label htmlFor="assign-skill">Assign existing skill</Label>
              <select
                id="assign-skill"
                name="skillId"
                className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
                defaultValue=""
              >
                <option value="">Select skill</option>
                {availableSkills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
              <MutationButton type="submit" className="h-11 md:h-8">
                Assign skill
              </MutationButton>
            </form>
            <form
              className="flex flex-col gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const name = String(new FormData(form).get("name") ?? "").trim();
                if (!name) return;
                const created = await createSkill(organizationId, name);
                await assignSkill(organizationId, profile.userId, created.id);
                form.reset();
                await load();
              }}
            >
              <Label htmlFor="new-skill">Add organization skill</Label>
              <Input id="new-skill" name="name" placeholder="e.g. Electrical" className="h-11 md:h-8" />
              <MutationButton type="submit" className="h-11 md:h-8">
                Create and assign
              </MutationButton>
            </form>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-card px-4 py-4">
        <h2 className="text-sm font-semibold">Certifications</h2>
        {profile.certifications.length === 0 ? (
          <EmptyState
            title="No certifications"
            description="Recorded certificates for this person appear here."
          />
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {profile.certifications.map((cert) => (
              <li key={cert.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{cert.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cert.certificateNumber ? `#${cert.certificateNumber} · ` : ""}
                      {cert.expiresAt
                        ? `expires ${new Date(cert.expiresAt).toLocaleDateString()}`
                        : "no expiry"}
                      {cert.documentRef ? ` · ${cert.documentRef}` : ""}
                    </p>
                  </div>
                  <StatusPill
                    label={certificationLabel(cert.status)}
                    tone={certificationTone(cert.status)}
                  />
                </div>
                {canManage ? (
                  <form
                    className="grid gap-2 md:grid-cols-2"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const expiresAt = String(form.get("expiresAt") ?? "");
                      await updateCertification(organizationId, profile.userId, cert.id, {
                        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
                        certificateNumber:
                          String(form.get("certificateNumber") ?? "") || undefined,
                      });
                      await load();
                    }}
                  >
                    <Input
                      name="certificateNumber"
                      defaultValue={cert.certificateNumber ?? ""}
                      placeholder="Certificate number"
                      className="h-11 md:h-8"
                    />
                    <Input
                      name="expiresAt"
                      type="date"
                      defaultValue={cert.expiresAt?.slice(0, 10) ?? ""}
                      className="h-11 md:h-8"
                    />
                    <MutationButton type="submit" variant="outline" className="h-11 md:h-8">
                      Update
                    </MutationButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canManage ? (
          <form
            className="mt-4 grid gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              await addCertification(organizationId, profile.userId, {
                name: String(data.get("name") ?? ""),
                certificateNumber: String(data.get("certificateNumber") ?? "") || undefined,
                issuedAt: String(data.get("issuedAt") ?? "")
                  ? new Date(String(data.get("issuedAt"))).toISOString()
                  : undefined,
                expiresAt: String(data.get("expiresAt") ?? "")
                  ? new Date(String(data.get("expiresAt"))).toISOString()
                  : undefined,
                documentRef: String(data.get("documentRef") ?? "") || undefined,
              });
              form.reset();
              await load();
            }}
          >
            <p className="text-sm font-medium">Add certification</p>
            <FormField>
              <Label htmlFor="cert-name">Name</Label>
              <Input id="cert-name" name="name" required className="h-11 md:h-8" />
            </FormField>
            <div className="grid gap-2 md:grid-cols-2">
              <FormField>
                <Label htmlFor="cert-number">Number</Label>
                <Input id="cert-number" name="certificateNumber" className="h-11 md:h-8" />
              </FormField>
              <FormField>
                <Label htmlFor="cert-ref">Document reference</Label>
                <Input id="cert-ref" name="documentRef" className="h-11 md:h-8" />
              </FormField>
              <FormField>
                <Label htmlFor="cert-issued">Issued</Label>
                <Input id="cert-issued" name="issuedAt" type="date" className="h-11 md:h-8" />
              </FormField>
              <FormField>
                <Label htmlFor="cert-expires">Expires</Label>
                <Input id="cert-expires" name="expiresAt" type="date" className="h-11 md:h-8" />
              </FormField>
            </div>
            <MutationButton type="submit" className="h-11 md:h-8">
              Add certification
            </MutationButton>
          </form>
        ) : null}
      </section>
    </div>
  );
}
