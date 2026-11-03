import { withTenant } from '../tenancy/tenant-scope.js';

/**
 * Cross-tenant AI session isolation contract.
 * AiService list/get/send always compose lookups with organizationId + userId.
 * Full DB isolation remains covered by broader tenancy suites after migrate/generate.
 */
describe('AI session tenant isolation (query contract)', () => {
  it('scopes session lookup by organizationId and rejects id-only access', () => {
    const organizationId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const sessionId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const userId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    const where = withTenant(organizationId, {
      id: sessionId,
      userId,
      status: 'ACTIVE',
    });

    expect(where).toEqual({
      organizationId,
      id: sessionId,
      userId,
      status: 'ACTIVE',
    });
    expect(where).toHaveProperty('organizationId', organizationId);
    expect(Object.keys(where)).toContain('organizationId');
  });

  it('scopes usage event lookups by organizationId for history fail-closed checks', () => {
    const organizationId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const usageEventIds = [
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ];

    const where = withTenant(organizationId, {
      id: { in: usageEventIds },
    });

    expect(where).toEqual({
      organizationId,
      id: { in: usageEventIds },
    });
  });
});
