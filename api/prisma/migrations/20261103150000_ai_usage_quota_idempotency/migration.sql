-- AI Workforce quota reliability: PENDING/INTERRUPTED enum values, clientRequestId
-- idempotency columns, reservation expiry, and expectedTargetUpdatedAt on proposals.
-- Additive only.
--
-- IMPORTANT: Newly added enum values cannot be used in the same PostgreSQL
-- transaction that adds them. SET DEFAULT 'PENDING' lives in
-- 20261103150500_ai_usage_pending_default.

-- AlterEnum (commit before using new values)
ALTER TYPE "AiUsageStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "AiUsageStatus" ADD VALUE IF NOT EXISTS 'INTERRUPTED';

-- AlterTable AiUsageEvent (columns only; default change is a later migration)
ALTER TABLE "AiUsageEvent" ADD COLUMN IF NOT EXISTS "clientRequestId" UUID;
ALTER TABLE "AiUsageEvent" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;
ALTER TABLE "AiUsageEvent" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable AiProposedAction
ALTER TABLE "AiProposedAction" ADD COLUMN IF NOT EXISTS "expectedTargetUpdatedAt" TIMESTAMPTZ;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiUsageEvent_organizationId_clientRequestId_key"
  ON "AiUsageEvent"("organizationId", "clientRequestId");

CREATE INDEX IF NOT EXISTS "AiUsageEvent_organizationId_status_expiresAt_idx"
  ON "AiUsageEvent"("organizationId", "status", "expiresAt");
