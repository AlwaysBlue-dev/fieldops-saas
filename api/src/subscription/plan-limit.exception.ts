import { ForbiddenException } from '@nestjs/common';

export type PlanLimitType = 'USERS' | 'STORAGE';

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
