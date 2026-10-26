import {privateLabel} from './privateCourses.js';
export const EXPORT_COLUMNS = {
  courses: {
    course: 'Cycle',
    courseName: 'Course',
    courseCode: 'Course code',
    cycleNumber: 'Cycle number',
    branch: 'Branch',
    venue: 'Venue / room', classStartTime: 'Class starts', classEndTime: 'Class ends',
    startDate: 'Start date',
    endDate: 'End date',
    status: 'Course status',
    students: 'Active students',
    fee: 'Standard fee (EGP)',
    expected: 'Expected tuition (EGP)',
    collected: 'Collected tuition (EGP)',
    books: 'Book income (EGP)', totalIncome: 'Total income (EGP)',
    remaining: 'Remaining tuition (EGP)'
  },
  tuition: {
    student: 'Student',
    registration: 'Registration number',
    englishName: 'English name', mobile: 'Mobile', dateOfBirth: 'Date of birth', nationality: 'Nationality', placeOfBirth: 'Place of birth', paymentMethods: 'Payment methods', receiptNumbers: 'رقم الحافظة',
    course: 'Cycle',
    courseName: 'Course',
    courseCode: 'Course code',
    cycleNumber: 'Cycle number',
    branch: 'Branch',
    enrolledAt: 'Enrolled on',
    fee: 'Applicable fee (EGP)',
    paid: 'Paid (EGP)',
    bookStatus: 'Book status', bookPaid: 'Book payment (EGP)', bookPaidAt: 'Book payment recorded on',
    remaining: 'Remaining (EGP)',
    status: 'Tuition status',
    recordStatus: 'Record status'
  },
  payroll: {
    course: 'Cycle',
    courseName: 'Course',
    courseCode: 'Course code',
    cycleNumber: 'Cycle number',
    branch: 'Branch',
    instructor: 'Employee',
    employeeId: 'Employee ID',
    recordedAt: 'Earnings recorded on',
    initiatedDate: 'Payment initiated on',
    actualPaymentDate: 'Actually paid on',
    batchId: 'Payment batch',
    initiatedBy: 'Initiated by',
    paidBy: 'Payment confirmed by',
    hours: 'Hours taught',
    rate: 'Hourly rate (EGP)',
    earned: 'Earned (EGP)',
    status: 'Payroll status'
  }
};
export const managerRole = user => ['admin', 'mod'].includes(user.role);
export const allowedSheets = user => managerRole(user) ? EXPORT_COLUMNS : {
  courses: EXPORT_COLUMNS.courses,
  tuition: EXPORT_COLUMNS.tuition
};
const money = n => Math.round(Number(n || 0) * 100) / 100;
const day = date => date ? new Date(date).toISOString().slice(0, 10) : '';
const within = (date, filters, monthly = false) => {
  const value = monthly ? date : day(date);
  return (!filters.from || value && value >= (monthly ? filters.from.slice(0, 7) : filters.from)) && (!filters.to || value && value <= (monthly ? filters.to.slice(0, 7) : filters.to));
};
const tuitionStatus = (fee, paid) => fee === 0 ? 'EXEMPT' : paid >= fee ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
export function buildExport(courses, user, selection, filters) {
  const manager = managerRole(user);
  const rows = {
    courses: [],
    tuition: [],
    payroll: []
  };
  for (const c of courses) {
    if (filters.parentCourseId && c.parentCourseId !== filters.parentCourseId) continue;
    if (!filters.includeArchived && c.archivedAt || filters.courseId && c.id !== filters.courseId) continue;
    const financial = c.enrollments.filter(e => !e.financialArchivedAt);
    const visible = e => manager || !e.student.deletedAt && !e.deletedAt && !e.financialArchivedAt;
    const expected = money(financial.reduce((sum, e) => sum + (e.customFee ?? c.courseFee), 0));
    const collected = money((c.retainedIncome||[]).reduce((sum,row)=>sum+Number(row.tuitionMinor)/100,0)+financial.reduce((sum, e) => sum + e.amountPaid, 0));
    const bookIncome = money((c.retainedIncome||[]).reduce((sum,row)=>sum+Number(row.bookMinor)/100,0)+financial.reduce((sum,e) => sum + (e.bookPayments || []).filter(p=>p.status === 'PAID').reduce((n,p)=>n+Number(p.amountMinor)/100,0),0));
    const remaining = money(financial.reduce((sum, e) => sum + Math.max(0, money((e.customFee ?? c.courseFee) - e.amountPaid)), 0));
    if ((!filters.branch || c.branch === filters.branch) && within(c.startDate || c.createdAt, filters) && (!filters.tuitionStatus || financial.some(e => visible(e) && tuitionStatus(e.customFee ?? c.courseFee, e.amountPaid) === filters.tuitionStatus))) rows.courses.push({
      course: privateLabel(c.name,c.parentCourse?.isPrivate), courseName: privateLabel(c.parentCourse?.name || c.name,c.parentCourse?.isPrivate), courseCode: c.parentCourse?.code || '', cycleNumber: c.cycleNumber,
      branch: c.branch,
      venue: c.venue || '', classStartTime: c.classStartTime || '', classEndTime: c.classEndTime || '',
      startDate: day(c.startDate),
      endDate: day(c.endDate),
      status: c.archivedAt ? 'ARCHIVED' : c.isFinished ? 'FINISHED' : 'ACTIVE',
      students: c.enrollments.filter(e => visible(e) && !e.deletedAt && !e.student.deletedAt).length,
      fee: c.courseFee,
      expected,
      collected, books: bookIncome, totalIncome: money(collected + bookIncome),
      remaining
    });
    for (const e of c.enrollments) {
      if (filters.branch && c.branch !== filters.branch || !visible(e) || !filters.includeArchived && e.financialArchivedAt || !within(e.enrolledAt, filters)) continue;
      const fee = e.customFee ?? c.courseFee,
        status = tuitionStatus(fee, e.amountPaid);
      if (filters.tuitionStatus && status !== filters.tuitionStatus) continue;
      rows.tuition.push({
        student: e.student.name,
        registration: e.student.registrationNumber,
        englishName: e.student.englishName || '', mobile: e.student.mobile || '', dateOfBirth: day(e.student.dateOfBirth), nationality: e.student.nationality || '', placeOfBirth: e.student.placeOfBirth || '',
        paymentMethods: [...new Set((e.payments || []).filter(p => p.kind === 'PAYMENT' && !p.reversal).map(p => p.paymentMethod || 'UNSPECIFIED'))].join(', '),
        receiptNumbers: [...new Set((e.payments || []).filter(p => p.kind === 'PAYMENT' && !p.reversal && p.receiptNumber).map(p => p.receiptNumber))].join(', '),
        course: privateLabel(c.name,c.parentCourse?.isPrivate), courseName: privateLabel(c.parentCourse?.name || c.name,c.parentCourse?.isPrivate), courseCode: c.parentCourse?.code || '', cycleNumber: c.cycleNumber,
        branch: c.branch,
        enrolledAt: day(e.enrolledAt),
        fee,
        paid: e.amountPaid,
        bookStatus: e.bookPayments?.[0]?.status || 'UNPAID', bookPaid: e.bookPayments?.[0]?.status === 'PAID' ? Number(e.bookPayments[0].amountMinor)/100 : 0, bookPaidAt: day(e.bookPayments?.[0]?.recordedAt),
        remaining: Math.max(0, money(fee - e.amountPaid)),
        status,
        recordStatus: e.financialArchivedAt ? 'FINANCES ARCHIVED - EXCLUDED FROM TOTALS' : e.deletedAt || e.student.deletedAt ? 'REMOVED - FINANCES RETAINED' : 'ACTIVE'
      });
    }
    if (manager) for (const earning of c.payrollEarnings || []) {
      const status = earning.batch?.status || 'UNPAID';
      const date = filters.payrollDateBasis === 'initiatedDate' ? earning.batch?.initiatedDate : filters.payrollDateBasis === 'actualPaymentDate' ? earning.batch?.actualPaymentDate : earning.createdAt;
      if (filters.branch && earning.branch !== filters.branch || filters.payrollStatus && status !== filters.payrollStatus || !within(date, filters)) continue;
      rows.payroll.push({ course: privateLabel(earning.cycleName,earning.isPrivate), courseName: privateLabel(c.parentCourse?.name || '',c.parentCourse?.isPrivate), courseCode: c.parentCourse?.code || '', cycleNumber: c.cycleNumber,
        branch: earning.branch, instructor: earning.instructorName, employeeId: earning.employeeId || '',
        recordedAt: day(earning.createdAt), initiatedDate: day(earning.batch?.initiatedDate), actualPaymentDate: day(earning.batch?.actualPaymentDate), batchId: earning.batchId || '', initiatedBy: earning.batch?.initiatedBy || '', paidBy: earning.batch?.paidBy || '',
        hours: earning.hours, rate: earning.rate, earned: Number(earning.amountMinor) / 100, status });
    }
  }
  return Object.entries(selection).map(([key, columns]) => ({
    key,
    columns: columns.map(column => ({
      key: column,
      label: EXPORT_COLUMNS[key][column]
    })),
    rows: rows[key].map(row => Object.fromEntries(columns.map(column => [column, row[column]])))
  }));
}
