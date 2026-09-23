import { apiRequest } from "./api";

export type PublicUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  platformRole: "USER" | "SUPER_ADMIN";
  status: "ACTIVE" | "INACTIVE";
  emailVerifiedAt: string | null;
};

export type OrganizationMembership = {
  membershipId: string;
  role: "OWNER" | "ADMIN" | "OPERATIONS_MANAGER" | "SUPERVISOR" | "TECHNICIAN";
  joinedAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    status: string;
    industry?: string | null;
    onboardingStep?: number;
    onboardingCompletedAt?: string | null;
  };
};

export type AuthPayload = {
  user: PublicUser;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
};

export function login(email: string, password: string) {
  return apiRequest<AuthPayload>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function signup(input: {
  fullName: string;
  email: string;
  password: string;
  organizationName: string;
}) {
  return apiRequest<AuthPayload>("/auth/signup", {
    method: "POST",
    body: input,
  });
}

export function logout() {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

export function getMe() {
  return apiRequest<{ user: PublicUser }>("/auth/me");
}

export function getMyOrganizations() {
  return apiRequest<OrganizationMembership[]>("/me/organizations");
}
