import { apiRequest } from "./api";

export type WorkWeekDay = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export type OrganizationSettings = {
  organizationId: string;
  jobNumberPrefix: string;
  timezone: string;
  workingWeek: WorkWeekDay[];
  requireClientSignature: boolean;
  requireGps: boolean;
  gpsReviewDistanceMeters?: number;
  allowManualTime?: boolean;
  allowOvertimeRequests?: boolean;
  defaultDailyHoursLimit: number;
  defaultWeeklyHoursLimit?: number;
};

export type OrganizationDetail = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string | null;
  industry: string | null;
  timezone: string;
  status: string;
  onboardingStep: number;
  onboardingCompletedAt: string | null;
  settings?: OrganizationSettings;
};

export type OrgMember = {
  id: string;
  organizationId: string;
  role: "OWNER" | "ADMIN" | "OPERATIONS_MANAGER" | "SUPERVISOR" | "TECHNICIAN";
  status: "ACTIVE" | "INACTIVE";
  joinedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    status: string;
  };
};

export type OrgInvitation = {
  id: string;
  email: string;
  role: OrgMember["role"];
  teamId: string | null;
  team: { id: string; name: string; status: string } | null;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
};

export type InvitationPreview = {
  organizationName: string;
  role: OrgMember["role"];
  email: string;
  expiresAt: string;
  status: OrgInvitation["status"];
};

export function getOrganization(organizationId: string) {
  return apiRequest<OrganizationDetail>(`/organizations/${organizationId}`);
}

export function updateOrganization(
  organizationId: string,
  body: Partial<Pick<OrganizationDetail, "name" | "industry" | "phone" | "timezone">>,
) {
  return apiRequest<OrganizationDetail>(`/organizations/${organizationId}`, {
    method: "PATCH",
    body,
  });
}

export function advanceOnboarding(
  organizationId: string,
  body: {
    step?: number;
    complete?: boolean;
    profile?: Partial<Pick<OrganizationDetail, "name" | "industry" | "phone" | "timezone">>;
    settings?: Partial<
      Pick<
        OrganizationSettings,
        | "jobNumberPrefix"
        | "workingWeek"
        | "defaultDailyHoursLimit"
        | "requireClientSignature"
        | "requireGps"
      >
    >;
  },
) {
  return apiRequest<OrganizationDetail>(`/organizations/${organizationId}/onboarding`, {
    method: "POST",
    body,
  });
}

export function listMembers(organizationId: string) {
  return apiRequest<OrgMember[]>(`/organizations/${organizationId}/members`);
}

export function updateMember(
  organizationId: string,
  memberId: string,
  body: { role?: OrgMember["role"]; status?: OrgMember["status"] },
) {
  return apiRequest<OrgMember>(
    `/organizations/${organizationId}/members/${memberId}`,
    { method: "PATCH", body },
  );
}

export function listInvitations(organizationId: string) {
  return apiRequest<OrgInvitation[]>(`/organizations/${organizationId}/invitations`);
}

export function createInvitation(
  organizationId: string,
  body: { email: string; role: OrgMember["role"]; teamId?: string },
) {
  return apiRequest<OrgInvitation>(`/organizations/${organizationId}/invitations`, {
    method: "POST",
    body,
  });
}

export function resendInvitation(organizationId: string, invitationId: string) {
  return apiRequest<OrgInvitation>(
    `/organizations/${organizationId}/invitations/${invitationId}/resend`,
    { method: "POST" },
  );
}

export function revokeInvitation(organizationId: string, invitationId: string) {
  return apiRequest<OrgInvitation>(
    `/organizations/${organizationId}/invitations/${invitationId}/revoke`,
    { method: "POST" },
  );
}

export function previewInvitation(token: string) {
  return apiRequest<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`);
}

export function acceptInvitation(
  token: string,
  body: { fullName?: string; password?: string } = {},
) {
  return apiRequest<{
    user: { email: string };
    organization: { slug: string };
  }>(`/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    body,
  });
}

export function createClient(
  organizationId: string,
  body: {
    name: string;
    email?: string;
    phone?: string;
    site?: { name?: string; addressLine1?: string; city?: string };
  },
) {
  return apiRequest<{ id: string }>(`/organizations/${organizationId}/clients`, {
    method: "POST",
    body,
  });
}
