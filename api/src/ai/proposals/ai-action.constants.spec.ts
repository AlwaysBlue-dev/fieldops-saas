import { OrganizationRole } from '../../generated/prisma/client.js';
import {
  AI_ACTION_TYPES,
  canProposeOrExecute,
  isAiActionType,
  rolesForAction,
  summaryForAction,
} from './ai-action.constants.js';

describe('ai-action.constants', () => {
  it('recognizes allow-listed action types', () => {
    expect(isAiActionType('job.create')).toBe(true);
    expect(isAiActionType('job.delete')).toBe(false);
    expect(AI_ACTION_TYPES.length).toBeGreaterThan(10);
  });

  it('gates catalog actions away from supervisors', () => {
    expect(canProposeOrExecute(OrganizationRole.SUPERVISOR, 'job.assign')).toBe(
      true,
    );
    expect(
      canProposeOrExecute(OrganizationRole.SUPERVISOR, 'client.create'),
    ).toBe(false);
    expect(rolesForAction('team.create').has(OrganizationRole.ADMIN)).toBe(
      true,
    );
  });

  it('builds human summaries', () => {
    expect(summaryForAction('job.cancel', { jobId: 'abc' })).toContain('abc');
    expect(summaryForAction('client.create', { name: 'Acme' })).toContain(
      'Acme',
    );
  });
});
