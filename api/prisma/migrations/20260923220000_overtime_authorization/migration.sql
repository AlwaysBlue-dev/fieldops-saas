-- CreateEnum
CREATE TYPE "OvertimeAuthorizationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "OrganizationSettings" ADD COLUMN "allowOvertimeRequests" BOOLEAN NOT NULL DEFAULT true;

-- Drop existing overtime table (no operational rows yet; fields are replaced)
ALTER TABLE "OvertimeAuthorization" DROP CONSTRAINT IF EXISTS "OvertimeAuthorization_organizationId_fkey";
ALTER TABLE "OvertimeAuthorization" DROP CONSTRAINT IF EXISTS "OvertimeAuthorization_userId_fkey";
ALTER TABLE "OvertimeAuthorization" DROP CONSTRAINT IF EXISTS "OvertimeAuthorization_timeEntryId_fkey";
ALTER TABLE "OvertimeAuthorization" DROP CONSTRAINT IF EXISTS "OvertimeAuthorization_authorizedByUserId_fkey";
DROP INDEX IF EXISTS "OvertimeAuthorization_organizationId_status_idx";
DROP INDEX IF EXISTS "OvertimeAuthorization_organizationId_userId_idx";
DROP TABLE "OvertimeAuthorization";

CREATE TABLE "OvertimeAuthorization" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "authorizedStart" TIMESTAMPTZ NOT NULL,
    "authorizedEnd" TIMESTAMPTZ NOT NULL,
    "maxMinutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "OvertimeAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" UUID NOT NULL,
    "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMPTZ,
    "decisionComment" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "OvertimeAuthorization_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OvertimeAuthorization_organizationId_status_idx" ON "OvertimeAuthorization"("organizationId", "status");
CREATE INDEX "OvertimeAuthorization_organizationId_userId_workDate_idx" ON "OvertimeAuthorization"("organizationId", "userId", "workDate");
CREATE INDEX "OvertimeAuthorization_organizationId_jobId_idx" ON "OvertimeAuthorization"("organizationId", "jobId");

ALTER TABLE "OvertimeAuthorization" ADD CONSTRAINT "OvertimeAuthorization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OvertimeAuthorization" ADD CONSTRAINT "OvertimeAuthorization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OvertimeAuthorization" ADD CONSTRAINT "OvertimeAuthorization_jobId_organizationId_fkey" FOREIGN KEY ("jobId", "organizationId") REFERENCES "Job"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OvertimeAuthorization" ADD CONSTRAINT "OvertimeAuthorization_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OvertimeAuthorization" ADD CONSTRAINT "OvertimeAuthorization_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN "overtimeAuthorizationId" UUID;
CREATE INDEX "TimeEntry_overtimeAuthorizationId_idx" ON "TimeEntry"("overtimeAuthorizationId");
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_overtimeAuthorizationId_fkey" FOREIGN KEY ("overtimeAuthorizationId") REFERENCES "OvertimeAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
