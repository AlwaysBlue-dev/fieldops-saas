"use client";

import { PaginationControls } from "@/components/fieldops/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMyOrganizations } from "@/lib/auth";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import {
  getStorageUsage,
  listStorageFiles,
  type StorageFileItem,
  type StorageUsage,
} from "@/lib/storage";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function levelCopy(level: StorageUsage["level"]) {
  switch (level) {
    case "limit_reached":
      return "Storage limit reached";
    case "high":
      return "High usage — free space or upgrade soon";
    case "warning":
      return "Approaching storage limit";
    default:
      return "Usage within plan allowance";
  }
}

function levelTone(level: StorageUsage["level"]) {
  switch (level) {
    case "limit_reached":
      return "bg-destructive";
    case "high":
      return "bg-amber-500";
    case "warning":
      return "bg-amber-400";
    default:
      return "bg-primary";
  }
}

export function StorageWorkspace({ orgSlug }: { orgSlug: string }) {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [files, setFiles] = useState<StorageFileItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyOrganizations()
      .then(async (memberships) => {
        const match = memberships.find(
          (item) => item.organization.slug === orgSlug,
        );
        if (!match) {
          if (!cancelled) setError("Organization not found.");
          return;
        }
        const role = match.role;
        if (
          role !== "OWNER" &&
          role !== "ADMIN" &&
          role !== "OPERATIONS_MANAGER"
        ) {
          if (!cancelled) {
            setError("Only owners, admins, and operations managers can view organization storage.");
          }
          return;
        }
        setOrganizationId(match.organization.id);
        const next = await getStorageUsage(match.organization.id);
        if (!cancelled) setUsage(next);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load storage usage.");
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  const loadFiles = useCallback(async () => {
    if (!organizationId) return;
    setLoadingFiles(true);
    try {
      const result = await listStorageFiles(organizationId, {
        page,
        pageSize,
        search: search.trim() || undefined,
        category: category || undefined,
        sort: "createdAt",
        order: "desc",
      });
      setFiles(result.items);
      setTotal(result.total);
    } catch {
      setError("Could not load stored files.");
    } finally {
      setLoadingFiles(false);
    }
  }, [organizationId, page, pageSize, search, category]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  if (error && !usage) {
    return <p className="text-sm text-muted-foreground">{error}</p>;
  }
  if (!usage) {
    return <p className="text-sm text-muted-foreground">Loading storage…</p>;
  }

  const barWidth = Math.min(100, Math.max(0, usage.percentageUsed));

  return (
    <div className="flex flex-col gap-6">
      <section
        className="rounded-lg border border-border bg-card px-4 py-4"
        aria-labelledby="storage-usage-heading"
      >
        <h2 id="storage-usage-heading" className="text-sm font-semibold">
          Storage used
        </h2>
        <p className="mt-1 text-2xl font-semibold tracking-tight">
          {usage.usedLabel}{" "}
          <span className="text-base font-normal text-muted-foreground">
            of {usage.limitLabel}
          </span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {usage.percentageUsed.toFixed(0)}% · {levelCopy(usage.level)}
        </p>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(barWidth)}
          aria-label="Storage usage"
        >
          <div
            className={`h-full rounded-full transition-[width] ${levelTone(usage.level)}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Remaining</dt>
            <dd className="font-medium">{usage.remainingLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="font-medium">{usage.planName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pending uploads</dt>
            <dd className="font-medium">{usage.reservedLabel}</dd>
          </div>
        </dl>
        {Number(usage.reservedBytes) > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Pending upload reservations count toward the limit until they
            complete or expire.
          </p>
        ) : null}
      </section>

      <section
        className="rounded-lg border border-border bg-card px-4 py-4"
        aria-labelledby="storage-breakdown-heading"
      >
        <h2 id="storage-breakdown-heading" className="text-sm font-semibold">
          Breakdown
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          {[
            ["Job photos", usage.breakdown.jobPhotos.label],
            ["Job documents", usage.breakdown.jobDocuments.label],
            ["Signatures", usage.breakdown.signatures.label],
            ["Other attachments", usage.breakdown.otherAttachments.label],
            ["Organization branding", usage.breakdown.branding.label],
          ].map(([label, value]) => (
            <li key={label} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium tabular-nums">{value}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Manage the organization logo under{" "}
          <Link
            href={`/app/${orgSlug}/settings`}
            className="text-primary underline-offset-2 hover:underline"
          >
            Settings → Branding
          </Link>
          .
        </p>
      </section>

      <section
        className="rounded-lg border border-border bg-card px-4 py-4"
        aria-labelledby="storage-files-heading"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="storage-files-heading" className="text-sm font-semibold">
              Stored files
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open the related job to delete evidence. Direct bulk delete is not
              offered here to protect job records.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search file or job…"
            className="h-11 sm:max-w-xs"
            aria-label="Search stored files"
          />
          <select
            className="h-11 rounded-lg border border-input bg-card px-2.5 text-sm"
            value={category}
            onChange={(e) => {
              setPage(1);
              setCategory(e.target.value);
            }}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            <option value="PHOTO">Job photos</option>
            <option value="DOCUMENT">Documents</option>
            <option value="SIGNATURE">Signatures</option>
            <option value="OTHER">Other</option>
            <option value="BRANDING">Branding</option>
          </select>
        </div>

        {loadingFiles ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading files…</p>
        ) : files.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No files match.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {file.originalName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {file.category} · {file.relatedRecord.label} ·{" "}
                    {file.sizeLabel}
                    {file.uploadedBy
                      ? ` · ${file.uploadedBy.fullName}`
                      : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(file.uploadedAt).toLocaleString()}
                  </p>
                </div>
                {file.openRecordPath ? (
                  <Button asChild variant="outline" className="h-9 shrink-0">
                    <Link href={`/app/${orgSlug}/${file.openRecordPath}`}>
                      Open record
                    </Link>
                  </Button>
                ) : file.category === "BRANDING" ? (
                  <Button asChild variant="outline" className="h-9 shrink-0">
                    <Link href={`/app/${orgSlug}/settings`}>Open branding</Link>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <PaginationControls
          className="mt-4"
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPage(1);
            setPageSize(size);
          }}
        />
      </section>
    </div>
  );
}
