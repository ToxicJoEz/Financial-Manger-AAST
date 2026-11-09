-- Branch mods (e.g. a Fouad mod) and checks of the money they record.
ALTER TABLE "User" ADD COLUMN "branchScope" TEXT;

CREATE TABLE "MoneyCheck" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "note" TEXT,
    "checkedBy" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MoneyCheck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MoneyCheck_kind_recordId_key" ON "MoneyCheck"("kind", "recordId");
CREATE INDEX "MoneyCheck_branch_idx" ON "MoneyCheck"("branch");
