ALTER TABLE "Organization" ADD COLUMN "deletedAt" TIMESTAMPTZ;
CREATE TYPE "WorkspaceDeletionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TABLE "WorkspaceDeletionRequest" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "workspaceName" TEXT NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "WorkspaceDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMPTZ,
  "note" TEXT,
  CONSTRAINT "WorkspaceDeletionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceDeletionRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceDeletionRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkspaceDeletionRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "WorkspaceDeletionRequest_status_requestedAt_idx" ON "WorkspaceDeletionRequest"("status", "requestedAt");
CREATE INDEX "WorkspaceDeletionRequest_organizationId_requestedAt_idx" ON "WorkspaceDeletionRequest"("organizationId", "requestedAt");
CREATE INDEX "WorkspaceDeletionRequest_requestedByUserId_idx" ON "WorkspaceDeletionRequest"("requestedByUserId");
CREATE INDEX "WorkspaceDeletionRequest_reviewedByUserId_idx" ON "WorkspaceDeletionRequest"("reviewedByUserId");
CREATE UNIQUE INDEX "WorkspaceDeletionRequest_one_pending_per_org" ON "WorkspaceDeletionRequest"("organizationId") WHERE "status" = 'PENDING';

-- All billing writers, including concurrent activation/payment verification, must
-- serialize with deletion's organization row lock. A tombstone cannot be revived.
CREATE FUNCTION "protect_deleted_workspace_billing"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE removed_at TIMESTAMPTZ;
BEGIN
  SELECT "deletedAt" INTO removed_at FROM "Organization"
    WHERE "id" = NEW."organizationId" FOR UPDATE;
  IF removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Workspace has been deleted' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Subscription_workspace_deletion_lock" BEFORE INSERT OR UPDATE ON "Subscription"
  FOR EACH ROW EXECUTE FUNCTION "protect_deleted_workspace_billing"();
CREATE TRIGGER "Invoice_workspace_deletion_lock" BEFORE INSERT OR UPDATE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION "protect_deleted_workspace_billing"();

CREATE FUNCTION "preserve_workspace_tombstone"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."deletedAt" IS NOT NULL AND
    (NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" OR NEW."status" <> 'DEACTIVATED') THEN
    RAISE EXCEPTION 'Deleted workspaces cannot be restored' USING ERRCODE = '23514';
  END IF;
  IF NEW."deletedAt" IS NOT NULL AND NEW."status" <> 'DEACTIVATED' THEN
    RAISE EXCEPTION 'Deleted workspace must be deactivated' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Organization_preserve_tombstone" BEFORE UPDATE ON "Organization"
  FOR EACH ROW EXECUTE FUNCTION "preserve_workspace_tombstone"();
