-- Failed actions keep what kind of failure it was and the exact reason.
ALTER TABLE "SystemLog" ADD COLUMN "errorKind" TEXT, ADD COLUMN "errorMessage" TEXT;
CREATE INDEX "SystemLog_errorKind_createdAt_idx" ON "SystemLog"("errorKind", "createdAt");
-- Existing entries are append-only and stay as they were; their reason is still in their details.
