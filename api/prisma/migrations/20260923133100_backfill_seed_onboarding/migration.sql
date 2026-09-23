UPDATE "Organization"
SET "onboardingStep" = 5,
    "onboardingCompletedAt" = NOW()
WHERE "onboardingCompletedAt" IS NULL
  AND "slug" IN ('northstar-electrical', 'bluepeak-hvac');
