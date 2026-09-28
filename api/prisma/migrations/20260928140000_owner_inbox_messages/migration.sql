-- Owner Inbox: organization-scoped platform messages for current Owners.
CREATE TABLE "OwnerMessage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "ctaPath" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OwnerMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OwnerMessageReceipt" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "readAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OwnerMessageReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OwnerMessage_organizationId_createdAt_idx" ON "OwnerMessage"("organizationId", "createdAt");
CREATE INDEX "OwnerMessage_createdByUserId_idx" ON "OwnerMessage"("createdByUserId");
CREATE UNIQUE INDEX "OwnerMessageReceipt_messageId_userId_key" ON "OwnerMessageReceipt"("messageId", "userId");
CREATE INDEX "OwnerMessageReceipt_userId_status_createdAt_idx" ON "OwnerMessageReceipt"("userId", "status", "createdAt");

ALTER TABLE "OwnerMessage" ADD CONSTRAINT "OwnerMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnerMessage" ADD CONSTRAINT "OwnerMessage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OwnerMessageReceipt" ADD CONSTRAINT "OwnerMessageReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "OwnerMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnerMessageReceipt" ADD CONSTRAINT "OwnerMessageReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
