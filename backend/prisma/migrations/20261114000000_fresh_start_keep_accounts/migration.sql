-- One-time fresh start (requested 2026-11-10): empties all business data so the app starts blank with the
-- new cycle naming and branch rules. User accounts ("User") and the activity log ("SystemLog") are kept.
-- Prisma runs each migration once per database, so this never runs again where it has already run.
TRUNCATE "MoneyCheck", "PaymentEntry", "BookPayment", "RetainedEnrollmentIncome", "PayrollEarning",
  "InstructorPaymentBatch", "PaymentRun", "PayrollRecord", "ImportBatch", "Notification", "PendingAssignment",
  "CourseInstructor", "Enrollment", "Student", "Cycle", "SubCourse", "Course", "Instructor", "BranchColor";
