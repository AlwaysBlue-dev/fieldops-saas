"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrganizationMembership } from "@/lib/auth";
import { ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";

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
              ? "h-8 w-full justify-between px-2 text-white hover:bg-white/8 hover:text-white"
              : "h-8 w-full justify-between px-2"
          }
        >
          <span className="truncate text-left text-[13px] font-medium">
            {current?.organization.name ?? "Select organization"}
          </span>
          <ChevronsUpDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {memberships.map((membership) => (
          <DropdownMenuItem
            key={membership.membershipId}
            onClick={() => {
              if (membership.organization.status !== "ACTIVE") return;
              router.push(`/app/${membership.organization.slug}/overview`);
            }}
          >
            <span className="truncate">{membership.organization.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
