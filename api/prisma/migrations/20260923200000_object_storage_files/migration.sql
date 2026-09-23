-- AlterEnum
ALTER TYPE "JobFileType" ADD VALUE 'SIGNATURE';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "clientAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN "clientComments" TEXT;
ALTER TABLE "Job" ADD COLUMN "signedAt" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "JobFile" ADD COLUMN "caption" TEXT;
ALTER TABLE "JobFile" ADD COLUMN "capturedAt" TIMESTAMPTZ;

-- CreateIndex
CREATE UNIQUE INDEX "JobFile_id_organizationId_key" ON "JobFile"("id", "organizationId");
