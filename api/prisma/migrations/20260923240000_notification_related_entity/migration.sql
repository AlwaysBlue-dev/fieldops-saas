-- AlterTable
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "relatedEntityType" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "relatedEntityId" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_organizationId_userId_createdAt_idx"
  ON "Notification"("organizationId", "userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Notification_organizationId_type_relatedEntityId_idx"
  ON "Notification"("organizationId", "type", "relatedEntityId");
