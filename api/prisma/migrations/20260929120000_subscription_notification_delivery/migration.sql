-- Extend the existing delivery ledger. Historical rows remain SENT.
ALTER TABLE "SubscriptionNotification"
  ALTER COLUMN "sentAt" DROP NOT NULL,
  ADD COLUMN "deliveryState" TEXT NOT NULL DEFAULT 'SENT',
  ADD COLUMN "payload" JSONB,
  ADD COLUMN "firstAttemptAt" TIMESTAMPTZ,
  ADD COLUMN "leaseUntil" TIMESTAMPTZ,
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastError" TEXT;

CREATE INDEX "SubscriptionNotification_deliveryState_nextAttemptAt_idx"
  ON "SubscriptionNotification"("deliveryState", "nextAttemptAt");
