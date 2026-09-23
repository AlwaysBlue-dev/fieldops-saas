export const CLOCK = Symbol('CLOCK');

export type Clock = {
  now(): Date;
};

export const systemClock: Clock = {
  now: () => new Date(),
};

export function addUtcDays(from: Date, days: number): Date {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function addUtcYears(from: Date, years: number): Date {
  const next = new Date(from.getTime());
  const day = next.getUTCDate();
  next.setUTCFullYear(next.getUTCFullYear() + years);
  if (next.getUTCDate() !== day) {
    next.setUTCDate(0);
  }
  return next;
}

export function daysRemaining(from: Date, until: Date | null | undefined): number {
  if (!until) {
    return 0;
  }
  const ms = until.getTime() - from.getTime();
  if (ms <= 0) {
    return 0;
  }
  return Math.ceil(ms / 86_400_000);
}

export function trialWindow(from: Date, trialDays: number, graceDays: number) {
  const trialStartedAt = new Date(from.getTime());
  const trialEndsAt = addUtcDays(from, trialDays);
  const graceEndsAt = addUtcDays(from, trialDays + graceDays);
  return { trialStartedAt, trialEndsAt, graceEndsAt };
}
