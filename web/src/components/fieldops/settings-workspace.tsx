"use client";

import { MembersPanel } from "@/components/fieldops/members-panel";
import { PageHeader } from "@/components/fieldops/page-header";
import { SkeletonBlock } from "@/components/fieldops/skeleton-block";
import { SubscriptionSettings } from "@/app/app/[orgSlug]/settings/subscription-settings";
import { SettingsAppearance } from "@/app/app/[orgSlug]/settings/settings-appearance";
import { SettingsAppDevice } from "@/app/app/[orgSlug]/settings/settings-app-device";
import { SettingsBrandingSection } from "@/app/app/[orgSlug]/settings/settings-branding-section";
import { SettingsOrganizationSection } from "@/app/app/[orgSlug]/settings/settings-organization-section";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api";
import type { OrganizationMembership } from "@/lib/auth";
import {
  canEditOrganizationSettings,
  canInviteMembers,
  canManageBilling,
  canManageCustomers,
  canManageSubscription,
  canViewPlanUsage,
  resolveCurrentMembership,
} from "@/lib/current-org";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export type SettingsTabId =
  | "organization"
  | "members"
  | "branding"
  | "appearance"
  | "app"
  | "storage"
  | "plan-usage"
  | "billing"
  | "subscription";

type TabDef = {
  id: SettingsTabId;
  label: string;
  allowed: boolean;
};

function buildTabs(membership: OrganizationMembership | null): TabDef[] {
  return [
    { id: "organization", label: "Organization", allowed: Boolean(membership) },
    {
      id: "members",
      label: "Members",
      allowed: canInviteMembers(membership),
    },
    {
      id: "branding",
      label: "Branding",
      allowed: canEditOrganizationSettings(membership),
    },
    { id: "appearance", label: "Appearance", allowed: Boolean(membership) },
    { id: "app", label: "App", allowed: Boolean(membership) },
    {
      id: "storage",
      label: "Storage",
      allowed: canManageCustomers(membership),
    },
    {
      id: "plan-usage",
      label: "Plan & Usage",
      allowed: canViewPlanUsage(membership),
    },
    {
      id: "billing",
      label: "Billing",
      allowed: canManageBilling(membership),
    },
    {
      id: "subscription",
      label: "Plan & Subscription",
      allowed: canManageSubscription(membership),
    },
  ];
}

function resolveTab(
  requested: string | undefined,
  tabs: TabDef[],
): SettingsTabId {
  const visible = tabs.filter((tab) => tab.allowed);
  if (requested && visible.some((tab) => tab.id === requested)) {
    return requested as SettingsTabId;
  }
  return visible[0]?.id ?? "organization";
}

export function SettingsWorkspace({
  orgSlug,
  initialTab,
}: {
  orgSlug: string;
  initialTab?: string;
}) {
  const router = useRouter();
  const [membership, setMembership] = useState<OrganizationMembership | null>(
    null,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [forcedDenied, setForcedDenied] = useState<SettingsTabId | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveCurrentMembership(orgSlug)
      .then((match) => {
        if (cancelled) return;
        if (!match) {
          setError("Organization not found.");
          setStatus("error");
          return;
        }
        setMembership(match);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Could not load settings.",
        );
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  const tabs = useMemo(() => buildTabs(membership), [membership]);
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => tab.allowed),
    [tabs],
  );

  useEffect(() => {
    if (status !== "ready") return;
    if (!initialTab) {
      setForcedDenied(null);
      return;
    }
    const def = tabs.find((tab) => tab.id === initialTab);
    if (def && !def.allowed) {
      setForcedDenied(def.id);
    } else {
      setForcedDenied(null);
    }
  }, [status, initialTab, tabs]);

  const activeTab = resolveTab(
    forcedDenied ? undefined : initialTab,
    tabs,
  );

  function selectTab(next: string) {
    setForcedDenied(null);
    const url =
      next === "organization"
        ? `/app/${orgSlug}/settings`
        : `/app/${orgSlug}/settings?tab=${next}`;
    router.replace(url);
  }

  if (status === "loading") {
    return <SkeletonBlock rows={8} />;
  }

  if (status === "error") {
    return (
      <p className="text-sm text-muted-foreground">{error ?? "Settings unavailable."}</p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Settings"
        description="Organization configuration, members, and workspace preferences."
      />

      {forcedDenied ? (
        <div className="mt-4 rounded-lg border border-border bg-card px-4 py-6">
          <p className="text-sm font-medium">Insufficient permission</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your role cannot open this settings section.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 h-11 md:h-8"
            onClick={() => selectTab(activeTab)}
          >
            Back to allowed settings
          </Button>
        </div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={selectTab}
          className="mt-4"
        >
          <div className="border-b border-border">
            <TabsList
              variant="line"
              className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-none bg-transparent p-0 shadow-none"
            >
              {visibleTabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="h-10 flex-none shrink-0 px-3 after:bottom-0 md:h-9"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="organization" className="mt-4">
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Organization</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Company profile, business type, timezone, and normal working week.
              </p>
              <div className="mt-4">
                <SettingsOrganizationSection orgSlug={orgSlug} />
              </div>
            </section>
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Members</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Invite people, assign roles, and deactivate accounts.
              </p>
              <div className="mt-4">
                <MembersPanel />
              </div>
              <p className="mt-3 text-sm">
                <Link
                  href={`/app/${orgSlug}/settings/members`}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Open full members page
                </Link>
              </p>
            </section>
          </TabsContent>

          <TabsContent value="branding" className="mt-4">
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Organization branding</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Logo and workspace identity shown in the sidebar and switcher.
              </p>
              <div className="mt-4">
                <SettingsBrandingSection orgSlug={orgSlug} />
              </div>
            </section>
          </TabsContent>

          <TabsContent value="appearance" className="mt-4">
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Appearance</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Light, dark, or match the system preference.
              </p>
              <div className="mt-4">
                <SettingsAppearance />
              </div>
            </section>
          </TabsContent>

          <TabsContent value="app" className="mt-4">
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">App & device</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Install FieldKeel on your phone for an app-like workspace
                experience.
              </p>
              <div className="mt-4">
                <SettingsAppDevice orgSlug={orgSlug} />
              </div>
            </section>
          </TabsContent>

          <TabsContent value="storage" className="mt-4">
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Storage</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Workspace storage usage, breakdown, and stored files. Quota is
                shared across the organization.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button asChild className="h-11 md:h-8">
                  <Link href={`/app/${orgSlug}/settings/storage`}>
                    Open storage
                  </Link>
                </Button>
                <Link
                  href="/docs/storage-overview"
                  className="text-sm text-primary underline-offset-2 hover:underline"
                >
                  Learn about storage limits
                </Link>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="plan-usage" className="mt-4">
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Plan & Usage</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Current plan, seats, storage, and feature entitlements.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild className="h-11 md:h-8">
                  <Link href={`/app/${orgSlug}/settings/plan-usage`}>
                    Open plan & usage
                  </Link>
                </Button>
                <Link
                  href="/docs/billing-plans"
                  className="inline-flex h-11 items-center text-sm text-primary underline-offset-2 hover:underline md:h-8"
                >
                  Billing documentation
                </Link>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="billing" className="mt-4">
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Billing</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Invoices and payment reporting for this workspace.
              </p>
              <div className="mt-4">
                <Button asChild className="h-11 md:h-8">
                  <Link href={`/app/${orgSlug}/settings/billing`}>
                    Open billing
                  </Link>
                </Button>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="subscription" className="mt-4">
            <section className="rounded-lg border border-border bg-card px-4 py-4">
              <h2 className="text-sm font-semibold">Plan & Subscription</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Trial, activation, and renewal. Payment is arranged with
                FieldKeel outside the product.
              </p>
              <div className="mt-4">
                <SubscriptionSettings />
              </div>
            </section>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
