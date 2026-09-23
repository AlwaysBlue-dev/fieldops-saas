"use client";

import { Button } from "@/components/ui/button";
import type { OrganizationMembership, PublicUser } from "@/lib/auth";
import { getMe, getMyOrganizations, logout } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { desktopPrimaryNav } from "@/lib/navigation";
import { cn } from "cn";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CommandLauncher } from "./command-launcher";
import { ErrorState } from "./error-state";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { MutationButton } from "./mutation-control";
import { NavigationRail } from "./navigation-rail";
import { ResponsiveDrawer } from "./responsive-drawer";
import { SkeletonBlock } from "./skeleton-block";
import { SubscriptionBanners } from "./subscription-banners";
import {
  membershipOrganizationId,
  SubscriptionProvider,
} from "./subscription-provider";
import { TopBar } from "./top-bar";
import { TooltipProvider } from "@/components/ui/tooltip";

const RAIL_KEY = "fieldops.rail-collapsed";

function subscribeRail(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getRailCollapsed() {
  const stored = window.localStorage.getItem(RAIL_KEY);
  if (stored !== null) return stored === "1";
  return window.matchMedia("(max-width: 1023px)").matches;
}

export function AppShell({
  orgSlug,
  children,
}: {
  orgSlug: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const persistedCollapsed = useSyncExternalStore(
    subscribeRail,
    getRailCollapsed,
    () => false,
  );
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(
    null,
  );
  const collapsed = collapsedOverride ?? persistedCollapsed;
  const [user, setUser] = useState<PublicUser | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [commandOpen, setCommandOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const applySession = useCallback(
    (nextUser: PublicUser, orgs: OrganizationMembership[]) => {
      setUser(nextUser);
      setMemberships(orgs);
      setStatus("ready");
      if (orgs.length === 0) {
        router.replace("/onboarding");
        return;
      }
      const current = orgs.find((item) => item.organization.slug === orgSlug);
      if (!current) {
        router.replace(`/app/${orgs[0].organization.slug}/overview`);
        return;
      }
      const canOnboard =
        current.role === "OWNER" || current.role === "ADMIN";
      if (canOnboard && !current.organization.onboardingCompletedAt) {
        router.replace(`/onboarding?org=${current.organization.slug}`);
      }
    },
    [orgSlug, router],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMe(), getMyOrganizations()])
      .then(([{ user: nextUser }, orgs]) => {
        if (cancelled) return;
        applySession(nextUser, orgs);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
          return;
        }
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [applySession, router]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [{ user: nextUser }, orgs] = await Promise.all([
        getMe(),
        getMyOrganizations(),
      ]);
      applySession(nextUser, orgs);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setStatus("error");
    }
  }, [applySession, router]);

  const toggleRail = () => {
    const next = !collapsed;
    window.localStorage.setItem(RAIL_KEY, next ? "1" : "0");
    setCollapsedOverride(next);
  };

  if (status === "error") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
        <ErrorState onRetry={() => void load()} />
      </div>
    );
  }

  if (status === "loading" || !user) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-[220px] bg-nav md:block" />
        <div className="flex-1 px-4 py-6">
          <SkeletonBlock rows={8} />
        </div>
      </div>
    );
  }

  const currentMembership = memberships.find(
    (item) => item.organization.slug === orgSlug,
  );
  const organizationId = membershipOrganizationId(memberships, orgSlug);
  const canManage =
    currentMembership?.role === "OWNER" || currentMembership?.role === "ADMIN";

  return (
    <TooltipProvider>
      <SubscriptionProvider organizationId={organizationId}>
      <div className="flex min-h-dvh overflow-x-hidden bg-workspace">
        <a
          href="#workspace-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-card focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <NavigationRail
          orgSlug={orgSlug}
          memberships={memberships}
          collapsed={collapsed}
          onToggle={toggleRail}
          onHelp={() => setHelpOpen(true)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            orgSlug={orgSlug}
            memberships={memberships}
            user={user}
            onSearch={() => setCommandOpen(true)}
            onNotifications={() => setNotifyOpen(true)}
            onQuickCreate={() => setCreateOpen(true)}
          />
          {organizationId ? (
            <SubscriptionBanners
              organizationId={organizationId}
              orgSlug={orgSlug}
              canManage={canManage}
            />
          ) : null}
          <main
            id="workspace-main"
            className={cn(
              "min-w-0 flex-1 overflow-x-hidden px-4 py-4 md:px-6 md:py-5",
              "pb-mobile-nav md:pb-5",
            )}
          >
            {children}
          </main>
        </div>
        <MobileBottomNav
          orgSlug={orgSlug}
          role={currentMembership?.role}
          onMore={() => setMoreOpen(true)}
        />
        <CommandLauncher
          orgSlug={orgSlug}
          open={commandOpen}
          onOpenChange={setCommandOpen}
          onHelp={() => setHelpOpen(true)}
        />
        <ResponsiveDrawer
          open={moreOpen}
          onOpenChange={setMoreOpen}
          title="More"
          description="Secondary workspace destinations"
        >
          <div className="flex flex-col gap-1">
            {currentMembership?.role === "TECHNICIAN" ? (
              <Button
                variant="ghost"
                className="h-11 justify-start"
                onClick={() => {
                  setMoreOpen(false);
                  router.push(`/app/${orgSlug}/overview`);
                }}
              >
                Overview
              </Button>
            ) : null}
            {desktopPrimaryNav(orgSlug)
              .filter((item) =>
                !["overview", "my-day", "jobs", "schedule", "time"].some((key) =>
                  item.href.endsWith(`/${key}`),
                ),
              )
              .map((item) => (
                <Button
                  key={item.href}
                  variant="ghost"
                  className="h-11 justify-start"
                  onClick={() => {
                    setMoreOpen(false);
                    router.push(item.href);
                  }}
                >
                  <item.icon />
                  {item.label}
                </Button>
              ))}
            <Button
              variant="ghost"
              className="h-11 justify-start"
              onClick={() => {
                setMoreOpen(false);
                router.push(`/app/${orgSlug}/settings`);
              }}
            >
              Settings
            </Button>
            <Button
              variant="ghost"
              className="h-11 justify-start"
              onClick={() => {
                setMoreOpen(false);
                setHelpOpen(true);
              }}
            >
              Help
            </Button>
            <Button
              variant="ghost"
              className="h-11 justify-start"
              onClick={async () => {
                await logout().catch(() => undefined);
                router.replace("/login");
              }}
            >
              Sign out
            </Button>
          </div>
        </ResponsiveDrawer>
        <ResponsiveDrawer
          open={notifyOpen}
          onOpenChange={setNotifyOpen}
          title="Notifications"
          description="Operational alerts for this organization"
        >
          <p className="text-sm text-muted-foreground">
            No notifications yet. Alerts will appear here when jobs, time, or
            approvals need attention.
          </p>
        </ResponsiveDrawer>
        <ResponsiveDrawer
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="Quick create"
          description="Business records will be created from here once modules are live."
        >
          <div className="flex flex-col gap-2">
            {["Job", "Client", "Time entry"].map((label) => (
              <MutationButton
                key={label}
                variant="outline"
                className="h-11 w-full justify-start"
              >
                {label}
              </MutationButton>
            ))}
          </div>
        </ResponsiveDrawer>
        <ResponsiveDrawer
          open={helpOpen}
          onOpenChange={setHelpOpen}
          title="Help"
          description="FieldOps Cloud workspace"
        >
          <p className="text-sm text-muted-foreground">
            Use the command launcher to jump between views. Core operational
            modules are being connected to the API next.
          </p>
        </ResponsiveDrawer>
      </div>
      </SubscriptionProvider>
    </TooltipProvider>
  );
}
