"use client";

import { Button } from "@/components/ui/button";
import {
  pageWindow,
  PAGE_SIZE_OPTIONS,
  rangeLabel,
  totalPages as calcTotalPages,
} from "@/lib/pagination";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className,
  showPageSize = true,
  mobileMode = "prev-next",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
  showPageSize?: boolean;
  mobileMode?: "prev-next" | "load-more";
}) {
  const pages = calcTotalPages(total, pageSize);
  const canPrev = page > 1;
  const canNext = page < pages;
  const windowPages = pageWindow(page, pages);

  if (total <= 0 && page <= 1) {
    return null;
  }

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">{rangeLabel(page, pageSize, total)}</p>

        <div className="flex flex-wrap items-center gap-2">
          {showPageSize && onPageSizeChange ? (
            <label className="hidden items-center gap-2 text-xs text-muted-foreground md:inline-flex">
              Rows
              <select
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                value={pageSize}
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
                aria-label="Rows per page"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="flex items-center gap-1 md:hidden">
            {mobileMode === "load-more" && canNext ? (
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => onPageChange(page + 1)}
              >
                Load more
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={!canPrev}
                  onClick={() => onPageChange(page - 1)}
                  aria-label="Previous page"
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={!canNext}
                  onClick={() => onPageChange(page + 1)}
                  aria-label="Next page"
                >
                  Next
                </Button>
              </>
            )}
          </div>

          <div className="hidden items-center gap-1 md:flex">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={!canPrev}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            {windowPages[0] > 1 ? (
              <>
                <PageButton page={1} current={page} onPageChange={onPageChange} />
                {windowPages[0] > 2 ? (
                  <span className="px-1 text-xs text-muted-foreground">…</span>
                ) : null}
              </>
            ) : null}
            {windowPages.map((item) => (
              <PageButton
                key={item}
                page={item}
                current={page}
                onPageChange={onPageChange}
              />
            ))}
            {windowPages[windowPages.length - 1] < pages ? (
              <>
                {windowPages[windowPages.length - 1] < pages - 1 ? (
                  <span className="px-1 text-xs text-muted-foreground">…</span>
                ) : null}
                <PageButton page={pages} current={page} onPageChange={onPageChange} />
              </>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={!canNext}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageButton({
  page,
  current,
  onPageChange,
}: {
  page: number;
  current: number;
  onPageChange: (page: number) => void;
}) {
  const active = page === current;
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="icon-sm"
      aria-current={active ? "page" : undefined}
      aria-label={`Page ${page}`}
      onClick={() => onPageChange(page)}
    >
      {page}
    </Button>
  );
}
