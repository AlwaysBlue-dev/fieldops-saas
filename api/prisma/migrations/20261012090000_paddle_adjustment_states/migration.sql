ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'REFUND_PENDING';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';

ALTER TABLE "PaddleWebhookEvent"
  ADD COLUMN "organizationId" UUID,
  ADD COLUMN "invoiceId" UUID,
  ADD COLUMN "transactionId" TEXT,
  ADD COLUMN "paddleSubscriptionId" TEXT,
  ADD COLUMN "eventStatus" TEXT,
  ADD COLUMN "amountCents" INTEGER,
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "billingPeriodStart" TIMESTAMPTZ,
  ADD COLUMN "billingPeriodEnd" TIMESTAMPTZ;

CREATE INDEX "PaddleWebhookEvent_organizationId_eventType_createdAt_idx"
  ON "PaddleWebhookEvent"("organizationId", "eventType", "createdAt");
CREATE INDEX "PaddleWebhookEvent_transactionId_idx"
  ON "PaddleWebhookEvent"("transactionId");
