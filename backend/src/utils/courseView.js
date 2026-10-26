export const paymentSummaryInclude = { where: { kind: { in: ['PAYMENT', 'REFUND', 'ADJUSTMENT'] }, reversal: { is: null } }, select: { id: true, kind: true, paymentMethod: true, receiptNumber: true, amountMinor: true } };
export const isManager = user => ['admin', 'mod'].includes(user?.role);

export function enrollmentView(enrollment, course) {
  const effectiveFee = enrollment.customFee ?? course.courseFee ?? 0;
  const remainingBalance = Math.max(0, effectiveFee - enrollment.amountPaid);
  const status = effectiveFee === 0 ? 'EXEMPT' : enrollment.amountPaid >= effectiveFee ? 'PAID' : enrollment.amountPaid > 0 ? 'PARTIAL' : 'UNPAID';
  const { payments, bookPayments, ...record } = enrollment;
  const book = bookPayments?.find(p => !p.reversedAt);
  const books = book ? { id: book.id, status: book.status, amount: Number(book.amountMinor) / 100, recordedAt: book.recordedAt, recordedBy: book.recordedBy } : { status: 'UNPAID', amount: 0 };
  const paymentSummary = (payments || []).map(entry => ({ id: entry.id, kind: entry.kind, paymentMethod: entry.paymentMethod, receiptNumber: entry.receiptNumber, amount: Number(entry.amountMinor) / 100 }));
  return { ...record, books, paymentSummary, effectiveFee, remainingBalance, status };
}

// Tuition is visible to staff. Instructor compensation is management-only at every depth.
const payrollFields = new Set(['hourlyRate', 'payout', 'totalPayout', 'totalPayroll', 'totalPaid', 'totalUnpaid', 'isPaid', 'payrollMonth', 'payrollRecord', 'payrollEarnings']);
export function hidePayroll(value, user) {
  if (isManager(user) || value == null || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(item => hidePayroll(item, user));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !payrollFields.has(key)).map(([key, item]) => [key, hidePayroll(item, user)]));
  return value;
}

export function courseView(course, user) {
  const all = (course.enrollments || []).map(enrollment => enrollmentView(enrollment, course));
  const visible = isManager(user) ? all : all.filter(entry => !entry.student?.deletedAt && !entry.deletedAt && !entry.financialArchivedAt);
  const counted = all.filter(entry => !entry.financialArchivedAt);
  const totalExpectedRevenue = counted.reduce((sum, row) => sum + row.effectiveFee, 0);
  const retainedTuition=(course.retainedIncome||[]).reduce((sum,row)=>sum+Number(row.tuitionMinor)/100,0);
  const retainedBooks=(course.retainedIncome||[]).reduce((sum,row)=>sum+Number(row.bookMinor)/100,0);
  const totalCollectedRevenue = retainedTuition+counted.reduce((sum, row) => sum + row.amountPaid, 0);
  const totalBookRevenue = retainedBooks+counted.reduce((sum, row) => sum + (row.books.status === 'PAID' ? row.books.amount : 0), 0);
  const { isPaid: legacyPaid, payrollMonth: legacyMonth, ...currentCourse } = course;
  return hidePayroll({ ...Object.fromEntries(Object.entries(currentCourse).filter(([key])=>key!=='retainedIncome')), enrollments: visible,isPrivate:Boolean(course.parentCourse?.isPrivate),privateSeatOccupied:Boolean(course.parentCourse?.isPrivate&&all.length),effectiveBookPrice:course.parentCourse?.isPrivate?course.bookPrice||0:course.parentCourse?.bookPrice||0, totalEnrolled: visible.filter(entry => !entry.deletedAt && !entry.student?.deletedAt && !entry.financialArchivedAt).length, totalExpectedRevenue, retainedTuition, retainedBooks, totalCollectedRevenue, totalBookRevenue, totalIncome: totalCollectedRevenue + totalBookRevenue,
    // Sum each student's debt separately; historical credits never offset another student's debt.
    totalRemainingBalance: counted.reduce((sum, row) => sum + row.remainingBalance, 0) }, user);
}
