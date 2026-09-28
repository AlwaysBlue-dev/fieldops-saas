import { apiRequest } from "./api";

export type DeletionRequest = {
  id: string;
  organizationId: string;
  workspaceName: string;
  requestedByUserId: string;
  requestedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reviewedAt: string | null;
  note: string | null;
};
export type DeletionStatus = {
  organization: { id: string; name: string; slug: string };
  everActivated: boolean;
  request: DeletionRequest | null;
};
export type PlatformDeletionRequest = DeletionRequest & {
  everActivated: boolean;
  effectiveStatus: string;
  requestedBy: { fullName: string; email: string };
  organization: { slug: string; deletedAt: string | null; subscription: { status: string; activatedAt: string | null } | null };
};
export function getWorkspaceDeletion(organizationId: string) {
  return apiRequest<DeletionStatus>(`/organizations/${organizationId}/deletion`);
}
export function deleteWorkspace(organizationId: string) {
  return apiRequest<{ deleted: boolean }>(`/organizations/${organizationId}/deletion`, { method: "DELETE" });
}
export function requestWorkspaceDeletion(organizationId: string) {
  return apiRequest<DeletionRequest>(`/organizations/${organizationId}/deletion/request`, { method: "POST" });
}
export function cancelWorkspaceDeletion(organizationId: string) {
  return apiRequest<DeletionRequest>(`/organizations/${organizationId}/deletion/cancel`, { method: "POST" });
}
export function listWorkspaceDeletions(page: number) {
  return apiRequest<{ items: PlatformDeletionRequest[]; total: number; page: number }>(`/platform/workspace-deletion-requests?page=${page}`);
}
export function reviewWorkspaceDeletion(id: string, decision: "APPROVED" | "REJECTED", note?: string) {
  return apiRequest<DeletionRequest>(`/platform/workspace-deletion-requests/${id}/review`, {
    method: "POST", body: { decision, note: note || undefined },
  });
}
