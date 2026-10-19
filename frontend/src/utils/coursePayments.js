// Compare in piasters so floating-point dust does not create outstanding balances.
const piasters = value => Math.round(Number(value || 0) * 100);
export const tuitionOutstanding = course => !course.archivedAt && piasters(course.totalRemainingBalance) > 0;
export const instructorPaymentOutstanding = (course, role) => ['admin', 'mod'].includes(role) && !course.archivedAt && course.isFinished && !course.isPaid && (course.instructors || []).some(assignment => piasters(Number(assignment.hoursTaught || 0) * Number(assignment.hourlyRate || 0)) > 0);
