-- AI Workforce tool-call history on AiChatMessage (Step 4.3.7).
-- Additive only. Do not apply until Step 4.3.7 review / coordinated rollout.
-- Enables provider-neutral reconstruction of assistant toolCalls + tool results.

ALTER TABLE "AiChatMessage" ADD COLUMN IF NOT EXISTS "toolCalls" JSONB;
ALTER TABLE "AiChatMessage" ADD COLUMN IF NOT EXISTS "toolCallId" TEXT;
ALTER TABLE "AiChatMessage" ADD COLUMN IF NOT EXISTS "toolName" TEXT;

CREATE INDEX IF NOT EXISTS "AiChatMessage_sessionId_toolCallId_idx"
  ON "AiChatMessage"("sessionId", "toolCallId");
