import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationRole } from '../../generated/prisma/client.js';
import { AiProposalService } from './ai-proposal.service.js';

/** String literals match Prisma enum (avoid relying on generated enum export in unit tests). */
const STATUS = {
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
  APPROVED: 'APPROVED',
  EXECUTED: 'EXECUTED',
} as const;

const orgA = {
  organizationId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  membershipId: 'm-a',
  role: OrganizationRole.ADMIN,
  name: 'Org A',
  slug: 'org-a',
  timezone: 'UTC',
  status: 'ACTIVE' as const,
};

const orgB = {
  ...orgA,
  organizationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  membershipId: 'm-b',
  name: 'Org B',
  slug: 'org-b',
};

function pendingRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-15T12:00:00.000Z');
  return {
    id: 'pppppppp-pppp-pppp-pppp-pppppppppppp',
    organizationId: orgA.organizationId,
    userId: 'uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu',
    sessionId: null,
    actionType: 'job.cancel',
    payload: { jobId: 'jjjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj', _summary: 'Cancel job' },
    targetEntityType: 'Job',
    targetEntityId: 'jjjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj',
    expectedTargetUpdatedAt: now,
    status: STATUS.PENDING,
    decidedByUserId: null,
    decidedAt: null,
    decisionComment: null,
    executedAt: null,
    executionResult: null,
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('AiProposalService tenancy and decide', () => {
  it('returns 404 when proposal id belongs to another organization', async () => {
    const prisma = {
      aiProposedAction: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new AiProposalService(prisma as never, {} as never);

    await expect(service.get(orgB, pendingRow().id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.aiProposedAction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: orgB.organizationId,
          id: pendingRow().id,
        }),
      }),
    );
  });

  it('hides other users proposals from non-deciders via getAuthorized', async () => {
    const row = pendingRow({ userId: 'other-user' });
    const prisma = {
      aiProposedAction: {
        findFirst: vi.fn().mockResolvedValue(row),
      },
    };
    const service = new AiProposalService(prisma as never, {} as never);
    const supervisorOrg = {
      ...orgA,
      role: OrganizationRole.SUPERVISOR,
    };

    await expect(
      service.getAuthorized(supervisorOrg, 'requester', row.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reject never calls the executor', async () => {
    const row = pendingRow();
    const prisma = {
      aiProposedAction: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce({
            ...row,
            status: STATUS.REJECTED,
            decidedByUserId: 'admin-1',
            decidedAt: new Date(),
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const executor = {
      assertTargetNotStale: vi.fn(),
      execute: vi.fn(),
    };
    const service = new AiProposalService(prisma as never, executor as never);

    const result = await service.decide(orgA, 'admin-1', row.id, 'REJECT');
    expect(result.status).toBe(STATUS.REJECTED);
    expect(executor.execute).not.toHaveBeenCalled();
    expect(executor.assertTargetNotStale).not.toHaveBeenCalled();
  });

  it('marks FAILED when target is stale and does not execute', async () => {
    const row = pendingRow();
    const prisma = {
      aiProposedAction: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce({
            ...row,
            status: STATUS.FAILED,
            decidedByUserId: 'admin-1',
            decidedAt: new Date(),
            executionResult: { ok: false, message: 'stale' },
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const executor = {
      assertTargetNotStale: vi.fn().mockRejectedValue(new Error('stale target')),
      execute: vi.fn(),
    };
    const service = new AiProposalService(prisma as never, executor as never);

    const result = await service.decide(orgA, 'admin-1', row.id, 'APPROVE');
    expect(result.status).toBe(STATUS.FAILED);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('concurrent second approve loses the CAS claim', async () => {
    const row = pendingRow();
    const prisma = {
      aiProposedAction: {
        findFirst: vi.fn().mockResolvedValue(row),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const executor = {
      assertTargetNotStale: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn(),
    };
    const service = new AiProposalService(prisma as never, executor as never);

    await expect(
      service.decide(orgA, 'admin-2', row.id, 'APPROVE'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('forbids supervisor from decide', async () => {
    const service = new AiProposalService(
      { aiProposedAction: { findFirst: vi.fn() } } as never,
      { execute: vi.fn() } as never,
    );
    await expect(
      service.decide(
        { ...orgA, role: OrganizationRole.SUPERVISOR },
        'sup-1',
        'proposal-1',
        'APPROVE',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
