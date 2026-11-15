import test from 'node:test';
import assert from 'node:assert/strict';
import { intoStorage, fromStorage } from '../src/db/moneyStorage.js';

test('Money goes into the database as whole piasters and comes back as EGP', () => {
  const args = {
    data: { courseFee: 2400.5, enrollments: { create: [{ amountPaid: 0.1 + 0.2, customFee: null }] } },
    where: { amountPaid: { gt: 0, in: [10, 19.99] }, courseFee: { multiply: 2 } },
    // JSON columns and non-money fields are untouched.
    details: { courseFee: 5 },
    totalHours: 12.5
  };
  const stored = intoStorage(args);
  assert.equal(stored.data.courseFee, 240050);
  assert.equal(stored.data.enrollments.create[0].amountPaid, 30);
  assert.equal(stored.data.enrollments.create[0].customFee, null);
  assert.deepEqual(stored.where.amountPaid, { gt: 0, in: [1000, 1999] });
  assert.deepEqual(stored.where.courseFee, { multiply: 2 });
  assert.deepEqual(stored.details, { courseFee: 5 });
  assert.equal(stored.totalHours, 12.5);
  const read = fromStorage({
    courseFee: 240050,
    _sum: { amountPaid: 1999 },
    snapshot: { amountPaid: 7 },
    list: [{ rate: 15000 }]
  });
  assert.deepEqual(read, {
    courseFee: 2400.5,
    _sum: { amountPaid: 19.99 },
    snapshot: { amountPaid: 7 },
    list: [{ rate: 150 }]
  });
  assert(Number.isInteger(intoStorage({ hourlyRate: 1234.56 }).hourlyRate));
});
