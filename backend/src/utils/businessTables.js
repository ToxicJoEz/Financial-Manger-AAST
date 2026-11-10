// Every table that holds business data (courses, students, employees, money, payroll, notifications).
// "User" (accounts) and "SystemLog" (the append-only activity log) are deliberately not listed.
export const BUSINESS_TABLES = [
  'MoneyCheck',
  'PaymentEntry',
  'BookPayment',
  'RetainedEnrollmentIncome',
  'PayrollEarning',
  'InstructorPaymentBatch',
  'PaymentRun',
  'PayrollRecord',
  'ImportBatch',
  'Notification',
  'PendingAssignment',
  'CourseInstructor',
  'Enrollment',
  'Student',
  'Cycle',
  'SubCourse',
  'Course',
  'Instructor',
  'BranchColor'
];
export const truncateBusinessData = prisma =>
  prisma.$executeRawUnsafe(`TRUNCATE ${BUSINESS_TABLES.map(t => `"${t}"`).join(', ')}`);
