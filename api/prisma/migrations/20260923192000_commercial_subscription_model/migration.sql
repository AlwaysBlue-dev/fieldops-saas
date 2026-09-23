-- Commercial catalog metadata, paid/expired statuses, request types,
-- and an idempotent notification ledger. No payment provider.

CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL', 'CUSTOM');
CREATE TYPE "CommercialRequestType" AS ENUM ('ACTIVATION', 'RENEWAL', 'PLAN_CHANGE');

CREATE TYPE "SubscriptionStatus_new" AS ENUM (
  'NONE',
  'TRIALING',
  'GRACE',
  'ACTIVE',
  'PAST_DUE',
  'TRIAL_EXPIRED',
  'PAID_GRACE',
  'EXPIRED',
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

CREATE TYPE "ActivationRequestStatus_new" AS ENUM (
  'OPEN',
  'CONTACTED',
  'COMPLETED',
  'CLOSED'
);

ALTER TABLE "ActivationRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ActivationRequest"
  ALTER COLUMN "status" TYPE "ActivationRequestStatus_new"
  USING ("status"::text::"ActivationRequestStatus_new");
DROP TYPE "ActivationRequestStatus";
ALTER TYPE "ActivationRequestStatus_new" RENAME TO "ActivationRequestStatus";
ALTER TABLE "ActivationRequest" ALTER COLUMN "status" SET DEFAULT 'OPEN';

ALTER TABLE "Plan" ADD COLUMN "displayPrice" TEXT;
ALTER TABLE "Plan" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "Plan" ADD COLUMN "billingInterval" "BillingInterval" NOT NULL DEFAULT 'ANNUAL';
ALTER TABLE "Plan" ADD COLUMN "publiclyVisible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Plan" ADD COLUMN "contactSales" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Plan" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 100;

ALTER TABLE "ActivationRequest"
  ADD COLUMN "requestType" "CommercialRequestType" NOT NULL DEFAULT 'ACTIVATION';

DROP INDEX IF EXISTS "ActivationRequest_organizationId_status_createdAt_idx";
CREATE INDEX "ActivationRequest_organizationId_requestType_status_createdAt_idx"
  ON "ActivationRequest"("organizationId", "requestType", "status", "createdAt");
CREATE INDEX "ActivationRequest_status_createdAt_idx"
  ON "ActivationRequest"("status", "createdAt");

CREATE TABLE "SubscriptionNotification" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "sentAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubscriptionNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionNotification_organizationId_kind_periodKey_key"
  ON "SubscriptionNotification"("organizationId", "kind", "periodKey");
CREATE INDEX "SubscriptionNotification_organizationId_kind_idx"
  ON "SubscriptionNotification"("organizationId", "kind");

ALTER TABLE "SubscriptionNotification"
  ADD CONSTRAINT "SubscriptionNotification_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Plan_status_idx";
CREATE INDEX "Plan_status_publiclyVisible_sortOrder_idx"
  ON "Plan"("status", "publiclyVisible", "sortOrder");

UPDATE "Plan"
SET
  "currency" = 'USD',
  "billingInterval" = 'ANNUAL',
  "publiclyVisible" = true,
  "contactSales" = false,
  "sortOrder" = 10,
  "monthlyPriceCents" = NULL,
  "annualPriceCents" = 49900,
  "maxUsers" = 10,
  "maxStorageBytes" = 21474836480
WHERE "code" = 'professional';

UPDATE "Plan"
SET
  "currency" = 'USD',
  "billingInterval" = 'CUSTOM',
  "publiclyVisible" = true,
  "contactSales" = true,
  "sortOrder" = 20,
  "monthlyPriceCents" = NULL,
  "annualPriceCents" = NULL
WHERE "code" = 'business';

UPDATE "Plan"
SET
  "publiclyVisible" = false,
  "contactSales" = false,
  "sortOrder" = 90
WHERE "code" = 'starter';
