ALTER TABLE "Course" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Course" ADD COLUMN "archivedBy" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Enrollment" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "financialArchivedAt" DATETIME;
ALTER TABLE "PendingAssignment" ADD COLUMN "replacedAssignmentId" TEXT;
ALTER TABLE "PendingAssignment" ADD COLUMN "replacedInstructorId" TEXT;
CREATE TABLE "PayrollRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "courseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "totalHours" REAL NOT NULL,
  "payrollMonth" TEXT,
  "isPaid" BOOLEAN NOT NULL DEFAULT false,
  "instructors" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PayrollRecord_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PayrollRecord_courseId_key" ON "PayrollRecord"("courseId");
CREATE INDEX "PayrollRecord_payrollMonth_idx" ON "PayrollRecord"("payrollMonth");
