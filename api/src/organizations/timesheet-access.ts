import { OrganizationRole } from '../generated/prisma/client.js';
import { canManageCrew } from './crew-access.js';

export function canReviewTimesheets(role: OrganizationRole) {
  return role !== OrganizationRole.TECHNICIAN;
}

export function canApproveTimesheets(role: OrganizationRole) {
  return (
    canManageCrew(role) || role === OrganizationRole.SUPERVISOR
  );
}

export function canSelectTimesheetTechnician(role: OrganizationRole) {
  return canReviewTimesheets(role);
}
