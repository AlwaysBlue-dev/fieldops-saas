"use client";

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
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { CheckIcon, ChevronsUpDown, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export type AsyncEntityOption = {
  value: string;
  label: string;
  description?: string | null;
};

export type AsyncEntityPage = {
  items: AsyncEntityOption[];
  page: number;
  pageSize: number;
  total: number;
};

type FetchArgs = {
  search: string;
  page: number;
  pageSize: number;
};

export function AsyncEntityCombobox({
  value,
  onValueChange,
  fetchPage,
  placeholder = "Search…",
  emptyLabel = "No matches.",
  disabled = false,
  pageSize = 20,
  className,
  selectedLabel,
  ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  fetchPage: (args: FetchArgs) => Promise<AsyncEntityPage>;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  pageSize?: number;
  className?: string;
  selectedLabel?: string;
  ariaLabel?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState<AsyncEntityOption[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await fetchPage({
          search: debounced,
          page: nextPage,
          pageSize,
        });
        if (id !== requestId.current) return;
        setPage(result.page);
        setTotal(result.total);
        setItems((prev) => {
          const merged = append ? [...prev, ...result.items] : result.items;
          const seen = new Set<string>();
          return merged.filter((item) => {
            if (seen.has(item.value)) return false;
            seen.add(item.value);
            return true;
          });
        });
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : "Could not load options.");
        if (!append) setItems([]);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [debounced, fetchPage, pageSize],
  );

  useEffect(() => {
    if (!open) return;
    void load(1, false);
  }, [open, debounced, load]);

  const selected =
    items.find((item) => item.value === value) ??
    (value
      ? { value, label: selectedLabel ?? value, description: null }
      : null);
  const hasMore = items.length < total;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          className={cn(
            "h-11 w-full justify-between px-2.5 font-normal md:h-8",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate text-left">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command shouldFilter={false} className="rounded-lg">
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList id={listId}>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Loading…
              </div>
            ) : error ? (
              <div className="px-3 py-6 text-center text-sm text-destructive">
                {error}
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyLabel}</CommandEmpty>
                <CommandGroup>
                  {items.map((item) => (
                    <CommandItem
                      key={item.value}
                      value={`${item.label} ${item.description ?? ""} ${item.value}`}
                      onSelect={() => {
                        onValueChange(item.value);
                        setOpen(false);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{item.label}</p>
                        {item.description ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                      <CheckIcon
                        className={cn(
                          "size-4",
                          value === item.value ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
                {hasMore ? (
                  <div className="border-t border-border p-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 w-full"
                      disabled={loadingMore}
                      onClick={() => void load(page + 1, true)}
                    >
                      {loadingMore ? "Loading…" : "Load more"}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
