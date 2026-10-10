ALTER TABLE "Invoice" ADD COLUMN "paddleTransactionId" TEXT;
CREATE UNIQUE INDEX "Invoice_paddleTransactionId_key" ON "Invoice"("paddleTransactionId");

CREATE TABLE "PaddleWebhookEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "processedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaddleWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaddleWebhookEvent_eventId_key" ON "PaddleWebhookEvent"("eventId");
CREATE INDEX "PaddleWebhookEvent_eventType_processedAt_idx" ON "PaddleWebhookEvent"("eventType", "processedAt");
