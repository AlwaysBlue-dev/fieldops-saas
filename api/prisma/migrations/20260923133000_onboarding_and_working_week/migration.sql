ALTER TABLE "Organization" ADD COLUMN "industry" TEXT;
ALTER TABLE "Organization" ADD COLUMN "onboardingStep" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Organization" ADD COLUMN "onboardingCompletedAt" TIMESTAMPTZ(6);

ALTER TABLE "OrganizationSettings" ADD COLUMN "workingWeek" JSONB NOT NULL DEFAULT '["MON","TUE","WED","THU","FRI"]';
