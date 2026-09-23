"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataGrid } from "./data-grid";
import { EmptyState } from "./empty-state";
import { FilterBar } from "./filter-bar";
import { MobileList } from "./mobile-list";
import { MutationButton } from "./mutation-control";
import { PageHeader } from "./page-header";
import { StickyMobileActionBar } from "./sticky-mobile-action-bar";

export function ModulePlaceholder({
  title,
  description,
  emptyTitle,
  emptyDescription,
  actionLabel = "Create",
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  actionLabel?: string;
}) {
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-3">
      <PageHeader
        title={title}
        description={description}
        hideTitleOnMobile
        actions={
          <MutationButton className="hidden h-8 md:inline-flex">
            {actionLabel}
          </MutationButton>
        }
      />
      <FilterBar>
        <Input
          placeholder={`Filter ${title.toLowerCase()}`}
          className="h-11 max-w-xs md:h-8"
          aria-label={`Filter ${title}`}
        />
        <Button variant="outline" disabled>
          Filters
        </Button>
      </FilterBar>
      <DataGrid
        columns={[
          { key: "name", header: "Name", cell: (row: { name: string; status: string }) => row.name },
          { key: "status", header: "Status", cell: (row: { name: string; status: string }) => row.status },
        ]}
        rows={[] as { name: string; status: string }[]}
        empty={
          <EmptyState title={emptyTitle} description={emptyDescription} />
        }
      />
      <MobileList empty={<EmptyState title={emptyTitle} description={emptyDescription} />}>
        {null}
      </MobileList>
      <StickyMobileActionBar>
        <MutationButton className="h-11 w-full md:hidden">
          {actionLabel}
        </MutationButton>
      </StickyMobileActionBar>
    </div>
  );
}
