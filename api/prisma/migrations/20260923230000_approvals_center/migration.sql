-- AlterEnum
ALTER TYPE "ApprovalStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "ApprovalStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Approval" ADD COLUMN "assignedApproverUserId" UUID;
ALTER TABLE "Approval" ADD COLUMN "assignedRole" "OrganizationRole";
ALTER TABLE "Approval" ADD COLUMN "decision" TEXT;

UPDATE "Approval" SET "requestedAt" = "createdAt" WHERE "requestedAt" IS NULL;

CREATE UNIQUE INDEX "Approval_organizationId_type_subjectId_key" ON "Approval"("organizationId", "type", "subjectId");

ALTER TABLE "Approval" ADD CONSTRAINT "Approval_assignedApproverUserId_fkey" FOREIGN KEY ("assignedApproverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
