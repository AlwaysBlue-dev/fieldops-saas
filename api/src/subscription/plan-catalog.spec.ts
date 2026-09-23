import { BillingInterval } from '../generated/prisma/client.js';
import { formatCentsUsd, formatPlanPrice, formatStorageBytes } from './plan-catalog.js';

describe('plan catalog formatting', () => {
  it('formats annual cents as a public price label', () => {
    expect(formatCentsUsd(49900)).toBe('$499');
    expect(
      formatPlanPrice({
        currency: 'USD',
        billingInterval: BillingInterval.ANNUAL,
        displayPrice: null,
        annualPriceCents: 49900,
        monthlyPriceCents: null,
        contactSales: false,
        publiclyVisible: true,
      }),
    ).toBe('$499/year');
  });

  it('uses Contact sales when the plan is not self-serve', () => {
    expect(
      formatPlanPrice({
        currency: 'USD',
        billingInterval: BillingInterval.CUSTOM,
        displayPrice: null,
        annualPriceCents: null,
        monthlyPriceCents: null,
        contactSales: true,
        publiclyVisible: true,
      }),
    ).toBe('Contact sales');
  });

  it('formats the Professional storage allotment', () => {
    expect(formatStorageBytes(21474836480n)).toBe('20 GB');
  });
});
