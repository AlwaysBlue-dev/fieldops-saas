"use client";

import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { createInvitation } from "@/lib/organizations";
import type { TeamSummary } from "@/lib/teams";
import { useState } from "react";
import { MutationButton } from "./mutation-control";
import { ResponsiveDrawer } from "./responsive-drawer";

export function InviteTechnicianSheet({
  open,
  onOpenChange,
  organizationId,
  teams,
  defaultTeamId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  teams: TeamSummary[];
  defaultTeamId?: string;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeTeams = teams.filter((team) => team.status === "ACTIVE");

  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Invite technician"
      description="Uses the organization invitation. Optionally assign a team after they accept."
    >
      <ResponsiveForm
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const teamId = String(form.get("teamId") ?? "") || undefined;
          setPending(true);
          setError(null);
          try {
            await createInvitation(organizationId, {
              email: String(form.get("email") ?? ""),
              role: "TECHNICIAN",
              teamId,
            });
            onOpenChange(false);
            onSaved();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not send invitation.");
          } finally {
            setPending(false);
          }
        }}
      >
        <FormField>
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" name="email" type="email" required autoComplete="email" />
        </FormField>
        <FormField>
          <Label htmlFor="invite-team">Team after acceptance</Label>
          <select
            id="invite-team"
            name="teamId"
            className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
            defaultValue={defaultTeamId ?? ""}
          >
            <option value="">Assign later</option>
            {activeTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </FormField>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <MutationButton type="submit" className="h-11 w-full md:h-8" disabled={pending}>
          Send invitation
        </MutationButton>
      </ResponsiveForm>
    </ResponsiveDrawer>
  );
}
