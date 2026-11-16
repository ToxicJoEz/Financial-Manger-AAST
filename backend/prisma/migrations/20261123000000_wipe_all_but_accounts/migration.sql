-- One-time wipe requested on 2026-11-16: delete everything except user accounts and the branch list
-- (umbrellas, cycles, students, money, payroll, employees, checks, notifications, requests and the activity log).
-- Same statements as wipeAllButAccounts() in src/utils/wipeData.js; test/wipeData.test.js keeps them in step.
ALTER TABLE "SystemLog" DISABLE TRIGGER USER;
TRUNCATE "BackupChunk", "BackupTransfer", "BookPayment", "BranchColor", "Course", "CourseInstructor", "Cycle", "Enrollment", "ImportBatch", "Instructor", "InstructorPaymentBatch", "MoneyCheck", "Notification", "PaymentEntry", "PaymentRun", "PayrollEarning", "PayrollRecord", "PendingAssignment", "RetainedEnrollmentIncome", "Student", "SystemLog";
ALTER TABLE "SystemLog" ENABLE TRIGGER USER;
INSERT INTO "SystemLog" ("id", "action", "description", "actorUsername", "category", "outcome", "createdAt")
   VALUES (gen_random_uuid()::text, 'WIPE_ALL_BUT_ACCOUNTS',
     'Deleted all data except user accounts and branches: umbrellas, cycles, students, payments, payroll, employees, checks, notifications, requests and the activity log.',
     'system', 'system', 'SUCCESS', CURRENT_TIMESTAMP);
