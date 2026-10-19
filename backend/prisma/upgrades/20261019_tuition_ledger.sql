ALTER TABLE "Student" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Student" ADD COLUMN "deletedBy" TEXT;
CREATE TABLE "PaymentEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "enrollmentId" TEXT,
  "courseId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "courseName" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "kind" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "recordedBy" TEXT NOT NULL,
  "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,
  "reversalOfId" TEXT,
  CONSTRAINT "PaymentEntry_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PaymentEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "PaymentEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentEntry_idempotencyKey_key" ON "PaymentEntry"("idempotencyKey");
CREATE UNIQUE INDEX "PaymentEntry_reversalOfId_key" ON "PaymentEntry"("reversalOfId");
CREATE INDEX "PaymentEntry_enrollmentId_recordedAt_idx" ON "PaymentEntry"("enrollmentId", "recordedAt");
CREATE INDEX "PaymentEntry_courseId_occurredAt_idx" ON "PaymentEntry"("courseId", "occurredAt");
CREATE INDEX "PaymentEntry_studentId_idx" ON "PaymentEntry"("studentId");
INSERT INTO "PaymentEntry" ("id", "enrollmentId", "courseId", "studentId", "courseName", "studentName", "amountMinor", "kind", "note", "recordedBy", "occurredAt", "idempotencyKey")
SELECT lower(hex(randomblob(16))), e.id, e.courseId, e.studentId, c.name, s.name, CAST(ROUND(e.amountPaid * 100) AS BIGINT), 'LEGACY_BALANCE',
  'Opening balance imported from the existing total. Original receipt dates and individual payments are unknown.', 'migration', e.enrolledAt, 'legacy:' || e.id
FROM "Enrollment" e JOIN "Course" c ON c.id = e.courseId JOIN "Student" s ON s.id = e.studentId WHERE e.amountPaid != 0;
