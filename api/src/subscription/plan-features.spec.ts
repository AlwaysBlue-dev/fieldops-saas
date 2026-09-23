import { resolvePlanFeatures, PLAN_FEATURES } from './plan-features.js';

describe('plan-features', () => {
  it('defaults most field features on without plan-code branching', () => {
    const flags = resolvePlanFeatures({});
    expect(flags.JOBS).toBe(true);
    expect(flags.TIMESHEETS).toBe(true);
    expect(flags.GPS).toBe(true);
    expect(flags.CLIENT_SIGNATURE).toBe(true);
    expect(flags.ADVANCED_REPORTS).toBe(false);
    expect(flags.CUSTOM_BRANDING).toBe(false);
  });

  it('honors explicit feature keys and legacy gps/reports aliases', () => {
    const flags = resolvePlanFeatures({
      [PLAN_FEATURES.CUSTOM_BRANDING]: true,
      gps: false,
      reports: 'advanced',
    });
    expect(flags.GPS).toBe(false);
    expect(flags.ADVANCED_REPORTS).toBe(true);
    expect(flags.CUSTOM_BRANDING).toBe(true);
  });
});
