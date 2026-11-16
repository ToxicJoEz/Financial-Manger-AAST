-- Exam umbrellas (IELTS, CEPT, TOEFL, PTE) can run cycles without a level number.
ALTER TABLE "Cycle" ALTER COLUMN "cycleNumber" DROP NOT NULL;

-- Cycles created by branch mods wait for the main mod's approval. Existing cycles count as approved.
ALTER TABLE "Cycle" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "Cycle" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "Cycle" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Cycle" ADD COLUMN "rejectionReason" TEXT;
CREATE INDEX "Cycle_approvalStatus_idx" ON "Cycle"("approvalStatus");
