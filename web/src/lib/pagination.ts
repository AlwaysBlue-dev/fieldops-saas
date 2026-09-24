export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages?: number;
};

export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function totalPages(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPageSize(value: number | undefined, fallback = DEFAULT_PAGE_SIZE) {
  if (!Number.isFinite(value) || !value) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(value)));
}

export function pageWindow(page: number, pages: number, radius = 1): number[] {
  const start = Math.max(1, page - radius);
  const end = Math.min(pages, page + radius);
  const result: number[] = [];
  for (let i = start; i <= end; i += 1) result.push(i);
  return result;
}

export function rangeLabel(page: number, pageSize: number, total: number): string {
  if (total <= 0) return "Showing 0 of 0";
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return `Showing ${from}–${to} of ${total}`;
}
