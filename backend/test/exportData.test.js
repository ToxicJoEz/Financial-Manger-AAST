import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_COLUMNS, allowedSheets, buildExport } from '../src/utils/exportData.js';
const user = {
    role: 'user'
  },
  admin = {
    role: 'admin'
  };
const enrollment = (extra = {}) => ({
  amountPaid: 250,
  customFee: null,
  enrolledAt: '2026-10-10T00:00:00Z',
  student: {
    name: '=SUM(A1)',
    registrationNumber: 'عربي-1',
    deletedAt: null
  },
  ...extra
});
const course = () => ({
  id: 'c',
  name: 'Arabic العربية',
  branch: 'MIAMI',
  startDate: '2026-10-01',
  endDate: null,
  courseFee: 1000,
  isFinished: false,
  archivedAt: null,
  enrollments: [enrollment()],
  payrollEarnings: [{ cycleName: 'Historical course', branch: 'FOUAD', instructorName: 'Teacher', employeeId: '', hours: 10, rate: 100, amountMinor: 100000n, createdAt: '2026-09-16', batchId: 'batch', batch: { status: 'PAID', initiatedDate: '2026-09-17', actualPaymentDate: '2026-09-19', initiatedBy: 'admin', paidBy: 'mod' } }]
});
test('junior schema never offers instructor payroll', () => {
  assert(!Object.hasOwn(allowedSheets(user), 'payroll'));
  const result = buildExport([course()], user, {
    courses: ['course', 'collected'],
    tuition: ['student', 'paid']
  }, {});
  assert.deepEqual(Object.keys(result[0].rows[0]), ['course', 'collected']);
  assert(!JSON.stringify(result).includes('Teacher'));
  assert.equal(result[1].rows[0].student, '=SUM(A1)');
});
test('retained removed finances count but junior identities remain hidden', () => {
  const c = course();
  c.enrollments.push(enrollment({
    student: {
      name: 'Deleted person',
      deletedAt: '2026-10-11'
    },
    amountPaid: 500
  }));
  const result = buildExport([c], user, {
    courses: ['expected', 'collected', 'students'],
    tuition: ['student']
  }, {});
  assert.deepEqual(result[0].rows[0], {
    expected: 2000,
    collected: 750,
    students: 1
  });
  assert.equal(result[1].rows.length, 1);
});
test('archived finances excluded from totals, explicit manager export labels them', () => {
  const c = course();
  c.enrollments[0].financialArchivedAt = '2026-10-11';
  assert.equal(buildExport([c], admin, {
    tuition: ['student']
  }, {})[0].rows.length, 0);
  const result = buildExport([c], admin, {
    courses: ['collected'],
    tuition: ['recordStatus']
  }, {
    includeArchived: true
  });
  assert.equal(result[0].rows[0].collected, 0);
  assert.match(result[1].rows[0].recordStatus, /EXCLUDED/);
});
test('reopened payroll exports snapshot name, branch, hours, rates and payment dates', () => {
  const result = buildExport([course()], admin, {
    payroll: Object.keys(EXPORT_COLUMNS.payroll)
  }, {
    branch: 'FOUAD',
    from: '2026-09-15',
    to: '2026-09-20'
  });
  assert.equal(result[0].rows[0].course, 'Historical course');
  assert.equal(result[0].rows[0].earned, 1000);
  assert.equal(result[0].rows[0].status, 'PAID');
});
test('date range boundaries and payment filters use their documented basis', () => {
  assert.equal(buildExport([course()], admin, {
    tuition: ['paid']
  }, {
    from: '2026-10-10',
    to: '2026-10-10',
    tuitionStatus: 'PARTIAL'
  })[0].rows.length, 1);
  assert.equal(buildExport([course()], admin, {
    tuition: ['paid']
  }, {
    from: '2026-10-11'
  })[0].rows.length, 0);
  assert.equal(buildExport([course()], admin, {
    payroll: ['earned']
  }, {
    payrollStatus: 'UNPAID'
  })[0].rows.length, 0);
});
test('archived courses excluded by default', () => {
  const c = course();
  c.archivedAt = '2026-10-11';
  assert.equal(buildExport([c], admin, {
    courses: ['course']
  }, {})[0].rows.length, 0);
  assert.equal(buildExport([c], admin, {
    courses: ['course']
  }, {
    includeArchived: true
  })[0].rows.length, 1);
});

test('missing course start dates use creation date without inventing a start date', () => {
  const c = course();
  c.startDate = null;
  c.createdAt = '2026-10-05T10:26:11.605Z';
  const selection = { courses: ['startDate', 'collected'] };
  const rows = buildExport([c], admin, selection, { from: '2026-10-01', to: '2026-10-31' })[0].rows;
  assert.deepEqual(rows, [{ startDate: '', collected: 250 }]);
  assert.equal(buildExport([c], admin, selection, { from: '2026-11-01', to: '2026-11-30' })[0].rows.length, 0);
  c.startDate = '2026-09-15';
  assert.equal(buildExport([c], admin, selection, { from: '2026-10-01', to: '2026-10-31' })[0].rows.length, 0);
});
