import { apiRequest } from "./api";

export type StorageUsageLevel = "normal" | "warning" | "high" | "limit_reached";

export type StorageUsageBreakdown = {
  jobPhotos: { bytes: string; label: string };
  jobDocuments: { bytes: string; label: string };
  signatures: { bytes: string; label: string };
  otherAttachments: { bytes: string; label: string };
  branding: { bytes: string; label: string };
};

export type StorageUsage = {
  usedBytes: string;
  reservedBytes: string;
  remainingBytes: string;
  limitBytes: string;
  percentageUsed: number;
  level: StorageUsageLevel;
  usedLabel: string;
  reservedLabel: string;
  remainingLabel: string;
  limitLabel: string;
  planCode: string;
  planName: string;
  breakdown: StorageUsageBreakdown;
};

export type StorageFileItem = {
  id: string;
  category: string;
  originalName: string;
  sizeBytes: string;
  sizeLabel: string;
  relatedRecord: {
    type: string;
    id: string;
    label: string;
    hrefHint: string | null;
  };
  uploadedBy: { id: string; fullName: string; email: string } | null;
  uploadedAt: string;
  openRecordPath: string | null;
  canDeleteHere: boolean;
};

export type StorageFileList = {
  items: StorageFileItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function getStorageUsage(organizationId: string) {
  return apiRequest<StorageUsage>(
    `/organizations/${organizationId}/storage/usage`,
  );
}

export function listStorageFiles(
  organizationId: string,
  query: {
    page?: number;
    pageSize?: number;
    search?: string;
    category?: string;
    sort?: string;
    order?: string;
  } = {},
) {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  if (query.category) params.set("category", query.category);
  if (query.sort) params.set("sort", query.sort);
  if (query.order) params.set("order", query.order);
  const suffix = params.toString() ? `?${params}` : "";
  return apiRequest<StorageFileList>(
    `/organizations/${organizationId}/storage/files${suffix}`,
  );
}
