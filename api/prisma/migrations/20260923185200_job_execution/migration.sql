-- CreateEnum
CREATE TYPE "JobOutcome" AS ENUM ('COMPLETED', 'PARTIALLY_COMPLETED', 'FOLLOW_UP_REQUIRED', 'UNABLE_TO_COMPLETE');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "workPerformed" TEXT,
ADD COLUMN "completionNotes" TEXT,
ADD COLUMN "outcome" "JobOutcome",
ADD COLUMN "outcomeReason" TEXT;

-- AlterTable
ALTER TABLE "JobWorkLog" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill safety control codes, then require them and unique-index per job.
UPDATE "JobSafetyControl"
SET "code" = 'CONTROL-' || "id"
WHERE "code" IS NULL OR BTRIM("code") = '';

ALTER TABLE "JobSafetyControl" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "JobSafetyControl_jobId_code_key" ON "JobSafetyControl"("jobId", "code");
