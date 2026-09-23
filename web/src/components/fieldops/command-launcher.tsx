"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { desktopPrimaryNav, desktopSecondaryNav } from "@/lib/navigation";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function CommandLauncher({
  orgSlug,
  open,
  onOpenChange,
  onHelp,
}: {
  orgSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHelp?: () => void;
}) {
  const router = useRouter();
  const destinations = [
    ...desktopPrimaryNav(orgSlug),
    ...desktopSecondaryNav(orgSlug),
  ];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command launcher"
      description="Jump to a workspace view"
    >
      <CommandPalette
        destinations={destinations}
        onHelp={onHelp}
        onOpenChange={onOpenChange}
        onSelect={(href) => {
          onOpenChange(false);
          router.push(href);
        }}
      />
    </CommandDialog>
  );
}

function CommandPalette({
  destinations,
  onSelect,
  onHelp,
  onOpenChange,
}: {
  destinations: { href: string; label: string }[];
  onSelect: (href: string) => void;
  onHelp?: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      <CommandInput placeholder="Search workspace…" />
      <CommandList>
        <CommandEmpty>No matching views.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {destinations.map((item) => (
            <CommandItem
              key={item.href}
              value={item.label}
              onSelect={() => onSelect(item.href)}
            >
              {item.label}
            </CommandItem>
          ))}
          {onHelp ? (
            <CommandItem
              value="Help"
              onSelect={() => {
                onOpenChange(false);
                onHelp();
              }}
            >
              Help
            </CommandItem>
          ) : null}
        </CommandGroup>
      </CommandList>
    </>
  );
}
