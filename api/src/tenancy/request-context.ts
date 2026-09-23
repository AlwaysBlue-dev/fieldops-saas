import { OrganizationRole, PlatformRole, UserStatus } from '../generated/prisma/client.js';
import type { Request } from 'express';
import type { Entitlement } from '../subscription/entitlement.js';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  platformRole: PlatformRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
};

export type OrganizationContext = {
  organizationId: string;
  membershipId: string;
  role: OrganizationRole;
  name: string;
  slug: string;
  timezone: string;
  status: string;
};

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
  organization?: OrganizationContext;
  entitlement?: Entitlement;
};
