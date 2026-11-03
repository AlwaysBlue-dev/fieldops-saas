-- FieldKeel AI Workforce foundation (sessions, messages, usage ledger, proposed actions).
-- Separate from operational Approval inbox. Do not apply until Step 2 review.

-- CreateEnum
CREATE TYPE "AiChatSessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "AiUsageStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AiProposedActionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED', 'FAILED');

-- CreateTable
CREATE TABLE "AiChatSession" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT,
    "status" "AiChatSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AiChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatMessage" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "userId" UUID,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "taskKey" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "status" "AiUsageStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProposedAction" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "targetEntityType" TEXT,
    "targetEntityId" UUID,
    "status" "AiProposedActionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMPTZ,
    "decisionComment" TEXT,
    "executedAt" TIMESTAMPTZ,
    "executionResult" JSONB,
    "expiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AiProposedAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiChatSession_id_organizationId_key" ON "AiChatSession"("id", "organizationId");

-- CreateIndex
CREATE INDEX "AiChatSession_organizationId_userId_updatedAt_idx" ON "AiChatSession"("organizationId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiChatSession_organizationId_status_updatedAt_idx" ON "AiChatSession"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "AiChatMessage_organizationId_sessionId_createdAt_idx" ON "AiChatMessage"("organizationId", "sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AiChatMessage_sessionId_createdAt_idx" ON "AiChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_organizationId_createdAt_idx" ON "AiUsageEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_organizationId_status_createdAt_idx" ON "AiUsageEvent"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_organizationId_userId_createdAt_idx" ON "AiUsageEvent"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_sessionId_idx" ON "AiUsageEvent"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "AiProposedAction_id_organizationId_key" ON "AiProposedAction"("id", "organizationId");

-- CreateIndex
CREATE INDEX "AiProposedAction_organizationId_status_createdAt_idx" ON "AiProposedAction"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AiProposedAction_organizationId_sessionId_idx" ON "AiProposedAction"("organizationId", "sessionId");

-- CreateIndex
CREATE INDEX "AiProposedAction_organizationId_targetEntityType_targetEntityId_idx" ON "AiProposedAction"("organizationId", "targetEntityType", "targetEntityId");

-- AddForeignKey
ALTER TABLE "AiChatSession" ADD CONSTRAINT "AiChatSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatSession" ADD CONSTRAINT "AiChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_sessionId_organizationId_fkey" FOREIGN KEY ("sessionId", "organizationId") REFERENCES "AiChatSession"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_sessionId_organizationId_fkey" FOREIGN KEY ("sessionId", "organizationId") REFERENCES "AiChatSession"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposedAction" ADD CONSTRAINT "AiProposedAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposedAction" ADD CONSTRAINT "AiProposedAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposedAction" ADD CONSTRAINT "AiProposedAction_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProposedAction" ADD CONSTRAINT "AiProposedAction_sessionId_organizationId_fkey" FOREIGN KEY ("sessionId", "organizationId") REFERENCES "AiChatSession"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
