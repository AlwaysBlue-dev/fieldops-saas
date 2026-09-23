-- Trial + manual activation: expand subscription statuses, add trial window fields,
-- and store lightweight activation requests. No payment provider.

CREATE TYPE "SubscriptionStatus_new" AS ENUM (
  'NONE',
  'TRIALING',
  'GRACE',
  'ACTIVE',
  'PAST_DUE',
  'TRIAL_EXPIRED',
  'SUSPENDED',
  'CANCELED',
  'CANCELLED'
);

ALTER TABLE "Subscription" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Subscription"
  ALTER COLUMN "status" TYPE "SubscriptionStatus_new"
  USING ("status"::text::"SubscriptionStatus_new");
DROP TYPE "SubscriptionStatus";
ALTER TYPE "SubscriptionStatus_new" RENAME TO "SubscriptionStatus";
ALTER TABLE "Subscription" ALTER COLUMN "status" SET DEFAULT 'TRIALING';

CREATE TYPE "ActivationRequestStatus" AS ENUM ('OPEN', 'CONTACTED', 'CLOSED');

ALTER TABLE "Subscription" ADD COLUMN "trialStartedAt" TIMESTAMPTZ;
ALTER TABLE "Subscription" ADD COLUMN "graceEndsAt" TIMESTAMPTZ;
ALTER TABLE "Subscription" ADD COLUMN "activatedAt" TIMESTAMPTZ;
ALTER TABLE "Subscription" ADD COLUMN "activatedByUserId" UUID;

UPDATE "Subscription"
SET
  "trialStartedAt" = COALESCE("trialStartedAt", "createdAt"),
  "graceEndsAt" = COALESCE("graceEndsAt", "trialEndsAt" + INTERVAL '3 days')
WHERE "trialEndsAt" IS NOT NULL;

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_activatedByUserId_fkey"
  FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Subscription_activatedByUserId_idx" ON "Subscription"("activatedByUserId");

CREATE TABLE "ActivationRequest" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "message" TEXT,
  "status" "ActivationRequestStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "ActivationRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivationRequest_organizationId_status_createdAt_idx"
  ON "ActivationRequest"("organizationId", "status", "createdAt");
CREATE INDEX "ActivationRequest_requestedByUserId_idx"
  ON "ActivationRequest"("requestedByUserId");

ALTER TABLE "ActivationRequest"
  ADD CONSTRAINT "ActivationRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivationRequest"
  ADD CONSTRAINT "ActivationRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
