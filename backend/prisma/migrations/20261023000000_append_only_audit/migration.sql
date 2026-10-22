ALTER TABLE "SystemLog" DROP CONSTRAINT IF EXISTS "SystemLog_actorUsername_fkey";
ALTER TABLE "SystemLog" DROP CONSTRAINT IF EXISTS "SystemLog_targetUsername_fkey";
ALTER TABLE "SystemLog"
 ADD COLUMN "actorId" TEXT, ADD COLUMN "actorRole" TEXT, ADD COLUMN "authMethod" TEXT,
 ADD COLUMN "category" TEXT NOT NULL DEFAULT 'system', ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
 ADD COLUMN "recordCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "requestId" TEXT, ADD COLUMN "statusCode" INTEGER, ADD COLUMN "durationMs" INTEGER, ADD COLUMN "details" JSONB;
-- Old roles were not recorded at action time; keep legacy entries admin-only.
UPDATE "SystemLog" l SET "actorId"=u.id FROM "User" u WHERE u.username=l."actorUsername";
CREATE UNIQUE INDEX "SystemLog_requestId_key" ON "SystemLog"("requestId");
CREATE INDEX "SystemLog_createdAt_id_idx" ON "SystemLog"("createdAt",id);
CREATE INDEX "SystemLog_actorRole_createdAt_idx" ON "SystemLog"("actorRole","createdAt");
CREATE INDEX "SystemLog_actorUsername_createdAt_idx" ON "SystemLog"("actorUsername","createdAt");
CREATE INDEX "SystemLog_category_outcome_createdAt_idx" ON "SystemLog"(category,outcome,"createdAt");
CREATE FUNCTION prevent_audit_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit records are append-only'; END; $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "SystemLog"
 FOR EACH ROW EXECUTE FUNCTION prevent_audit_changes();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON "SystemLog"
 FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_changes();
