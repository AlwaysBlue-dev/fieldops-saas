import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntitlementService } from '../../subscription/entitlement.service.js';
import { PLAN_FEATURES } from '../../subscription/plan-features.js';
import { isPlanLimitReachedException } from '../../subscription/plan-limit.exception.js';
import { UsageService } from '../../subscription/usage.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiUsageService } from './ai-usage.service.js';

/** Status literals for mocks (Prisma Client regenerate required for enum import). */
const STATUS = {
  PENDING: 'PENDING',
  INTERRUPTED: 'INTERRUPTED',
  SUCCEEDED: 'SUCCEEDED',
} as const;

function makeService(prisma: Partial<PrismaService>) {
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
    featuresForPlan: (plan: { features: Record<string, unknown> }) => ({
      [PLAN_FEATURES.AI_WORKFORCE]:
        plan.features?.[PLAN_FEATURES.AI_WORKFORCE] === true,
    }),
  } as unknown as EntitlementService;

  const usage = {
    recordAiLimitBlocked: async () => undefined,
    assertAiTaskAvailable: async () => undefined,
  } as unknown as UsageService;

  const config = {
    get: () => 300,
  } as unknown as ConfigService;

  return new AiUsageService(
    prisma as PrismaService,
    entitlements,
    usage,
    config,
  );
}

describe('AiUsageService.beginExecution', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const clientRequestId = '33333333-3333-3333-3333-333333333333';

  it('rejects when AI_WORKFORCE entitlement is disabled', async () => {
    const prisma = {} as PrismaService;
    const entitlements = {
      evaluate: async () => ({
        plan: {
          code: 'starter',
          name: 'Starter',
          features: { [PLAN_FEATURES.AI_WORKFORCE]: false },
        },
      }),
      featuresForPlan: () => ({ [PLAN_FEATURES.AI_WORKFORCE]: false }),
    } as unknown as EntitlementService;
    const service = new AiUsageService(
      prisma,
      entitlements,
      { recordAiLimitBlocked: async () => undefined } as unknown as UsageService,
      { get: () => 300 } as unknown as ConfigService,
    );

    await expect(
      service.beginExecution({
        organizationId: orgId,
        userId,
        clientRequestId,
        taskKey: 'chat.turn',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns IN_PROGRESS for a live non-expired PENDING reservation (idempotent)', async () => {
    const future = new Date(Date.now() + 60_000);
    const existing = {
      id: '44444444-4444-4444-4444-444444444444',
      organizationId: orgId,
      userId,
      clientRequestId,
      status: STATUS.PENDING,
      expiresAt: future,
      sessionId: null,
      metadata: null,
      resultPayload: null,
      provider: 'groq',
    };

    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $queryRaw: async () => [{ id: orgId }],
          aiUsageEvent: {
            findFirst: async () => existing,
          },
        }),
    } as unknown as PrismaService;

    const service = makeService(prisma);
    const outcome = await service.beginExecution({
      organizationId: orgId,
      userId,
      clientRequestId,
      taskKey: 'chat.turn',
    });

    expect(outcome.kind).toBe('IN_PROGRESS');
    expect(outcome).not.toHaveProperty('executionToken');
  });

  it('expires an expired PENDING reservation to INTERRUPTED without START', async () => {
    const past = new Date(Date.now() - 60_000);
    const existing = {
      id: '55555555-5555-5555-5555-555555555555',
      organizationId: orgId,
      userId,
      clientRequestId,
      status: STATUS.PENDING,
      expiresAt: past,
      sessionId: '66666666-6666-6666-6666-666666666666',
      metadata: { attempt: 1 },
      resultPayload: null,
      provider: 'groq',
    };
    const interrupted = {
      ...existing,
      status: STATUS.INTERRUPTED,
      expiresAt: null,
      executionToken: null,
    };

    const updateMany = async () => ({ count: 1 });
    const findManyMessages = async () => [];
    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $queryRaw: async () => [{ id: orgId }],
          aiUsageEvent: {
            findFirst: async ({ where }: { where: { id?: string } }) => {
              if (where?.id === existing.id) return interrupted;
              return existing;
            },
            updateMany,
          },
          aiChatMessage: {
            findMany: findManyMessages,
            update: async () => ({}),
          },
        }),
    } as unknown as PrismaService;

    const service = makeService(prisma);
    const outcome = await service.beginExecution({
      organizationId: orgId,
      userId,
      clientRequestId,
      taskKey: 'chat.turn',
      sessionId: existing.sessionId,
    });

    expect(outcome.kind).toBe('INTERRUPTED');
    expect(outcome).not.toHaveProperty('executionToken');
  });

  it('throws PLAN_LIMIT_REACHED after releasing the org lock (audit outside txn)', async () => {
    let auditCalls = 0;
    let insideTxn = false;
    let auditedWhileLocked = false;

    const usage = {
      recordAiLimitBlocked: async () => {
        auditCalls += 1;
        if (insideTxn) auditedWhileLocked = true;
      },
    } as unknown as UsageService;

    const entitlements = {
      evaluate: async () => ({
        plan: {
          code: 'professional',
          name: 'Professional',
          features: {
            [PLAN_FEATURES.AI_WORKFORCE]: true,
            maxAiTasksPerMonth: 1,
          },
        },
      }),
      featuresForPlan: () => ({ [PLAN_FEATURES.AI_WORKFORCE]: true }),
    } as unknown as EntitlementService;

    const prisma = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        insideTxn = true;
        try {
          return await fn({
            $queryRaw: async () => [{ id: orgId }],
            aiUsageEvent: {
              findFirst: async () => null,
              count: async () => 1,
              findMany: async () => [],
            },
          });
        } finally {
          insideTxn = false;
        }
      },
    } as unknown as PrismaService;

    const service = new AiUsageService(
      prisma,
      entitlements,
      usage,
      { get: () => 300 } as unknown as ConfigService,
    );

    let caught: unknown;
    try {
      await service.beginExecution({
        organizationId: orgId,
        userId,
        clientRequestId,
        taskKey: 'chat.turn',
      });
    } catch (error) {
      caught = error;
    }

    expect(isPlanLimitReachedException(caught)).toBe(true);
    expect(auditCalls).toBe(1);
    expect(auditedWhileLocked).toBe(false);
  });
});
