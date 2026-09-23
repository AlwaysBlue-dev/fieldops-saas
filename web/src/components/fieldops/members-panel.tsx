"use client";

import { EmptyState } from "@/components/fieldops/empty-state";
import { ErrorState } from "@/components/fieldops/error-state";
import { FormField } from "@/components/fieldops/responsive-form";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { StatusPill } from "@/components/fieldops/status-pill";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { getMyOrganizations } from "@/lib/auth";
import {
  createInvitation,
  listInvitations,
  listMembers,
  resendInvitation,
  revokeInvitation,
  updateMember,
  type OrgInvitation,
  type OrgMember,
} from "@/lib/organizations";
import { ACTIVATION_UNAVAILABLE_MESSAGE } from "@/lib/subscription";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MutationButton, useCanMutate } from "./mutation-control";
import { RequestPlanChangeButton } from "./subscription-banners";

const ROLES: OrgMember["role"][] = [
  "OWNER",
  "ADMIN",
  "OPERATIONS_MANAGER",
  "SUPERVISOR",
  "TECHNICIAN",
];

export function MembersPanel() {
  const params = useParams<{ orgSlug: string }>();
  const { canMutate } = useCanMutate();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [invites, setInvites] = useState<OrgInvitation[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [seatLimitHit, setSeatLimitHit] = useState(false);
  const [pending, setPending] = useState(false);

  const applyLists = useCallback(
    (orgId: string, nextMembers: OrgMember[], nextInvites: OrgInvitation[]) => {
      setOrganizationId(orgId);
      setMembers(nextMembers);
      setInvites(nextInvites);
      setStatus("ready");
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    getMyOrganizations()
      .then(async (memberships) => {
        const match = memberships.find(
          (item) => item.organization.slug === params.orgSlug,
        );
        if (!match) {
          throw new ApiError(404, "Organization not found");
        }
        const [nextMembers, nextInvites] = await Promise.all([
          listMembers(match.organization.id),
          listInvitations(match.organization.id),
        ]);
        if (!cancelled) {
          applyLists(match.organization.id, nextMembers, nextInvites);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load members.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [applyLists, params.orgSlug]);

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [nextMembers, nextInvites] = await Promise.all([
        listMembers(organizationId),
        listInvitations(organizationId),
      ]);
      applyLists(organizationId, nextMembers, nextInvites);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load members.");
      setStatus("error");
    }
  }, [applyLists, organizationId]);

  if (status === "loading") {
    return <SkeletonBlock rows={6} />;
  }
  if (status === "error" || !organizationId) {
    return <ErrorState description={error ?? undefined} onRetry={() => void load()} />;
  }

  const pendingInvites = invites.filter((item) => item.status === "PENDING");

  return (
    <div className="flex flex-col gap-6">
      <form
        className="rounded-lg border border-border bg-card px-4 py-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canMutate) return;
          const form = new FormData(event.currentTarget);
          setPending(true);
          setError(null);
          setSeatLimitHit(false);
          try {
            await createInvitation(organizationId, {
              email: String(form.get("email") ?? ""),
              role: String(form.get("role") ?? "TECHNICIAN") as OrgMember["role"],
            });
            event.currentTarget.reset();
            await load();
          } catch (err) {
            if (
              err instanceof ApiError &&
              (err.error === "PLAN_LIMIT_REACHED" || err.code === "PLAN_LIMIT_REACHED")
            ) {
              setSeatLimitHit(true);
              setError(err.message);
            } else {
              setError(
                err instanceof ApiError ? err.message : "Could not send invitation.",
              );
            }
          } finally {
            setPending(false);
          }
        }}
      >
        <h2 className="text-sm font-semibold">Invite a member</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_10rem_auto]">
          <FormField>
            <Label htmlFor="email">Work email</Label>
              <Input
              id="email"
              name="email"
              type="email"
              required
              disabled={!canMutate}
              className="h-11 md:h-8"
            />
          </FormField>
          <FormField>
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              name="role"
              defaultValue="TECHNICIAN"
              disabled={!canMutate}
              className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </FormField>
          <MutationButton type="submit" className="mt-auto h-11 md:h-8" disabled={pending}>
            {pending ? "Sending…" : "Invite Member"}
          </MutationButton>
        </div>
        {error ? (
          <div role="alert" className="mt-2 space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            {seatLimitHit && organizationId ? (
              <div className="flex flex-wrap items-center gap-2">
                <RequestPlanChangeButton
                  organizationId={organizationId}
                  label="Request plan change"
                  variant="outline"
                />
                <Link
                  href={`/app/${params.orgSlug}/settings/plan-usage`}
                  className="text-sm text-primary"
                >
                  View plan & usage
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </form>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Members</h2>
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{member.user.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {member.user.email}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  label={member.status === "ACTIVE" ? "Active" : "Inactive"}
                  tone={member.status === "ACTIVE" ? "emerald" : "muted"}
                />
                <select
                  aria-label={`Role for ${member.user.fullName}`}
                  className="h-11 rounded-md border border-input bg-transparent px-2 text-sm md:h-8"
                  value={member.role}
                  disabled={!canMutate}
                  title={canMutate ? undefined : ACTIVATION_UNAVAILABLE_MESSAGE}
                  onChange={async (event) => {
                    try {
                      await updateMember(organizationId, member.id, {
                        role: event.target.value as OrgMember["role"],
                      });
                      await load();
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : "Could not change role.");
                    }
                  }}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <MutationButton
                  type="button"
                  variant="outline"
                  className="h-11 md:h-8"
                  onClick={async () => {
                    try {
                      await updateMember(organizationId, member.id, {
                        status: member.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                      });
                      await load();
                    } catch (err) {
                      setError(
                        err instanceof ApiError
                          ? err.message
                          : "Could not update membership.",
                      );
                    }
                  }}
                >
                  {member.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                </MutationButton>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Pending invitations</h2>
        {pendingInvites.length === 0 ? (
          <EmptyState
            title="No pending invitations"
            description="New invites will appear here until they are accepted or revoked."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {invite.role.replaceAll("_", " ")} · expires{" "}
                    {new Date(invite.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <MutationButton
                    type="button"
                    variant="outline"
                    className="h-11 md:h-8"
                    onClick={async () => {
                      await resendInvitation(organizationId, invite.id);
                      await load();
                    }}
                  >
                    Resend
                  </MutationButton>
                  <MutationButton
                    type="button"
                    variant="ghost"
                    className="h-11 md:h-8"
                    onClick={async () => {
                      await revokeInvitation(organizationId, invite.id);
                      await load();
                    }}
                  >
                    Revoke
                  </MutationButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
