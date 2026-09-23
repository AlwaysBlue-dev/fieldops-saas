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
import { pageTitleFromPath } from "@/lib/navigation";
import { Bell, Plus, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { BrandMark } from "./brand-mark";
import { MutationButton } from "./mutation-control";
import { OrganizationSwitcher } from "./organization-switcher";
import { TrialChip } from "./subscription-banners";

export function TopBar({
  orgSlug,
  memberships,
  user,
  onSearch,
  onNotifications,
  onQuickCreate,
}: {
  orgSlug: string;
  memberships: OrganizationMembership[];
  user: PublicUser;
  onSearch: () => void;
  onNotifications: () => void;
  onQuickCreate: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const title = pageTitleFromPath(pathname);
  const initials = user.fullName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
            className="lg:hidden"
            aria-label="Search workspace"
            onClick={onSearch}
          >
            <Search />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Notifications"
            onClick={onNotifications}
          >
            <Bell />
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
            className="md:hidden"
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
                className="rounded-full"
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
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => router.push(`/app/${orgSlug}/settings`)}
              >
                Settings
              </DropdownMenuItem>
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
