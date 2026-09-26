"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrganizationMembership, PublicUser } from "@/lib/auth";
import { logout } from "@/lib/auth";
import { canInviteMembers } from "@/lib/current-org";
import { pageTitleFromPath } from "@/lib/navigation";
import { Bell, Download, Plus, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { BrandMark } from "./brand-mark";
import { MutationButton } from "./mutation-control";
import { OrganizationSwitcher } from "./organization-switcher";
import { usePwaInstallOptional } from "./pwa-install-provider";
import { ThemeMenuItems } from "./theme-menu";
import { TrialChip } from "./subscription-banners";

export function TopBar({
  orgSlug,
  memberships,
  user,
  unreadCount = 0,
  onSearch,
  onNotifications,
  onQuickCreate,
  onInstallWorkspace,
}: {
  orgSlug: string;
  memberships: OrganizationMembership[];
  user: PublicUser;
  unreadCount?: number;
  onSearch: () => void;
  onNotifications: () => void;
  onQuickCreate: () => void;
  onInstallWorkspace?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const pwa = usePwaInstallOptional();
  const title = pageTitleFromPath(pathname);
  const initials = user.fullName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const currentMembership = memberships.find(
    (membership) => membership.organization.slug === orgSlug,
  );
  const orgRole = currentMembership?.role;
  const orgRoleLabel = orgRole
    ? orgRole
        .split("_")
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(" ")
    : null;
  const showManageMembers = canInviteMembers(currentMembership ?? null);

  return (
    <header
      className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-sm"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-12 items-center gap-2 px-3 md:h-12 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
          <BrandMark />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            className="hidden h-8 w-56 justify-start text-muted-foreground lg:inline-flex"
            onClick={onSearch}
          >
            <Search className="size-3.5" />
            Search workspace
            <kbd className="ml-auto rounded border border-border px-1 text-[10px]">
              ⌘K
            </kbd>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 lg:hidden md:size-8"
            aria-label="Search workspace"
            onClick={onSearch}
          >
            <Search />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative size-11 md:size-8"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
            onClick={onNotifications}
          >
            <Bell />
            {unreadCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-md bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </Button>
          <TrialChip />
          <MutationButton
            type="button"
            className="hidden h-8 md:inline-flex"
            onClick={onQuickCreate}
          >
            <Plus />
            New
          </MutationButton>
          <MutationButton
            type="button"
            size="icon"
            className="size-11 md:hidden"
            aria-label="Create"
            onClick={onQuickCreate}
          >
            <Plus />
          </MutationButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 rounded-md md:size-8"
                aria-label="Account menu"
              >
                <Avatar size="sm">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="truncate text-sm font-medium text-foreground">
                  {user.fullName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
                {orgRoleLabel ? (
                  <p className="mt-1 truncate text-xs font-medium text-foreground/80">
                    {orgRoleLabel}
                  </p>
                ) : null}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => router.push(`/app/${orgSlug}/settings`)}
              >
                Settings
              </DropdownMenuItem>
              {showManageMembers ? (
                <DropdownMenuItem
                  onClick={() =>
                    router.push(`/app/${orgSlug}/settings/members`)
                  }
                >
                  Manage members
                </DropdownMenuItem>
              ) : null}
              {!pwa?.isInstalled && onInstallWorkspace ? (
                <DropdownMenuItem onClick={onInstallWorkspace}>
                  <Download className="size-4" />
                  Install FieldKeel App
                </DropdownMenuItem>
              ) : null}
              <ThemeMenuItems />
              <DropdownMenuItem
                onClick={async () => {
                  await logout().catch(() => undefined);
                  router.replace("/login");
                }}
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="border-t border-border px-3 py-1.5 md:hidden">
        <OrganizationSwitcher currentSlug={orgSlug} memberships={memberships} />
      </div>
    </header>
  );
}
