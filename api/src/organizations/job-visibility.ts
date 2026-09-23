import {
  JobStatus,
  OrganizationRole,
  Prisma,
} from '../generated/prisma/client.js';
import { canManageCrew } from './crew-access.js';
import type { OrganizationContext } from '../tenancy/request-context.js';

export const TERMINAL_JOB_STATUSES: JobStatus[] = [
  JobStatus.COMPLETED,
  JobStatus.CANCELLED,
];

export function canManageSchedule(role: OrganizationRole) {
  return canManageCrew(role);
}

export function canEditSchedule(role: OrganizationRole) {
  return canManageSchedule(role) || role === OrganizationRole.SUPERVISOR;
}

export function jobVisibilityWhere(
  ctx: OrganizationContext,
  actorUserId: string,
  visibleTeamIds: string[],
): Prisma.JobWhereInput {
  const base: Prisma.JobWhereInput = { organizationId: ctx.organizationId };
  if (canManageSchedule(ctx.role)) {
    return base;
  }
  if (ctx.role === OrganizationRole.SUPERVISOR) {
    return {
      ...base,
      OR: [
        { supervisorUserId: actorUserId },
        { assignments: { some: { userId: actorUserId } } },
        ...(visibleTeamIds.length
          ? [
              { teamId: { in: visibleTeamIds } },
              {
                assignments: {
                  some: {
                    user: {
                      teamMemberships: {
                        some: { teamId: { in: visibleTeamIds } },
                      },
                    },
                  },
                },
              },
            ]
          : []),
      ],
    };
  }
  return {
    ...base,
    assignments: { some: { userId: actorUserId } },
  };
}

