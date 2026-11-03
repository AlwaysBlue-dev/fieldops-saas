import { ForbiddenException } from '@nestjs/common';

export type PlanLimitType = 'USERS' | 'STORAGE' | 'AI_TASKS';

export type PlanLimitReachedPayload = {
  statusCode: 403;
  error: 'PLAN_LIMIT_REACHED';
  code: 'PLAN_LIMIT_REACHED';
  message: string;
  limitType: PlanLimitType;
  used: number | string;
  limit: number | string;
  planCode: string;
  planName: string;
};

export function throwPlanLimitReached(input: {
  limitType: PlanLimitType;
  used: number | string;
  limit: number | string;
  planCode: string;
  planName: string;
  message: string;
}): never {
  const payload: PlanLimitReachedPayload = {
    statusCode: 403,
    error: 'PLAN_LIMIT_REACHED',
    code: 'PLAN_LIMIT_REACHED',
    message: input.message,
    limitType: input.limitType,
    used: input.used,
    limit: input.limit,
    planCode: input.planCode,
    planName: input.planName,
  };
  throw new ForbiddenException(payload);
}

/** True when `error` is the structured PLAN_LIMIT_REACHED ForbiddenException. */
export function isPlanLimitReachedException(
  error: unknown,
): error is ForbiddenException {
  if (!(error instanceof ForbiddenException)) return false;
  const body = error.getResponse();
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  return (
    record.error === 'PLAN_LIMIT_REACHED' || record.code === 'PLAN_LIMIT_REACHED'
  );
}
