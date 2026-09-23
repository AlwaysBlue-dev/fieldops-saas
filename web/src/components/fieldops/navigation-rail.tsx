"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  desktopPrimaryNav,
  desktopSecondaryNav,
  helpNavItem,
} from "@/lib/navigation";
import { cn } from "cn";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "./brand-mark";
import { OrganizationSwitcher } from "./organization-switcher";
import type { OrganizationMembership } from "@/lib/auth";

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

  return (
    <aside
      className={cn(
        "hidden h-dvh shrink-0 flex-col bg-nav text-nav-foreground md:flex",
        collapsed ? "w-14" : "w-[220px]",
      )}
    >
      <div className={cn("flex items-center gap-2 px-2.5 pt-3", collapsed && "justify-center px-1.5")}>
        <BrandMark inverted />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight">
              FieldOps
            </p>
            <p className="type-label text-nav-muted">Cloud</p>
          </div>
        ) : null}
      </div>

      <div className={cn("mt-3 px-1.5", collapsed && "px-1")}>
        {collapsed ? (
          <p className="sr-only">
            {memberships.find((item) => item.organization.slug === orgSlug)
              ?.organization.name}
          </p>
        ) : (
          <OrganizationSwitcher
            currentSlug={orgSlug}
            memberships={memberships}
            inverted
          />
        )}
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-6 overflow-y-auto px-1.5 pb-3" aria-label="Workspace">
        <NavGroup
          items={primary}
          pathname={pathname}
          collapsed={collapsed}
        />
        <NavGroup
          items={secondary}
          pathname={pathname}
          collapsed={collapsed}
          label="Workspace"
        />
        <NavButton item={helpNavItem} collapsed={collapsed} onClick={onHelp} />
      </nav>

      <div className="border-t border-white/8 p-1.5">
        <Button
          type="button"
          variant="ghost"
          className="h-9 w-full justify-center text-nav-muted hover:bg-nav-hover hover:text-white"
          onClick={onToggle}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {!collapsed ? <span className="ml-2 text-[13px]">Collapse</span> : null}
        </Button>
      </div>
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
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const link = (
            <Link
              href={item.href}
              className={cn(
                "relative flex h-9 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium",
                active
                  ? "bg-nav-hover text-white"
                  : "text-nav-muted hover:bg-nav-hover hover:text-white",
                collapsed && "justify-center px-0",
              )}
              aria-current={active ? "page" : undefined}
            >
              {active ? (
                <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
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
  item: (typeof helpNavItem);
  collapsed: boolean;
  onClick: () => void;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-[13px] font-medium text-nav-muted hover:bg-nav-hover hover:text-white",
        collapsed && "justify-center px-0",
      )}
    >
      <item.icon className="size-4 shrink-0" />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </button>
  );

  if (!collapsed) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
