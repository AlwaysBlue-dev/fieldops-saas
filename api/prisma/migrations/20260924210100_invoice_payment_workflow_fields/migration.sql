-- Invoice payment URL workflow fields (uses PREPARING / PAYMENT_REPORTED after
-- 20260924210000_invoice_payment_url_workflow has committed those enum values).

-- Secure payment link + verification metadata (provider-neutral customer UX).
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentUrl" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "externalReference" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentReportedAt" TIMESTAMPTZ;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "paymentVerifiedAt" TIMESTAMPTZ;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "verifiedByUserId" UUID;

-- Existing DRAFT invoices remain valid; new creates use PREPARING in application code.
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'PREPARING';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_verifiedByUserId_fkey'
  ) THEN
    ALTER TABLE "Invoice"
      ADD CONSTRAINT "Invoice_verifiedByUserId_fkey"
      FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Invoice_verifiedByUserId_idx" ON "Invoice"("verifiedByUserId");
