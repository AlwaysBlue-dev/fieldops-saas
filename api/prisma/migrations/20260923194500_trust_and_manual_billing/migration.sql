-- Trust/legal consent fields and manual invoice billing. No payment provider.

CREATE TYPE "InvoiceType" AS ENUM ('ACTIVATION', 'RENEWAL', 'PLAN_CHANGE', 'OTHER');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID', 'OVERDUE');

ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMPTZ;
ALTER TABLE "User" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "privacyVersion" TEXT;

CREATE TABLE "PlatformCounter" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "next" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "PlatformCounter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformCounter_key_year_key" ON "PlatformCounter"("key", "year");

CREATE TABLE "PlatformBillingSettings" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL DEFAULT 'default',
  "billingLegalName" TEXT,
  "billingAddress" TEXT,
  "billingEmail" TEXT,
  "billingInstructions" TEXT,
  "paymentReferenceInstructions" TEXT,
  "updatedByUserId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "PlatformBillingSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformBillingSettings_key_key" ON "PlatformBillingSettings"("key");

CREATE TABLE "Invoice" (
  "id" UUID NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "organizationId" UUID NOT NULL,
  "subscriptionId" UUID,
  "planId" UUID NOT NULL,
  "type" "InvoiceType" NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "subtotalCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "billingPeriodStart" TIMESTAMPTZ NOT NULL,
  "billingPeriodEnd" TIMESTAMPTZ NOT NULL,
  "issuedAt" TIMESTAMPTZ,
  "dueAt" TIMESTAMPTZ,
  "paidAt" TIMESTAMPTZ,
  "createdByPlatformUserId" UUID NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerBillingEmail" TEXT NOT NULL,
  "paymentInstructionsSnapshot" TEXT,
  "internalNotes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE INDEX "Invoice_organizationId_status_createdAt_idx" ON "Invoice"("organizationId", "status", "createdAt");
CREATE INDEX "Invoice_planId_idx" ON "Invoice"("planId");
CREATE INDEX "Invoice_subscriptionId_idx" ON "Invoice"("subscriptionId");
CREATE INDEX "Invoice_createdByPlatformUserId_idx" ON "Invoice"("createdByPlatformUserId");

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_createdByPlatformUserId_fkey"
  FOREIGN KEY ("createdByPlatformUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InvoicePaymentNotice" (
  "id" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "submittedByUserId" UUID NOT NULL,
  "reference" TEXT,
  "message" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InvoicePaymentNotice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoicePaymentNotice_invoiceId_createdAt_idx" ON "InvoicePaymentNotice"("invoiceId", "createdAt");
CREATE INDEX "InvoicePaymentNotice_organizationId_idx" ON "InvoicePaymentNotice"("organizationId");

ALTER TABLE "InvoicePaymentNotice"
  ADD CONSTRAINT "InvoicePaymentNotice_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoicePaymentNotice"
  ADD CONSTRAINT "InvoicePaymentNotice_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoicePaymentNotice"
  ADD CONSTRAINT "InvoicePaymentNotice_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
