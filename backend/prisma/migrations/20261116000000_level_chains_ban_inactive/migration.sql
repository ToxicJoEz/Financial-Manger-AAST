-- Levels taken one after another (KET 1 -> KET 2). Every existing cycle starts its own chain.
ALTER TABLE "Cycle" ADD COLUMN "previousCycleId" TEXT;
ALTER TABLE "Cycle" ADD COLUMN "chainId" TEXT;
ALTER TABLE "Cycle" ADD COLUMN "chainStart" TIMESTAMP(3);
UPDATE "Cycle" SET "chainId" = "id", "chainStart" = "startDate";
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_previousCycleId_fkey" FOREIGN KEY ("previousCycleId") REFERENCES "Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Cycle_chainId_idx" ON "Cycle"("chainId");

-- Accounts are no longer deactivated, only banned: deactivated accounts become banned (they can be unbanned).
UPDATE "User" SET "isBanned" = true, "isActive" = true WHERE "isActive" = false;
