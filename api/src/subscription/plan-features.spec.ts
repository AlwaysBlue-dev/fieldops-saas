import {
  resolveMaxAiTasksPerMonth,
  resolvePlanFeatures,
  PLAN_FEATURES,
} from './plan-features.js';

describe('plan-features', () => {
  it('defaults most field features on without plan-code branching', () => {
    const flags = resolvePlanFeatures({});
    expect(flags.JOBS).toBe(true);
    expect(flags.TIMESHEETS).toBe(true);
    expect(flags.GPS).toBe(true);
    expect(flags.CLIENT_SIGNATURE).toBe(true);
    expect(flags.ADVANCED_REPORTS).toBe(false);
    expect(flags.CUSTOM_BRANDING).toBe(false);
    expect(flags.ADVANCED_BRANDING).toBe(false);
    expect(flags.AI_WORKFORCE).toBe(false);
  });

  it('resolves AI monthly allowances from features JSON', () => {
    expect(resolveMaxAiTasksPerMonth({})).toBe(0);
    expect(
      resolveMaxAiTasksPerMonth({
        [PLAN_FEATURES.AI_WORKFORCE]: true,
        maxAiTasksPerMonth: 100,
      }),
    ).toBe(100);
    expect(
      resolveMaxAiTasksPerMonth({
        [PLAN_FEATURES.AI_WORKFORCE]: true,
        maxAiTasksPerMonth: 500,
      }),
    ).toBe(500);
    expect(
      resolveMaxAiTasksPerMonth({
        [PLAN_FEATURES.AI_WORKFORCE]: false,
        maxAiTasksPerMonth: 100,
      }),
    ).toBe(0);
  });

  it('honors explicit feature keys and legacy gps/reports aliases', () => {
    const flags = resolvePlanFeatures({
      [PLAN_FEATURES.CUSTOM_BRANDING]: true,
      [PLAN_FEATURES.ADVANCED_BRANDING]: true,
      gps: false,
      reports: 'advanced',
    });
    expect(flags.GPS).toBe(false);
    expect(flags.ADVANCED_REPORTS).toBe(true);
    expect(flags.CUSTOM_BRANDING).toBe(true);
    expect(flags.ADVANCED_BRANDING).toBe(true);
  });
});
