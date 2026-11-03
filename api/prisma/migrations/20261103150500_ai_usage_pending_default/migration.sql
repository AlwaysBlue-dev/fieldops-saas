-- Use AiUsageStatus PENDING as the column default after the enum value was
-- committed by 20261103150000_ai_usage_quota_idempotency.
-- Separate migration: PostgreSQL rejects using a newly added enum value in the
-- same transaction that added it (55P04).

ALTER TABLE "AiUsageEvent" ALTER COLUMN "status" SET DEFAULT 'PENDING';
