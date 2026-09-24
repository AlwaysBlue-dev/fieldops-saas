"use client";

import { AsyncEntityCombobox } from "@/components/fieldops/async-entity-combobox";
import { FormField, ResponsiveForm } from "@/components/fieldops/responsive-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  personDisplayName,
  personSecondaryLine,
} from "@/lib/person-label";
import {
  createTeam,
  listMembersForSupervisor,
  updateTeam,
  type TeamDetail,
  type TeamSummary,
} from "@/lib/teams";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { MutationButton } from "./mutation-control";
import { ResponsiveDrawer } from "./responsive-drawer";

const SUPERVISOR_ROLES =
  "OWNER,ADMIN,OPERATIONS_MANAGER,SUPERVISOR";

export function TeamFormSheet({
  open,
  onOpenChange,
  organizationId,
  team,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  team?: TeamSummary | TeamDetail | null;
  onSaved: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supervisorUserId, setSupervisorUserId] = useState(
    team?.supervisor?.userId ?? "",
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
      const result = await listMembersForSupervisor(organizationId, {
        search,
        page,
        pageSize,
        roles: SUPERVISOR_ROLES,
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

  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setSupervisorUserId(team?.supervisor?.userId ?? "");
          setError(null);
        }
      }}
      title={team ? "Edit team" : "New team"}
      description="Crew used for dispatch and field coverage."
    >
      <ResponsiveForm
        className="flex min-h-0 flex-1 flex-col gap-4 pb-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const body = {
            name: String(form.get("name") ?? ""),
            code: String(form.get("code") ?? "") || undefined,
            description: String(form.get("description") ?? "") || undefined,
            supervisorUserId: supervisorUserId || undefined,
          };
          setPending(true);
          setError(null);
          try {
            if (team) {
              await updateTeam(organizationId, team.id, body);
              toast.success("Team updated");
            } else {
              await createTeam(organizationId, body);
              toast.success("Team created");
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
        <div className="flex flex-col gap-3 overflow-y-auto pr-1">
          <FormField>
            <Label htmlFor="name">Team name</Label>
            <Input id="name" name="name" required defaultValue={team?.name ?? ""} />
          </FormField>
          <FormField>
            <Label htmlFor="code">Team code</Label>
            <Input id="code" name="code" defaultValue={team?.code ?? ""} />
          </FormField>
          <FormField>
            <Label>Supervisor</Label>
            <AsyncEntityCombobox
              value={supervisorUserId}
              onValueChange={setSupervisorUserId}
              fetchPage={fetchSupervisors}
              placeholder="Search members…"
              emptyLabel="No eligible supervisors found."
              selectedLabel={
                team?.supervisor
                  ? personDisplayName(team.supervisor)
                  : undefined
              }
              ariaLabel="Supervisor"
            />
            <p className="text-xs text-muted-foreground">
              Optional. Choose an active organization member who can lead this crew.
            </p>
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
        </div>
        <div className="sticky bottom-0 border-t border-border bg-card pt-3">
          <MutationButton type="submit" className="h-11 w-full md:h-9" disabled={pending}>
            {team ? "Save team" : "Create team"}
          </MutationButton>
        </div>
      </ResponsiveForm>
    </ResponsiveDrawer>
  );
}
