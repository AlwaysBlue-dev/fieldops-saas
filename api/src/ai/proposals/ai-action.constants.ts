import { OrganizationRole } from '../../generated/prisma/client.js';
import { CREW_MANAGE_ROLES } from '../../organizations/crew-access.js';

/** Allow-listed AI mutation action types (v1). */
export const AI_ACTION_TYPES = [
  'job.create',
  'job.update',
  'job.schedule',
  'job.assign',
  'job.dispatch',
  'job.cancel',
  'client.create',
  'client.update',
  'client.deactivate',
  'site.create',
  'site.update',
  'site.deactivate',
  'team.create',
  'team.update',
  'team.deactivate',
] as const;

export type AiActionType = (typeof AI_ACTION_TYPES)[number];

export function isAiActionType(value: string): value is AiActionType {
  return (AI_ACTION_TYPES as readonly string[]).includes(value);
}

const EDITOR_ROLES: ReadonlySet<OrganizationRole> = new Set([
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.OPERATIONS_MANAGER,
  OrganizationRole.SUPERVISOR,
]);

const CATALOG_ROLES: ReadonlySet<OrganizationRole> = new Set([
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.OPERATIONS_MANAGER,
]);

const CREW_ROLES: ReadonlySet<OrganizationRole> = new Set(CREW_MANAGE_ROLES);

/** Roles that may create a proposal for an action (same as REST writers). */
export function rolesForAction(actionType: AiActionType): ReadonlySet<OrganizationRole> {
  if (actionType.startsWith('job.')) return EDITOR_ROLES;
  if (actionType.startsWith('client.') || actionType.startsWith('site.')) {
    return CATALOG_ROLES;
  }
  return CREW_ROLES;
}

export function canProposeOrExecute(
  role: OrganizationRole,
  actionType: AiActionType,
): boolean {
  return rolesForAction(actionType).has(role);
}

/** Who may Approve/Reject AI proposals (org-wide review). */
export const AI_PROPOSAL_DECIDER_ROLES: ReadonlySet<OrganizationRole> = new Set([
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
  OrganizationRole.OPERATIONS_MANAGER,
]);

export const AI_PROPOSAL_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function entityTypeForAction(actionType: AiActionType): string {
  if (actionType.startsWith('job.')) return 'Job';
  if (actionType.startsWith('client.')) return 'Client';
  if (actionType.startsWith('site.')) return 'Site';
  return 'Team';
}

export function summaryForAction(
  actionType: AiActionType,
  payload: Record<string, unknown>,
): string {
  switch (actionType) {
    case 'job.create':
      return `Create job “${String(payload.title ?? 'Untitled')}”`;
    case 'job.update':
      return `Update job ${String(payload.jobId ?? '')}`.trim();
    case 'job.schedule':
      return `Reschedule job ${String(payload.jobId ?? '')}`.trim();
    case 'job.assign':
      return `Assign crew on job ${String(payload.jobId ?? '')}`.trim();
    case 'job.dispatch':
      return `Dispatch job ${String(payload.jobId ?? '')}`.trim();
    case 'job.cancel':
      return `Cancel job ${String(payload.jobId ?? '')}`.trim();
    case 'client.create':
      return `Create client “${String(payload.name ?? '')}”`;
    case 'client.update':
      return `Update client ${String(payload.clientId ?? '')}`.trim();
    case 'client.deactivate':
      return `Deactivate client ${String(payload.clientId ?? '')}`.trim();
    case 'site.create':
      return `Create site “${String(payload.name ?? '')}”`;
    case 'site.update':
      return `Update site ${String(payload.siteId ?? '')}`.trim();
    case 'site.deactivate':
      return `Deactivate site ${String(payload.siteId ?? '')}`.trim();
    case 'team.create':
      return `Create team “${String(payload.name ?? '')}”`;
    case 'team.update':
      return `Update team ${String(payload.teamId ?? '')}`.trim();
    case 'team.deactivate':
      return `Deactivate team ${String(payload.teamId ?? '')}`.trim();
    default:
      return actionType;
  }
}
