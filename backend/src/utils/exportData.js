export const EXPORT_COLUMNS = {
  courses: {
    course: 'Course',
    branch: 'Branch',
    startDate: 'Start date',
    endDate: 'End date',
    status: 'Course status',
    students: 'Active students',
    fee: 'Standard fee (EGP)',
    expected: 'Expected tuition (EGP)',
    collected: 'Collected tuition (EGP)',
    remaining: 'Remaining tuition (EGP)'
  },
  tuition: {
    student: 'Student',
    registration: 'Registration number',
    course: 'Course',
    branch: 'Branch',
    enrolledAt: 'Enrolled on',
    fee: 'Applicable fee (EGP)',
    paid: 'Paid (EGP)',
    remaining: 'Remaining (EGP)',
    status: 'Tuition status',
    recordStatus: 'Record status'
  },
  payroll: {
    course: 'Course',
    branch: 'Branch',
    instructor: 'Instructor',
    employeeId: 'Employee ID',
    month: 'Payroll month',
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
    if (!filters.includeArchived && c.archivedAt || filters.courseId && c.id !== filters.courseId) continue;
    const financial = c.enrollments.filter(e => !e.financialArchivedAt);
    const visible = e => manager || !e.student.deletedAt && !e.deletedAt && !e.financialArchivedAt;
    const expected = money(financial.reduce((sum, e) => sum + (e.customFee ?? c.courseFee), 0));
    const collected = money(financial.reduce((sum, e) => sum + e.amountPaid, 0));
    const remaining = money(financial.reduce((sum, e) => sum + Math.max(0, money((e.customFee ?? c.courseFee) - e.amountPaid)), 0));
    if ((!filters.branch || c.branch === filters.branch) && within(c.startDate || c.createdAt, filters) && (!filters.tuitionStatus || financial.some(e => visible(e) && tuitionStatus(e.customFee ?? c.courseFee, e.amountPaid) === filters.tuitionStatus))) rows.courses.push({
      course: c.name,
      branch: c.branch,
      startDate: day(c.startDate),
      endDate: day(c.endDate),
      status: c.archivedAt ? 'ARCHIVED' : c.isFinished ? 'FINISHED' : 'ACTIVE',
      students: c.enrollments.filter(e => visible(e) && !e.deletedAt && !e.student.deletedAt).length,
      fee: c.courseFee,
      expected,
      collected,
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
        course: c.name,
        branch: c.branch,
        enrolledAt: day(e.enrolledAt),
        fee,
        paid: e.amountPaid,
        remaining: Math.max(0, money(fee - e.amountPaid)),
        status,
        recordStatus: e.financialArchivedAt ? 'FINANCES ARCHIVED - EXCLUDED FROM TOTALS' : e.deletedAt || e.student.deletedAt ? 'REMOVED - FINANCES RETAINED' : 'ACTIVE'
      });
    }
    const record = c.payrollRecord;
    if (manager && record && (!filters.branch || record.branch === filters.branch) && within(record.payrollMonth, filters, true) && (!filters.payrollStatus || (record.isPaid ? 'PAID' : 'UNPAID') === filters.payrollStatus)) {
      for (const i of JSON.parse(record.instructors)) rows.payroll.push({
        course: record.name,
        branch: record.branch,
        instructor: i.instructor?.name || 'Unknown',
        employeeId: i.instructor?.employeeId || '',
        month: record.payrollMonth || '',
        hours: i.hoursTaught || 0,
        rate: i.hourlyRate || 0,
        earned: money((i.hoursTaught || 0) * (i.hourlyRate || 0)),
        status: record.isPaid ? 'PAID' : 'UNPAID'
      });
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
