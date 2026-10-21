import test from 'node:test';
import assert from 'node:assert/strict';
import { incomeReport } from '../src/utils/incomeData.js';
test('Income uses actual payments, excludes archived finances and keeps retained removed finances', () => {
  const report = incomeReport([{
    id: 'cycle',
    parentCourseId: 'course',
    name: 'KET 1',
    parentCourse: {
      code: 'KET'
    },
    branch: 'MIAMI',
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-12-01'),
    archivedAt: new Date(),
    courseFee: 1000,
    enrollments: [{
      amountPaid: 1000
    }, {
      amountPaid: 500,
      deletedAt: new Date()
    }, {
      amountPaid: 0
    }, {
      amountPaid: 1000,
      financialArchivedAt: new Date()
    }]
  }]);
  assert.deepEqual(report.summary, {
    tuition: 1500, books: 0, income: 1500,
    cycles: 1,
    students: 3,
    full: 1,
    discounted: 1,
    exempt: 1
  });
  assert.equal(report.branches[0].income, 1500);
  assert.equal(report.cycles[0].income, 1500);
});

test('Book income uses saved purchases and excludes financially archived enrollments', () => {
  const cycle = { id: 'c', parentCourseId: 'p', name: 'KET 1', parentCourse: { code: 'KET' }, branch: 'MIAMI', courseFee: 1000,
    enrollments: [{ amountPaid: 1000, bookPayments: [{amountMinor:100000n}] }, { amountPaid: 1000, deletedAt: new Date(), bookPayments: [{amountMinor:150000n}] }, { amountPaid: 1000, financialArchivedAt: new Date(), bookPayments: [{amountMinor:999999n}] }] };
  const report = incomeReport([cycle]);
  assert.equal(report.summary.tuition, 2000); assert.equal(report.summary.books, 2500); assert.equal(report.summary.income, 4500);
  assert.equal(report.cycles[0].books, 2500); assert.equal(report.branches[0].income, 4500);
});
