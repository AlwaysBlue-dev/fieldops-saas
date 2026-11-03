import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntitlementService } from '../../subscription/entitlement.service.js';
import { PLAN_FEATURES } from '../../subscription/plan-features.js';
import { UsageService } from '../../subscription/usage.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiUsageService } from './ai-usage.service.js';

const STATUS = { PENDING: 'PENDING', SUCCEEDED: 'SUCCEEDED' } as const;

describe('AiUsageService clientRequestId session binding', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const clientRequestId = '33333333-3333-3333-3333-333333333333';
  const sessionA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const sessionB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  function serviceWithExisting(existing: Record<string, unknown>) {
    const entitlements = {
      evaluate: async () => ({
        plan: {
          code: 'professional',
          name: 'Professional',
          features: {
            [PLAN_FEATURES.AI_WORKFORCE]: true,
            maxAiTasksPerMonth: 100,
          },
        },
      }),
      featuresForPlan: () => ({ [PLAN_FEATURES.AI_WORKFORCE]: true }),
    } as unknown as EntitlementService;

    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $queryRaw: async () => [{ id: orgId }],
          aiUsageEvent: {
            findFirst: async () => existing,
          },
        }),
    } as unknown as PrismaService;

    return new AiUsageService(
      prisma,
      entitlements,
      { recordAiLimitBlocked: async () => undefined } as unknown as UsageService,
      { get: () => 300 } as unknown as ConfigService,
    );
  }

  it('rejects same clientRequestId against a different session', async () => {
    const service = serviceWithExisting({
      id: '44444444-4444-4444-4444-444444444444',
      organizationId: orgId,
      userId,
      clientRequestId,
      sessionId: sessionA,
      status: STATUS.SUCCEEDED,
      expiresAt: null,
      resultPayload: { assistantContent: 'secret from session A' },
      metadata: null,
      provider: 'groq',
    });

    await expect(
      service.beginExecution({
        organizationId: orgId,
        userId,
        clientRequestId,
        sessionId: sessionB,
        taskKey: 'chat.turn',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows idempotent retry for the original session', async () => {
    const future = new Date(Date.now() + 60_000);
    const service = serviceWithExisting({
      id: '55555555-5555-5555-5555-555555555555',
      organizationId: orgId,
      userId,
      clientRequestId,
      sessionId: sessionA,
      status: STATUS.PENDING,
      expiresAt: future,
      resultPayload: null,
      metadata: null,
      provider: 'groq',
    });

    const outcome = await service.beginExecution({
      organizationId: orgId,
      userId,
      clientRequestId,
      sessionId: sessionA,
      taskKey: 'chat.turn',
    });

    expect(outcome.kind).toBe('IN_PROGRESS');
  });
});
