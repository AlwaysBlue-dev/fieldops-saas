-- Storage quota metering: logo size + concurrent upload reservations

CREATE TYPE "StorageUploadStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "StorageUploadPurpose" AS ENUM ('JOB_FILE', 'ORGANIZATION_LOGO');

ALTER TABLE "Organization" ADD COLUMN "logoSizeBytes" BIGINT;

CREATE TABLE "StorageUpload" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "status" "StorageUploadStatus" NOT NULL DEFAULT 'PENDING',
    "purpose" "StorageUploadPurpose" NOT NULL,
    "jobId" UUID,
    "jobFileId" UUID,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "StorageUpload_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorageUpload_objectKey_key" ON "StorageUpload"("objectKey");
CREATE UNIQUE INDEX "StorageUpload_jobFileId_organizationId_key" ON "StorageUpload"("jobFileId", "organizationId");
CREATE INDEX "StorageUpload_organizationId_status_expiresAt_idx" ON "StorageUpload"("organizationId", "status", "expiresAt");
CREATE INDEX "StorageUpload_organizationId_createdAt_idx" ON "StorageUpload"("organizationId", "createdAt");
CREATE INDEX "JobFile_organizationId_createdAt_idx" ON "JobFile"("organizationId", "createdAt");

ALTER TABLE "StorageUpload" ADD CONSTRAINT "StorageUpload_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StorageUpload" ADD CONSTRAINT "StorageUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StorageUpload" ADD CONSTRAINT "StorageUpload_jobFileId_organizationId_fkey" FOREIGN KEY ("jobFileId", "organizationId") REFERENCES "JobFile"("id", "organizationId") ON DELETE SET NULL ON UPDATE CASCADE;
