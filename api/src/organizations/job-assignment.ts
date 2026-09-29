import { BadRequestException } from '@nestjs/common';
import { MembershipStatus, OrganizationRole, type Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

export const JOB_SUPERVISOR_ROLES: OrganizationRole[] = [
  OrganizationRole.OWNER, OrganizationRole.ADMIN,
  OrganizationRole.OPERATIONS_MANAGER, OrganizationRole.SUPERVISOR,
];

export function eligibleTechnicianWhere(organizationId: string, teamId?: string): Prisma.OrganizationMemberWhereInput {
  return {
    organizationId, status: MembershipStatus.ACTIVE, role: OrganizationRole.TECHNICIAN,
    ...(teamId ? { user: { teamMemberships: { some: { organizationId, teamId } } } } : {}),
  };
}

export async function requireJobAssignee(
  db: PrismaService | Prisma.TransactionClient, organizationId: string, userId: string,
  kind: 'technician' | 'supervisor',
) {
  const member = await db.organizationMember.findFirst({
    where: {
      ...(kind === 'technician' ? eligibleTechnicianWhere(organizationId)
        : { organizationId, status: MembershipStatus.ACTIVE, role: { in: JOB_SUPERVISOR_ROLES } }),
      userId,
    },
  });
  if (!member) throw new BadRequestException(`Select an active organization ${kind} with an eligible role`);
  return member;
}
