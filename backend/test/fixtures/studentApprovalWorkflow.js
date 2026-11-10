import assert from 'node:assert/strict';
import express from 'express';
import service from '../../src/vercel.js';
import prisma from '../../src/db/prisma.js';
const outer = express();
outer.use(service);
const server = outer.listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/api`;
let token;
async function req(path, method = 'GET', body, auth = token) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth
        ? {
            Authorization: 'Bearer ' + auth
          }
        : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return {
    status: response.status,
    data: await response.json()
  };
}
const ok = response => {
  assert(response.status < 300, JSON.stringify(response));
  return response.data;
};
try {
  token = ok(await req('/auth/login', 'POST', { username: 'main-admin', password: 'IsolatedDemoTest!123' })).token;
  const junior = ok(await req('/auth/login', 'POST', { username: 'Joe', password: 'IsolatedDemoTest!123' })).token;
  const moderator = await prisma.user.findFirst({ where: { role: 'mod' } });
  const jwt = (await import('jsonwebtoken')).default;
  const modToken = jwt.sign({ id: moderator.id }, process.env.JWT_SECRET);
  const studentPayload = {
    name: 'طالب تجربة الموافقة',
    registrationNumber: 'APPROVAL-001',
    dateOfBirth: '2000-01-02',
    nationality: 'مصري'
  };
  // Users only view: they cannot add, edit, enroll, change books, remove or export.
  assert.equal((await req('/students', 'POST', studentPayload, junior)).status, 403);
  const addition = ok(await req('/students', 'POST', studentPayload));
  assert(addition.id);
  assert.equal((await req('/students/' + addition.id, 'PUT', { name: 'تعديل' }, junior)).status, 403);
  assert.equal(
    ok(await req('/students?search=' + encodeURIComponent('طالب تجربة'), 'GET', undefined, junior)).total,
    1
  );
  assert.equal(await prisma.student.count({ where: { registrationNumber: studentPayload.registrationNumber } }), 1);
  let student = await prisma.student.findUnique({ where: { registrationNumber: studentPayload.registrationNumber } });
  assert(student);
  assert.equal(student.nationality, studentPayload.nationality);
  const cycle = ok(
    await req('/cycles', 'POST', {
      parentCourseId: 'course-ket',
      cycleNumber: 4,
      branch: 'MIAMI',
      totalHours: 10,
      courseFee: 1000,
      startDate: '2026-12-01'
    })
  );
  const enrollPath = '/cycles/' + cycle.id + '/enrollments';
  const paymentBody = {
    studentId: student.id,
    recordPayment: true,
    amountPaid: 1000,
    paymentMethod: 'CASH',
    receiptNumber: '12345'
  };
  assert.equal((await req(enrollPath, 'POST', paymentBody, junior)).status, 403);
  const enrollment = ok(await req(enrollPath, 'POST', paymentBody));
  assert.equal(enrollment.amountPaid, 1000);
  assert.equal(await prisma.enrollment.count({ where: { courseId: cycle.id } }), 1);
  assert.equal(await prisma.paymentEntry.count({ where: { courseId: cycle.id } }), 1);
  assert.equal(
    (await req(enrollPath + '/' + enrollment.id + '/books', 'POST', { status: 'EXEMPT' }, junior)).status,
    403
  );
  assert.equal((await req('/exports/options', 'GET', undefined, junior)).status, 403);
  // Users see each student's amounts in a cycle, but not the cycle's totals.
  const viewed = ok(await req('/cycles/' + cycle.id, 'GET', undefined, junior));
  assert.equal(viewed.enrollments[0].amountPaid, 1000);
  assert.equal(viewed.totalCollectedRevenue, undefined);
  assert.equal(viewed.totalIncome, undefined);
  assert.equal(ok(await req('/cycles/' + cycle.id)).totalCollectedRevenue, 1000);
  assert.equal(
    (await req(enrollPath + '/' + enrollment.id, 'DELETE', { confirm: true, mode: 'KEEP' }, junior)).status,
    403
  );
  ok(
    await req(enrollPath + '/' + enrollment.id, 'DELETE', {
      confirm: true,
      mode: 'KEEP',
      reason: 'Withdrawal, income retained'
    })
  );
  assert.equal(await prisma.enrollment.findUnique({ where: { id: enrollment.id } }), null);
  assert.equal(
    (await prisma.retainedEnrollmentIncome.findUnique({ where: { sourceEnrollmentId: enrollment.id } })).tuitionMinor,
    100000n
  );
  assert.equal(
    (await req('/students/' + student.id, 'DELETE', { confirm: true, keepFinancialRecords: true }, junior)).status,
    403
  );
  ok(await req('/students/' + student.id, 'DELETE', { confirm: true, keepFinancialRecords: true }));
  assert((await prisma.student.findUnique({ where: { id: student.id } })).deletedAt);
  assert.equal(await prisma.paymentEntry.count({ where: { studentId: student.id } }), 1);
  // Managers choose whether a deletion keeps the student's finances.
  const enrollFresh = async name => {
    const s = ok(await req('/students', 'POST', { name }));
    const e = ok(await req(enrollPath, 'POST', { studentId: s.id, recordPayment: true, amountPaid: 1000 }));
    return { s, e };
  };
  const single = await enrollFresh('طالب حذف فردي');
  ok(await req('/students/' + single.s.id, 'DELETE', { confirm: true, keepFinancialRecords: true }));
  assert.equal((await prisma.enrollment.findUnique({ where: { id: single.e.id } })).financialArchivedAt, null);
  const bulkB = await enrollFresh('طالب حذف جماعي ب');
  assert.equal((await req('/students/bulk-delete', 'POST', { ids: [bulkB.s.id], confirm: true }, junior)).status, 403);
  assert.equal(
    (await req('/students/bulk-delete', 'POST', { ids: [bulkB.s.id], keepFinancialRecords: false }, modToken)).status,
    400
  );
  assert.equal(
    ok(
      await req(
        '/students/bulk-delete',
        'POST',
        { ids: [bulkB.s.id], keepFinancialRecords: false, confirm: true },
        modToken
      )
    ).count,
    1
  );
  assert((await prisma.enrollment.findUnique({ where: { id: bulkB.e.id } })).financialArchivedAt);
  assert.equal((await req('/student-requests/anything', 'GET', undefined, modToken)).status, 404);
  assert.equal((await req('/imports/course-ket/preview', 'POST', {}, junior)).status, 403);
  assert.equal((await req('/imports/course-ket/commit', 'POST', {}, junior)).status, 403);
  console.log(
    'PASS: users view only (no adding, editing, enrolling, books, removal or exports; no cycle totals), manager removals and finance exclusion, retained income, junior import prevention.'
  );
} finally {
  server.closeAllConnections();
  await new Promise(r => server.close(r));
  await prisma.$disconnect();
}
