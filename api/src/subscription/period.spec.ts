import { addUtcDays, addUtcYears } from './clock.js';
import { resolveActivationPeriod, resolveRenewalPeriod } from './period.js';

describe('subscription periods', () => {
  const now = new Date('2026-09-23T12:00:00.000Z');

  it('defaults activation to a 1-year annual period', () => {
    const period = resolveActivationPeriod(now);
    expect(period.currentPeriodStart.toISOString()).toBe(now.toISOString());
    expect(period.currentPeriodEnd.toISOString()).toBe(addUtcYears(now, 1).toISOString());
  });

  it('extends an in-term renewal from the current period end without shortening', () => {
    const currentPeriodEnd = addUtcDays(now, 40);
    const currentPeriodStart = addUtcDays(now, -325);
    const period = resolveRenewalPeriod(now, currentPeriodEnd, currentPeriodStart);
    expect(period.currentPeriodStart.toISOString()).toBe(currentPeriodEnd.toISOString());
    expect(period.currentPeriodEnd.toISOString()).toBe(
      addUtcYears(currentPeriodEnd, 1).toISOString(),
    );
  });

  it('starts a lapsed renewal from now for 1 year', () => {
    const period = resolveRenewalPeriod(now, addUtcDays(now, -10), addUtcDays(now, -375));
    expect(period.currentPeriodStart.toISOString()).toBe(now.toISOString());
    expect(period.currentPeriodEnd.toISOString()).toBe(addUtcYears(now, 1).toISOString());
  });
});
