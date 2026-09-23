-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "workOrderNumber" TEXT,
ADD COLUMN     "requireRiskAssessment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requirePermit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireLoto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireClientSignOff" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cancelReason" TEXT;
