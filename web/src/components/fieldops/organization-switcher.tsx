"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrganizationMembership } from "@/lib/auth";
import { ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { OrgAvatar } from "./org-avatar";

export function OrganizationSwitcher({
  currentSlug,
  memberships,
  inverted = false,
}: {
  currentSlug: string;
  memberships: OrganizationMembership[];
  inverted?: boolean;
}) {
  const router = useRouter();
  const current = memberships.find((item) => item.organization.slug === currentSlug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={
            inverted
              ? "h-9 w-full justify-between gap-2 px-2 text-white hover:bg-white/8 hover:text-white"
              : "h-9 w-full justify-between gap-2 px-2"
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            {current ? (
              <OrgAvatar
                organizationId={current.organization.id}
                name={current.organization.name}
                hasLogo={current.organization.hasLogo}
                inverted={inverted}
                className="size-6"
              />
            ) : null}
            <span className="truncate text-left text-[13px] font-medium">
              {current?.organization.name ?? "Select organization"}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {memberships.map((membership) => {
          const inactive = membership.organization.status !== "ACTIVE";
          return (
            <DropdownMenuItem
              key={membership.membershipId}
              disabled={inactive}
              onClick={() => {
                if (inactive) return;
                router.push(`/app/${membership.organization.slug}/overview`);
              }}
            >
              <OrgAvatar
                organizationId={membership.organization.id}
                name={membership.organization.name}
                hasLogo={membership.organization.hasLogo}
                className="size-6"
              />
              <span className="min-w-0 truncate">
                {membership.organization.name}
                {inactive ? " (inactive)" : ""}
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/create-workspace")}>
          Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
