"use client";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, SessionExpiredError } from "@/lib/api";
import {
  getMe,
  getMyOrganizations,
  logout,
  type OrganizationMembership,
  type PublicUser,
} from "@/lib/auth";
import { canManageCustomers, canManageSubscription } from "@/lib/current-org";
import { desktopPrimaryNav } from "@/lib/navigation";
import { unreadNotificationCount } from "@/lib/notifications";
import {
  rememberPreferredOrgSlug,
  workspaceHomePath,
} from "@/lib/workspace-home";
import { cn } from "cn";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CommandLauncher } from "./command-launcher";
import { ErrorState } from "./error-state";
import { InstallWorkspaceDialog } from "./install-workspace";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { NavigationRail } from "./navigation-rail";
import { NotificationCenter } from "./notification-center";
import { OfflineBanner } from "./offline-banner";
import { PwaInstallProvider, usePwaInstall } from "./pwa-install-provider";
import { QuickCreateSheet } from "./quick-create-sheet";
import { ResponsiveDrawer } from "./responsive-drawer";
import { SkeletonBlock } from "./skeleton-block";
import { SubscriptionBanners } from "./subscription-banners";
import {
  membershipOrganizationId,
  SubscriptionProvider,
} from "./subscription-provider";
import { TopBar } from "./top-bar";
import { WorkspaceManifestLink } from "./workspace-manifest-link";
import { Download } from "lucide-react";

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
  const [unreadCount, setUnreadCount] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  const loadSession = useCallback(async () => {
    setStatus("loading");
    try {
      const [{ user: nextUser }, orgs] = await Promise.all([
        getMe(),
        getMyOrganizations(),
      ]);
      if (!nextUser.emailVerifiedAt) {
        router.replace("/verify-email");
        return;
      }
      setUser(nextUser);
      setMemberships(orgs);
      if (orgs.length === 0) {
        router.replace("/create-workspace");
        return;
      }
      setStatus("ready");
    } catch (error) {
      if (
        error instanceof SessionExpiredError ||
        (error instanceof ApiError && error.status === 401)
      ) {
        router.replace("/login?reason=session-expired");
        return;
      }
      setStatus("error");
    }
  }, [router]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (status !== "ready" || memberships.length === 0) return;
    const current = memberships.find(
      (item) => item.organization.slug === orgSlug,
    );
    if (!current) {
      const fallback = memberships[0];
      rememberPreferredOrgSlug(fallback.organization.slug);
      router.replace(
        workspaceHomePath(fallback.organization.slug, fallback.role),
      );
      return;
    }
    rememberPreferredOrgSlug(current.organization.slug);
    const canOnboard = current.role === "OWNER" || current.role === "ADMIN";
    if (canOnboard && !current.organization.onboardingCompletedAt) {
      router.replace(`/onboarding?org=${current.organization.slug}`);
    }
  }, [status, memberships, orgSlug, router]);

  const previewOrgId = membershipOrganizationId(memberships, orgSlug);

  useEffect(() => {
    if (!previewOrgId) return;
    let cancelled = false;
    unreadNotificationCount(previewOrgId)
      .then((result) => {
        if (!cancelled) setUnreadCount(result.count);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [previewOrgId, notifyOpen]);

  const toggleRail = () => {
    const next = !collapsed;
    window.localStorage.setItem(RAIL_KEY, next ? "1" : "0");
    setCollapsedOverride(next);
  };

  if (status === "error") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
        <ErrorState onRetry={() => void loadSession()} />
      </div>
    );
  }

  if (status === "loading" || !user) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-68 bg-nav lg:block" />
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
  const canManageSubscriptionActions = canManageSubscription(
    currentMembership ?? null,
  );

  return (
    <TooltipProvider>
      <PwaInstallProvider>
      <SubscriptionProvider organizationId={organizationId}>
      {currentMembership ? (
        <WorkspaceManifestLink
          orgSlug={orgSlug}
          orgName={currentMembership.organization.name}
        />
      ) : null}
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
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <TopBar
            orgSlug={orgSlug}
            memberships={memberships}
            user={user}
            unreadCount={unreadCount}
            onSearch={() => setCommandOpen(true)}
            onNotifications={() => setNotifyOpen(true)}
            onQuickCreate={() => setCreateOpen(true)}
            onInstallWorkspace={() => setInstallOpen(true)}
          />
          <OfflineBanner />
          {organizationId ? (
            <SubscriptionBanners
              organizationId={organizationId}
              orgSlug={orgSlug}
              canManage={canManageSubscriptionActions}
            />
          ) : null}
          <main
            id="workspace-main"
            className={cn(
              "min-w-0 flex-1 overflow-x-hidden px-4 py-4 md:px-6 md:py-5",
              "pb-mobile-nav lg:pb-5",
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
          role={currentMembership?.role}
        />
        {organizationId ? (
          <QuickCreateSheet
            open={createOpen}
            onOpenChange={setCreateOpen}
            orgSlug={orgSlug}
            organizationId={organizationId}
            membership={currentMembership ?? null}
            userId={user.id}
          />
        ) : null}
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
            {desktopPrimaryNav(orgSlug, currentMembership?.role)
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
            {canManageSubscription(currentMembership ?? null) ? (
              <Button
                variant="ghost"
                className="h-11 justify-start"
                onClick={() => {
                  setMoreOpen(false);
                  router.push(`/app/${orgSlug}/settings/plan-usage`);
                }}
              >
                Plan & Usage
              </Button>
            ) : null}
            {canManageCustomers(currentMembership ?? null) ? (
              <Button
                variant="ghost"
                className="h-11 justify-start"
                onClick={() => {
                  setMoreOpen(false);
                  router.push(`/app/${orgSlug}/settings/storage`);
                }}
              >
                Storage
              </Button>
            ) : null}
            <MoreInstallWorkspaceButton
              onInstall={() => {
                setMoreOpen(false);
                setInstallOpen(true);
              }}
            />
            <Button
              variant="ghost"
              className="h-11 justify-start"
              onClick={() => {
                setMoreOpen(false);
                router.push(`/app/${orgSlug}/notifications`);
              }}
            >
              Notifications
            </Button>
            {user.platformRole === "SUPER_ADMIN" ? (
              <Button
                variant="ghost"
                className="h-11 justify-start"
                onClick={() => {
                  setMoreOpen(false);
                  router.push("/platform");
                }}
              >
                Platform
              </Button>
            ) : null}
            <Button
              variant="ghost"
              className="h-11 justify-start"
              onClick={() => {
                setMoreOpen(false);
                router.push("/docs");
              }}
            >
              Documentation
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
          {organizationId ? (
            <NotificationCenter
              organizationId={organizationId}
              orgSlug={orgSlug}
              timezone={currentMembership?.organization.timezone ?? "UTC"}
              open={notifyOpen}
              onUnreadChange={setUnreadCount}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Select an organization to view notifications.
            </p>
          )}
        </ResponsiveDrawer>
        <ResponsiveDrawer
          open={helpOpen}
          onOpenChange={setHelpOpen}
          title="Help"
          description="FieldKeel workspace"
        >
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Use Ctrl+K to search views. Create records from New / Quick create.
              Owners can manage branding under Settings.
            </p>
            <p>
              <Link
                href="/docs"
                className="font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => setHelpOpen(false)}
              >
                Open Documentation
              </Link>{" "}
              for product guides, storage limits, billing, and troubleshooting.
            </p>
          </div>
        </ResponsiveDrawer>
        {currentMembership ? (
          <InstallWorkspaceDialog
            open={installOpen}
            onOpenChange={setInstallOpen}
            orgName={currentMembership.organization.name}
          />
        ) : null}
      </div>
      </SubscriptionProvider>
      </PwaInstallProvider>
    </TooltipProvider>
  );
}

function MoreInstallWorkspaceButton({ onInstall }: { onInstall: () => void }) {
  const { isInstalled } = usePwaInstall();
  if (isInstalled) {
    return (
      <Button variant="ghost" className="h-11 justify-start" disabled>
        <Download />
        Installed
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      className="h-11 justify-start"
      onClick={onInstall}
    >
      <Download />
      Install Workspace
    </Button>
  );
}
