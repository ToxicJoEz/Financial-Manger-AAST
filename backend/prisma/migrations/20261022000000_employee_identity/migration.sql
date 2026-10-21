BEGIN;
UPDATE "Instructor" SET "employeeId" = NULLIF(upper(translate(btrim("employeeId"), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')), '');
CREATE UNIQUE INDEX "Instructor_employeeId_key" ON "Instructor"("employeeId");
COMMIT;
