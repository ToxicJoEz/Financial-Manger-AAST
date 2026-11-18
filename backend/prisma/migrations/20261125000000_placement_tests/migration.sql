-- Placement tests: a new table and a new user toggle. Adds only; no existing data is changed.
ALTER TABLE "User" ADD COLUMN "canPlacementTest" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PlacementTest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "level" TEXT NOT NULL,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredById" TEXT,
    "enteredBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlacementTest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlacementTest_studentId_idx" ON "PlacementTest"("studentId");
CREATE INDEX "PlacementTest_branch_idx" ON "PlacementTest"("branch");
ALTER TABLE "PlacementTest" ADD CONSTRAINT "PlacementTest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
