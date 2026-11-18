-- Placement tests are created by admins and the main mod; the testing office fills in the result later.
-- Only relaxes and adds columns: existing results keep their score and level, nothing is rewritten.
ALTER TABLE "PlacementTest" ALTER COLUMN "score" DROP NOT NULL;
ALTER TABLE "PlacementTest" ALTER COLUMN "level" DROP NOT NULL;
ALTER TABLE "PlacementTest" ADD COLUMN "purpose" TEXT;
ALTER TABLE "PlacementTest" ADD COLUMN "resultBy" TEXT;
ALTER TABLE "PlacementTest" ADD COLUMN "resultAt" TIMESTAMP(3);
