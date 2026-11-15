-- Every amount of money is stored as whole piasters (1 EGP = 100 piasters), never as a decimal.
ALTER TABLE "Course" ALTER COLUMN "bookPrice" DROP DEFAULT,
  ALTER COLUMN "bookPrice" TYPE INTEGER USING ROUND("bookPrice" * 100)::INTEGER,
  ALTER COLUMN "bookPrice" SET DEFAULT 0;
ALTER TABLE "Cycle" ALTER COLUMN "courseFee" DROP DEFAULT,
  ALTER COLUMN "courseFee" TYPE INTEGER USING ROUND("courseFee" * 100)::INTEGER,
  ALTER COLUMN "courseFee" SET DEFAULT 0;
ALTER TABLE "CourseInstructor" ALTER COLUMN "hourlyRate" TYPE INTEGER USING ROUND("hourlyRate" * 100)::INTEGER;
ALTER TABLE "Enrollment" ALTER COLUMN "amountPaid" DROP DEFAULT,
  ALTER COLUMN "amountPaid" TYPE INTEGER USING ROUND("amountPaid" * 100)::INTEGER,
  ALTER COLUMN "amountPaid" SET DEFAULT 0,
  ALTER COLUMN "customFee" TYPE INTEGER USING ROUND("customFee" * 100)::INTEGER;
ALTER TABLE "PayrollEarning" ALTER COLUMN "rate" TYPE INTEGER USING ROUND("rate" * 100)::INTEGER;
