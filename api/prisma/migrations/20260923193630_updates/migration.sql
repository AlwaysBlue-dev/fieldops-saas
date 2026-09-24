-- DropIndex
DROP INDEX "Notification_organizationId_createdAt_idx";

-- AlterTable
ALTER TABLE "JobWorkLog" ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ;

-- RenameIndex
ALTER INDEX "ActivationRequest_organizationId_requestType_status_createdAt_i" RENAME TO "ActivationRequest_organizationId_requestType_status_created_idx";
