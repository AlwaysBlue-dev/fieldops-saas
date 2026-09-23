"use client";

import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  createTeam,
  updateTeam,
  type TeamDetail,
  type TeamSummary,
  type TechnicianSummary,
} from "@/lib/teams";
import { useState } from "react";
import { MutationButton } from "./mutation-control";
import { ResponsiveDrawer } from "./responsive-drawer";

export function TeamFormSheet({
  open,
  onOpenChange,
  organizationId,
  team,
  technicians,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  team?: TeamSummary | TeamDetail | null;
  technicians: TechnicianSummary[];
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={team ? "Edit team" : "New team"}
      description="Crew used for dispatch and field coverage."
    >
      <ResponsiveForm
        className="min-h-[50dvh]"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const body = {
            name: String(form.get("name") ?? ""),
            code: String(form.get("code") ?? "") || undefined,
            description: String(form.get("description") ?? "") || undefined,
            supervisorUserId: String(form.get("supervisorUserId") ?? "") || undefined,
          };
          setPending(true);
          setError(null);
          try {
            if (team) {
              await updateTeam(organizationId, team.id, body);
            } else {
              await createTeam(organizationId, body);
            }
            onOpenChange(false);
            onSaved();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not save team.");
          } finally {
            setPending(false);
          }
        }}
      >
        <FormField>
          <Label htmlFor="name">Team name</Label>
          <Input id="name" name="name" required defaultValue={team?.name ?? ""} />
        </FormField>
        <FormField>
          <Label htmlFor="code">Code</Label>
          <Input id="code" name="code" defaultValue={team?.code ?? ""} />
        </FormField>
        <FormField>
          <Label htmlFor="supervisorUserId">Supervisor</Label>
          <select
            id="supervisorUserId"
            name="supervisorUserId"
            className="h-11 rounded-lg border border-input bg-transparent px-2.5 text-sm md:h-8"
            defaultValue={team?.supervisor?.userId ?? ""}
          >
            <option value="">Unassigned</option>
            {technicians.map((person) => (
              <option key={person.userId} value={person.userId}>
                {person.fullName}
              </option>
            ))}
          </select>
        </FormField>
        <FormField>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={team?.description ?? ""}
          />
        </FormField>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <MutationButton type="submit" className="h-11 w-full md:h-8" disabled={pending}>
          {team ? "Save team" : "Create team"}
        </MutationButton>
      </ResponsiveForm>
    </ResponsiveDrawer>
  );
}
