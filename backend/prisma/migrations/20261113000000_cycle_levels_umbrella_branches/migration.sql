-- Umbrellas list the branches allowed to run their cycles; existing umbrellas stay open everywhere they already run.
ALTER TABLE "Course" ADD COLUMN "branches" TEXT NOT NULL DEFAULT 'MIAMI';
UPDATE "Course" c SET "branches" = COALESCE(
  (SELECT string_agg(DISTINCT y."branch", ',') FROM "Cycle" y WHERE y."parentCourseId" = c."id"), 'MIAMI');

-- Cycles are named "<umbrella> <level> - <month year>" with "(n)" for repeats in the same branch and month.
ALTER TABLE "Cycle" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS "Cycle_numberingKey_cycleNumber_key";
CREATE UNIQUE INDEX "Cycle_numberingKey_branch_name_key" ON "Cycle"("numberingKey", "branch", "name");
