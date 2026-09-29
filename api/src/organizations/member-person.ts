import type { OrganizationRole, Prisma } from '../generated/prisma/client.js';

/** Display metadata only: never infer a role from a job assignment or a team. */
export function organizationPersonSelect(organizationId: string) {
  return {
    id: true,
    fullName: true,
    memberships: {
      where: { organizationId },
      select: { organizationId: true, role: true },
    },
  } satisfies Prisma.UserSelect;
}

export type OrganizationPerson = {
  id: string;
  fullName: string;
  memberships?: Array<{ organizationId: string; role: OrganizationRole }>;
};

export function serializeOrganizationPerson(user: OrganizationPerson, organizationId: string) {
  return {
    userId: user.id,
    fullName: user.fullName,
    role: user.memberships?.find((member) => member.organizationId === organizationId)?.role ?? null,
  };
}
