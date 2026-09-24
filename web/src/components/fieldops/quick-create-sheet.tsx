"use client";

import { ClientFormSheet } from "@/components/fieldops/client-form-sheet";
import { SiteFormSheet } from "@/components/fieldops/site-form-sheet";
import { TeamFormSheet } from "@/components/fieldops/team-form-sheet";
import { AddTimeSheet } from "@/components/fieldops/add-time-sheet";
import { AsyncEntityCombobox } from "@/components/fieldops/async-entity-combobox";
import { MutationButton, useCanMutate } from "@/components/fieldops/mutation-control";
import { ResponsiveDrawer } from "@/components/fieldops/responsive-drawer";
import { Button } from "@/components/ui/button";
import type { OrganizationMembership } from "@/lib/auth";
import {
  canCreateJobs,
  canManageCrew,
  canManageCustomers,
} from "@/lib/current-org";
import { listClients } from "@/lib/clients";
import { getOrganization } from "@/lib/organizations";
import {
  BriefcaseBusiness,
  Clock3,
  FolderKanban,
  MapPin,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ActionId = "job" | "client" | "site" | "team" | "time";

export function QuickCreateSheet({
  open,
  onOpenChange,
  orgSlug,
  organizationId,
  membership,
  userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  organizationId: string;
  membership: OrganizationMembership | null;
  userId: string;
}) {
  const router = useRouter();
  const { canMutate, readOnly } = useCanMutate();
  const [mode, setMode] = useState<"menu" | "site-pick" | ActionId>("menu");
  const [clientOpen, setClientOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteClientId, setSiteClientId] = useState("");
  const [allowManualTime, setAllowManualTime] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (!open) {
      setMode("menu");
      return;
    }
    let cancelled = false;
    getOrganization(organizationId)
      .then((org) => {
        if (!cancelled) setAllowManualTime(Boolean(org.settings?.allowManualTime));
      })
      .catch(() => {
        if (!cancelled) setAllowManualTime(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, organizationId]);

  const actions = useMemo(() => {
    const list: Array<{
      id: ActionId;
      title: string;
      description: string;
      icon: typeof FolderKanban;
      available: boolean;
    }> = [
      {
        id: "job",
        title: "Job",
        description: "Create and schedule service work",
        icon: FolderKanban,
        available: canCreateJobs(membership),
      },
      {
        id: "client",
        title: "Client",
        description: "Add a customer",
        icon: BriefcaseBusiness,
        available: canManageCustomers(membership),
      },
      {
        id: "site",
        title: "Site",
        description: "Add a customer location",
        icon: MapPin,
        available: canManageCustomers(membership),
      },
      {
        id: "team",
        title: "Team",
        description: "Create an operational team",
        icon: Users,
        available: canManageCrew(membership),
      },
      {
        id: "time",
        title: "Time entry",
        description: "Add manual time",
        icon: Clock3,
        available: allowManualTime,
      },
    ];
    return list.filter((item) => item.available);
  }, [membership, allowManualTime]);

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

  const runAction = (id: ActionId) => {
    if (!canMutate) return;
    if (id === "job") {
      onOpenChange(false);
      router.push(`/app/${orgSlug}/jobs/new`);
      return;
    }
    if (id === "client") {
      setClientOpen(true);
      return;
    }
    if (id === "team") {
      setTeamOpen(true);
      return;
    }
    if (id === "time") {
      setTimeOpen(true);
      return;
    }
    if (id === "site") {
      setMode("site-pick");
    }
  };

  return (
    <>
      <ResponsiveDrawer
        open={open && mode === "menu"}
        onOpenChange={onOpenChange}
        title="Quick create"
        description="Start a new operational record for this workspace."
      >
        {readOnly ? (
          <p className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Your workspace is read-only. Activate or renew your subscription to
            create records.
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          {actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No create actions are available for your role.
            </p>
          ) : (
            actions.map((action) => (
              <MutationButton
                key={action.id}
                type="button"
                variant="outline"
                className="h-auto min-h-14 w-full justify-start gap-3 px-3 py-3 text-left"
                onClick={() => runAction(action.id)}
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <action.icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{action.title}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {action.description}
                  </span>
                </span>
              </MutationButton>
            ))
          )}
        </div>
      </ResponsiveDrawer>

      <ResponsiveDrawer
        open={open && mode === "site-pick"}
        onOpenChange={(next) => {
          if (!next) {
            setMode("menu");
            onOpenChange(false);
          }
        }}
        title="New site"
        description="Choose the customer this location belongs to."
      >
        <div className="flex flex-col gap-3">
          <AsyncEntityCombobox
            value={siteClientId}
            onValueChange={setSiteClientId}
            fetchPage={fetchClients}
            placeholder="Search clients…"
            emptyLabel="No clients found."
            ariaLabel="Client"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 md:h-8"
              onClick={() => setMode("menu")}
            >
              Back
            </Button>
            <MutationButton
              type="button"
              className="h-11 flex-1 md:h-8"
              disabled={!siteClientId}
              onClick={() => {
                setSiteOpen(true);
              }}
            >
              Continue
            </MutationButton>
          </div>
        </div>
      </ResponsiveDrawer>

      <ClientFormSheet
        open={clientOpen}
        onOpenChange={setClientOpen}
        organizationId={organizationId}
        onSaved={() => {
          setClientOpen(false);
          onOpenChange(false);
          toast.success("Client created");
          router.push(`/app/${orgSlug}/clients`);
        }}
      />

      <TeamFormSheet
        open={teamOpen}
        onOpenChange={setTeamOpen}
        organizationId={organizationId}
        onSaved={() => {
          setTeamOpen(false);
          onOpenChange(false);
          router.push(`/app/${orgSlug}/teams`);
        }}
      />

      <SiteFormSheet
        open={siteOpen}
        onOpenChange={setSiteOpen}
        organizationId={organizationId}
        clientId={siteClientId}
        onSaved={() => {
          setSiteOpen(false);
          onOpenChange(false);
          toast.success("Site created");
          if (siteClientId) {
            router.push(`/app/${orgSlug}/clients/${siteClientId}`);
          }
        }}
      />

      <AddTimeSheet
        open={timeOpen}
        onOpenChange={setTimeOpen}
        organizationId={organizationId}
        technicianUserId={userId}
        defaultDate={today}
        maxDate={today}
        onCreated={() => {
          setTimeOpen(false);
          onOpenChange(false);
          toast.success("Time entry added");
          router.push(`/app/${orgSlug}/time`);
        }}
      />
    </>
  );
}
