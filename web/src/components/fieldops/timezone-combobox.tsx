"use client";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  listIanaTimeZones,
  timezoneOptionLabel,
} from "@/lib/iana-timezones";
import { cn } from "cn";
import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

export function TimezoneCombobox({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Search timezone…",
  className,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const zones = useMemo(() => listIanaTimeZones(), []);
  const selectedLabel = value ? timezoneOptionLabel(value) : "Select timezone";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
          disabled={disabled}
          className={cn(
            "h-11 w-full justify-between px-2.5 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate text-left">{selectedLabel}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
      >
        <Command>
          <CommandInput placeholder={placeholder} aria-label="Search timezones" />
          <CommandList id={id ? `${id}-listbox` : undefined}>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {zones.map((zone) => (
                <CommandItem
                  key={zone}
                  value={`${zone} ${timezoneOptionLabel(zone)}`}
                  keywords={[zone]}
                  onSelect={() => {
                    onChange(zone);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      value === zone ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{timezoneOptionLabel(zone)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
