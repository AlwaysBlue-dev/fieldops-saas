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
  /** True until this account consumes its one lifetime Professional free trial. */
  trialEligible: boolean;
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
    hasLogo?: boolean;
  };
};

export type AuthPayload = {
  user: PublicUser;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
  emailVerificationRequired?: boolean;
  message?: string;
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
  acceptTerms: boolean;
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

export function verifyEmail(token: string) {
  return apiRequest<{
    verified: boolean;
    hasWorkspace: boolean;
    user: PublicUser;
  }>("/auth/verify-email", {
    method: "POST",
    body: { token },
  });
}

export function resendVerification() {
  return apiRequest<{ message: string; alreadyVerified: boolean }>(
    "/auth/resend-verification",
    { method: "POST" },
  );
}

export function createWorkspace(input: {
  organizationName: string;
  timezone?: string;
  planCode?: "starter" | "professional" | "business";
}) {
  return apiRequest<{
    user: PublicUser;
    organization: { id: string; name: string; slug: string };
    trialStarted: boolean;
    planCode: string;
  }>("/auth/create-workspace", {
    method: "POST",
    body: input,
  });
}

export function forgotPassword(email: string) {
  return apiRequest<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export function resetPassword(token: string, password: string) {
  return apiRequest<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: { token, password },
  });
}
