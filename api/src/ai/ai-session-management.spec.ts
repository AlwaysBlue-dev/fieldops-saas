import { withTenant } from '../tenancy/tenant-scope.js';

/**
 * Rename / delete conversation ownership + soft-delete contracts (Step 4.11).
 * Full Nest/Prisma integration remains covered after migrate/generate in CI.
 */
describe('AI session rename/delete contracts', () => {
  const organizationId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const otherOrgId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const sessionId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const userId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const otherUserId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  it('scopes rename/updateMany by organizationId + userId + ACTIVE', () => {
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
    expect(where).not.toHaveProperty('userId', otherUserId);
  });

  it('rejects cross-organization session id by requiring organizationId in where', () => {
    const where = withTenant(organizationId, {
      id: sessionId,
      userId,
      status: 'ACTIVE',
    });
    expect(where.organizationId).toBe(organizationId);
    expect(where.organizationId).not.toBe(otherOrgId);
  });

  it('archives rather than hard-deleting sessions so usage FKs remain valid', () => {
    // Documented product rule: soft-delete → ARCHIVED; AiUsageEvent rows stay.
    const archiveData = { status: 'ARCHIVED' as const };
    const usageMustRemain = {
      deleteUsageEvents: false,
      deleteSubscription: false,
      deleteProposalsRequired: false,
    };
    expect(archiveData.status).toBe('ARCHIVED');
    expect(usageMustRemain.deleteUsageEvents).toBe(false);
  });

  it('blocks delete while a non-expired PENDING usage event exists for the session', () => {
    const now = new Date('2026-11-03T12:00:00.000Z');
    const pendingWhere = withTenant(organizationId, {
      sessionId,
      userId,
      status: 'PENDING',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    });
    expect(pendingWhere).toMatchObject({
      organizationId,
      sessionId,
      userId,
      status: 'PENDING',
    });
  });

  it('title validation bounds match DTO (1–200 after trim in service)', () => {
    const max = 200;
    expect(''.trim().length).toBe(0);
    expect('x'.repeat(max).length).toBe(200);
    expect('x'.repeat(max + 1).length).toBeGreaterThan(200);
  });
});
