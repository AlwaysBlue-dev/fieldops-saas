import { apiRequest } from "./api";

export type TeamStatus = "ACTIVE" | "INACTIVE";
export type CertificationStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED";
export type CrewViewer = "manager" | "supervisor" | "self" | "teammate";

export type TeamMemberSummary = {
  userId: string;
  fullName: string;
  role: string | null;
  membershipStatus?: string | null;
  joinedAt?: string;
  skills?: Array<{ id: string; skillId: string; name: string }>;
};

export type TeamSummary = {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  description: string | null;
  status: TeamStatus;
  supervisor: { userId: string; fullName: string } | null;
  memberCount: number;
  members: TeamMemberSummary[];
  skillSummary: string[];
  createdAt: string;
  updatedAt: string;
};

export type TeamDetail = TeamSummary & {
  skills: Array<{
    name: string;
    holders: Array<{ userId: string; fullName: string }>;
  }>;
  certifications: Array<
    CertificationRecord & { holderName: string }
  >;
};

export type CertificationRecord = {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  certificateNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  documentRef: string | null;
  status: CertificationStatus;
  createdAt: string;
  updatedAt: string;
};

export type SkillRecord = {
  id: string;
  organizationId: string;
  name: string;
};

export type TechnicianSummary = {
  userId: string;
  fullName: string;
  role: string;
  status: string;
  email: string | null;
  phone: string | null;
  teams: Array<{ id: string; name: string; status: TeamStatus }>;
  skills: string[];
  viewer: CrewViewer;
};

export type TechnicianProfile = {
  userId: string;
  fullName: string;
  role: string;
  membershipStatus: string;
  accountStatus: string;
  email: string | null;
  phone: string | null;
  teams: Array<{
    id: string;
    name: string;
    status: TeamStatus;
    isSupervisor: boolean;
  }>;
  skills: Array<{ id: string; skillId: string; name: string }>;
  certifications: CertificationRecord[];
  viewer: CrewViewer;
};

export type TeamWriteBody = {
  name: string;
  code?: string;
  description?: string;
  supervisorUserId?: string;
};

export function listTeams(
  organizationId: string,
  query: { search?: string; status?: TeamStatus | ""; pageSize?: number } = {},
) {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  params.set("sort", "name");
  const suffix = params.toString();
  return apiRequest<{ items: TeamSummary[]; total: number }>(
    `/organizations/${organizationId}/teams${suffix ? `?${suffix}` : ""}`,
  );
}

export function getTeam(organizationId: string, teamId: string) {
  return apiRequest<TeamDetail>(`/organizations/${organizationId}/teams/${teamId}`);
}

export function createTeam(organizationId: string, body: TeamWriteBody) {
  return apiRequest<TeamSummary>(`/organizations/${organizationId}/teams`, {
    method: "POST",
    body,
  });
}

export function updateTeam(
  organizationId: string,
  teamId: string,
  body: Partial<TeamWriteBody> & { status?: TeamStatus },
) {
  return apiRequest<TeamSummary>(
    `/organizations/${organizationId}/teams/${teamId}`,
    { method: "PATCH", body },
  );
}

export function deactivateTeam(organizationId: string, teamId: string) {
  return apiRequest<TeamSummary>(
    `/organizations/${organizationId}/teams/${teamId}/deactivate`,
    { method: "POST" },
  );
}

export function assignSupervisor(
  organizationId: string,
  teamId: string,
  supervisorUserId: string | null,
) {
  return apiRequest<TeamSummary>(
    `/organizations/${organizationId}/teams/${teamId}/supervisor`,
    { method: "POST", body: { supervisorUserId } },
  );
}

export function addTeamMember(
  organizationId: string,
  teamId: string,
  userId: string,
) {
  return apiRequest<TeamDetail>(
    `/organizations/${organizationId}/teams/${teamId}/members`,
    { method: "POST", body: { userId } },
  );
}

export function removeTeamMember(
  organizationId: string,
  teamId: string,
  userId: string,
) {
  return apiRequest<TeamDetail>(
    `/organizations/${organizationId}/teams/${teamId}/members/${userId}/remove`,
    { method: "POST" },
  );
}

export function listTechnicians(
  organizationId: string,
  query: { search?: string; pageSize?: number } = {},
) {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const suffix = params.toString();
  return apiRequest<{ items: TechnicianSummary[]; total: number }>(
    `/organizations/${organizationId}/technicians${suffix ? `?${suffix}` : ""}`,
  );
}

export function getTechnician(organizationId: string, userId: string) {
  return apiRequest<TechnicianProfile>(
    `/organizations/${organizationId}/technicians/${userId}`,
  );
}

export function listSkills(organizationId: string) {
  return apiRequest<SkillRecord[]>(`/organizations/${organizationId}/skills`);
}

export function createSkill(organizationId: string, name: string) {
  return apiRequest<SkillRecord>(`/organizations/${organizationId}/skills`, {
    method: "POST",
    body: { name },
  });
}

export function assignSkill(
  organizationId: string,
  userId: string,
  skillId: string,
) {
  return apiRequest<{ id: string; skillId: string; name: string }>(
    `/organizations/${organizationId}/technicians/${userId}/skills`,
    { method: "POST", body: { skillId } },
  );
}

export function addCertification(
  organizationId: string,
  userId: string,
  body: {
    name: string;
    certificateNumber?: string;
    issuedAt?: string;
    expiresAt?: string;
    documentRef?: string;
  },
) {
  return apiRequest<CertificationRecord>(
    `/organizations/${organizationId}/technicians/${userId}/certifications`,
    { method: "POST", body },
  );
}

export function updateCertification(
  organizationId: string,
  userId: string,
  certificationId: string,
  body: {
    name?: string;
    certificateNumber?: string;
    issuedAt?: string;
    expiresAt?: string;
    documentRef?: string;
  },
) {
  return apiRequest<CertificationRecord>(
    `/organizations/${organizationId}/technicians/${userId}/certifications/${certificationId}`,
    { method: "PATCH", body },
  );
}

export function certificationTone(status: CertificationStatus) {
  if (status === "EXPIRED") return "crimson" as const;
  if (status === "EXPIRING_SOON") return "amber" as const;
  return "emerald" as const;
}

export function certificationLabel(status: CertificationStatus) {
  if (status === "EXPIRED") return "Expired";
  if (status === "EXPIRING_SOON") return "Expiring soon";
  return "Valid";
}
