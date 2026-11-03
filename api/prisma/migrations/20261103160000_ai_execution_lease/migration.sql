-- AI Workforce execution lease: ownership token + stored result for idempotent retries.
-- Additive only. Do not apply until Step 2.8 review.

ALTER TABLE "AiUsageEvent" ADD COLUMN IF NOT EXISTS "executionToken" UUID;
ALTER TABLE "AiUsageEvent" ADD COLUMN IF NOT EXISTS "resultPayload" JSONB;
