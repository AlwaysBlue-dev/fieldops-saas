"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { OrganizationMembership } from "@/lib/auth";
import {
  desktopPrimaryNav,
  desktopSecondaryNav,
  helpNavItem,
} from "@/lib/navigation";
import { cn } from "cn";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrgAvatar } from "./org-avatar";
import { OrganizationSwitcher } from "./organization-switcher";

export function NavigationRail({
  orgSlug,
  memberships,
  collapsed,
  onToggle,
  onHelp,
}: {
  orgSlug: string;
  memberships: OrganizationMembership[];
  collapsed: boolean;
  onToggle: () => void;
  onHelp: () => void;
}) {
  const pathname = usePathname();
  const primary = desktopPrimaryNav(orgSlug);
  const secondary = desktopSecondaryNav(orgSlug);
  const current = memberships.find((item) => item.organization.slug === orgSlug);
  const orgName = current?.organization.name ?? "Organization";
  const orgId = current?.organization.id ?? "";
  const hasLogo = Boolean(current?.organization.hasLogo);

  return (
    <aside
      className={cn(
        "hidden h-dvh shrink-0 flex-col bg-nav text-nav-foreground lg:flex",
        collapsed ? "w-19" : "w-68",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-start gap-2 border-b border-white/8 px-2.5 py-3",
          collapsed && "flex-col items-center px-1.5",
        )}
      >
        <div className={cn("flex min-w-0 flex-1 items-center gap-2", collapsed && "flex-col")}>
          {orgId ? (
            <OrgAvatar
              organizationId={orgId}
              name={orgName}
              hasLogo={hasLogo}
              inverted
              className="size-9"
            />
          ) : null}
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold tracking-tight text-white">
                {orgName}
              </p>
              <p className="type-label text-nav-muted">FieldOps Cloud</p>
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-nav-muted hover:bg-nav-hover hover:text-white"
          onClick={onToggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>

      {!collapsed ? (
        <div className="shrink-0 px-2 pt-3">
          <OrganizationSwitcher
            currentSlug={orgSlug}
            memberships={memberships}
            inverted
          />
        </div>
      ) : (
        <p className="sr-only">{orgName}</p>
      )}

      <nav
        className="mt-3 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-1.5 pb-3 scrollbar-thin"
        aria-label="Workspace"
      >
        <NavGroup items={primary} pathname={pathname} collapsed={collapsed} />
        <div className="mt-auto flex flex-col gap-1">
          <NavGroup
            items={secondary}
            pathname={pathname}
            collapsed={collapsed}
            label="Workspace"
          />
          <NavButton item={helpNavItem} collapsed={collapsed} onClick={onHelp} />
        </div>
      </nav>
    </aside>
  );
}

function NavGroup({
  items,
  pathname,
  collapsed,
  label,
}: {
  items: ReturnType<typeof desktopPrimaryNav>;
  pathname: string;
  collapsed: boolean;
  label?: string;
}) {
  return (
    <div>
      {label && !collapsed ? (
        <p className="mb-1 px-2 type-label text-nav-muted">{label}</p>
      ) : null}
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const link = (
            <Link
              href={item.href}
              className={cn(
                "relative flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium",
                active
                  ? "bg-nav-hover text-white"
                  : "text-nav-muted hover:bg-nav-hover hover:text-white",
                collapsed && "justify-center px-0",
              )}
              aria-current={active ? "page" : undefined}
            >
              {active ? (
                <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />
              ) : null}
              <item.icon className="size-4 shrink-0" />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );

          return (
            <li key={item.href}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NavButton({
  item,
  collapsed,
  onClick,
}: {
  item: typeof helpNavItem;
  collapsed: boolean;
  onClick: () => void;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-nav-muted hover:bg-nav-hover hover:text-white",
        collapsed && "justify-center px-0",
      )}
    >
      <item.icon className="size-4 shrink-0" />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </button>
  );

  if (!collapsed) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
