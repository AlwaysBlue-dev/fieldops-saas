import { ANNUAL_PERIOD_YEARS } from '../common/constants.js';
import { addUtcYears } from './clock.js';

export function defaultAnnualPeriod(start: Date) {
  return {
    currentPeriodStart: start,
    currentPeriodEnd: addUtcYears(start, ANNUAL_PERIOD_YEARS),
  };
}

export function resolveActivationPeriod(
  now: Date,
  startRaw?: string,
  endRaw?: string,
) {
  const currentPeriodStart = startRaw ? new Date(startRaw) : now;
  const currentPeriodEnd = endRaw
    ? new Date(endRaw)
    : defaultAnnualPeriod(currentPeriodStart).currentPeriodEnd;
  return { currentPeriodStart, currentPeriodEnd };
}

export function resolveRenewalPeriod(
  now: Date,
  existingEnd: Date | null,
  existingStart: Date | null,
  startRaw?: string,
  endRaw?: string,
) {
  if (startRaw || endRaw) {
    const currentPeriodStart = startRaw
      ? new Date(startRaw)
      : existingEnd && existingEnd.getTime() > now.getTime()
        ? (existingStart ?? now)
        : now;
    const currentPeriodEnd = endRaw
      ? new Date(endRaw)
      : addUtcYears(currentPeriodStart, ANNUAL_PERIOD_YEARS);
    return { currentPeriodStart, currentPeriodEnd };
  }

  // Early renewal: do not shorten the current paid year — start the next
  // period at the existing period end (e.g. pay Oct 1, renew Oct 15 → Oct 14+1y).
  if (existingEnd && existingEnd.getTime() > now.getTime()) {
    return {
      currentPeriodStart: existingEnd,
      currentPeriodEnd: addUtcYears(existingEnd, ANNUAL_PERIOD_YEARS),
    };
  }

  return defaultAnnualPeriod(now);
}
