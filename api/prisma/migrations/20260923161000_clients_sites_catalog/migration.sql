-- Customer catalog fields for Clients, Sites, and SiteContacts.
-- accountCode remains the organization-scoped optional client code.

ALTER TABLE "Client" ADD COLUMN "primaryContactName" TEXT;
ALTER TABLE "Client" ADD COLUMN "primaryContactEmail" TEXT;
ALTER TABLE "Client" ADD COLUMN "primaryContactPhone" TEXT;
ALTER TABLE "Client" ADD COLUMN "billingEmail" TEXT;
ALTER TABLE "Client" ADD COLUMN "website" TEXT;

UPDATE "Client"
SET
  "primaryContactEmail" = COALESCE("primaryContactEmail", "email"),
  "primaryContactPhone" = COALESCE("primaryContactPhone", "phone");

ALTER TABLE "Site" ADD COLUMN "siteCode" TEXT;
ALTER TABLE "Site" ADD COLUMN "timezone" TEXT;
ALTER TABLE "Site" ADD COLUMN "siteContactName" TEXT;
ALTER TABLE "Site" ADD COLUMN "siteContactEmail" TEXT;
ALTER TABLE "Site" ADD COLUMN "siteContactPhone" TEXT;
ALTER TABLE "Site" ADD COLUMN "notes" TEXT;

CREATE UNIQUE INDEX "Site_organizationId_siteCode_key" ON "Site"("organizationId", "siteCode");

ALTER TABLE "SiteContact" ADD COLUMN "notes" TEXT;
