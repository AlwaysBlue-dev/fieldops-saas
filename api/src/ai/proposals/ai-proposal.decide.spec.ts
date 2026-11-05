import { ForbiddenException } from '@nestjs/common';
import { OrganizationRole } from '../../generated/prisma/client.js';
import { AiProposalService } from './ai-proposal.service.js';

describe('AiProposalService.decide authorization', () => {
  it('rejects supervisor decide before touching the database', async () => {
    const prisma = {
      aiProposedAction: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    const executor = {
      assertTargetNotStale: vi.fn(),
      execute: vi.fn(),
    };
    const service = new AiProposalService(prisma as never, executor as never);

    await expect(
      service.decide(
        {
          organizationId: 'org',
          membershipId: 'm',
          role: OrganizationRole.SUPERVISOR,
          name: 'Org',
          slug: 'org',
          timezone: 'UTC',
          status: 'ACTIVE',
        },
        'user-1',
        'proposal-1',
        'APPROVE',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.aiProposedAction.findFirst).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
