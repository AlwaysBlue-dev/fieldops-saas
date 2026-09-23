-- CreateEnum
CREATE TYPE "TimeEntryType" AS ENUM ('NORMAL', 'OVERTIME', 'TRAVEL', 'STANDBY');

-- AlterEnum
ALTER TYPE "TimeEntryStatus" ADD VALUE 'PENDING';
ALTER TYPE "TimeEntryStatus" ADD VALUE 'RETURNED';

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN "type" "TimeEntryType" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "TimeEntry" ADD COLUMN "workDate" DATE;
ALTER TABLE "TimeEntry" ADD COLUMN "validation" JSONB;

UPDATE "TimeEntry" SET "workDate" = ("startedAt" AT TIME ZONE 'UTC')::date WHERE "workDate" IS NULL;

ALTER TABLE "TimeEntry" ALTER COLUMN "workDate" SET NOT NULL;

-- CreateIndex
CREATE INDEX "TimeEntry_organizationId_userId_workDate_idx" ON "TimeEntry"("organizationId", "userId", "workDate");
