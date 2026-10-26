ALTER TABLE "Student" ALTER COLUMN "registrationNumber" DROP NOT NULL;
UPDATE "Student" SET "registrationNumber"=NULL WHERE trim("registrationNumber")='';
ALTER TABLE "Instructor" ADD COLUMN "archivedAt" TIMESTAMP(3), ADD COLUMN "archivedBy" TEXT;
CREATE TABLE "RetainedEnrollmentIncome" (
 "id" TEXT NOT NULL PRIMARY KEY,"courseId" TEXT NOT NULL,"sourceEnrollmentId" TEXT NOT NULL UNIQUE,
 "tuitionMinor" BIGINT NOT NULL,"bookMinor" BIGINT NOT NULL,"reason" TEXT NOT NULL,"snapshot" JSONB NOT NULL,
 "recordedBy" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RetainedEnrollmentIncome_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "retained_income_nonnegative" CHECK ("tuitionMinor">=0 AND "bookMinor">=0)
);
CREATE INDEX "RetainedEnrollmentIncome_courseId_idx" ON "RetainedEnrollmentIncome"("courseId");
