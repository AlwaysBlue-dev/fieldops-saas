import { OrganizationRole } from '../generated/prisma/client.js';

export const CREW_MANAGE_ROLES: OrganizationRole[] = [
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.OPERATIONS_MANAGER,
];

export function canManageCrew(role: OrganizationRole) {
  return CREW_MANAGE_ROLES.includes(role);
}

export type CrewViewer = 'manager' | 'supervisor' | 'self' | 'teammate';

export function isSensitiveCrewFieldVisible(viewer: CrewViewer) {
  return viewer === 'manager' || viewer === 'supervisor' || viewer === 'self';
}
