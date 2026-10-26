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
      ...(auth ? {
        Authorization: 'Bearer ' + auth
      } : {})
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
  const moderator = (await prisma.user.findFirst({ where: { role: 'mod' } }));
  const jwt = (await import('jsonwebtoken')).default;
  const modToken = jwt.sign({ id: moderator.id }, process.env.JWT_SECRET);
  const studentPayload = { name: 'طالب تجربة الموافقة', registrationNumber: 'APPROVAL-001', dateOfBirth: '2000-01-02', nationality: 'مصري' };
  const addition = ok(await req('/students', 'POST', studentPayload, junior));
  assert(addition.pending);
  assert.equal(await prisma.student.count({ where: { registrationNumber: studentPayload.registrationNumber } }), 0);
  assert.equal((await req('/students', 'POST', studentPayload, junior)).status, 409);
  assert.equal((await req('/student-requests/' + addition.requestId + '/approve', 'POST', {}, junior)).status, 403);
  ok(await req('/student-requests/' + addition.requestId + '/approve', 'POST', {}, modToken));
  let student = await prisma.student.findUnique({ where: { registrationNumber: studentPayload.registrationNumber } });
  assert(student); assert.equal(student.nationality, studentPayload.nationality);
  assert.equal((await req('/student-requests/' + addition.requestId + '/approve', 'POST')).status, 409);
  const rejected = ok(await req('/students', 'POST', { ...studentPayload, registrationNumber: 'APPROVAL-REJECT' }, junior));
  ok(await req('/student-requests/' + rejected.requestId + '/reject', 'POST'));
  assert.equal(await prisma.student.count({ where: { registrationNumber: 'APPROVAL-REJECT' } }), 0);
  const cycle = ok(await req('/cycles', 'POST', { parentCourseId: 'course-ket', cycleNumber: 9876543, branch: 'MIAMI', totalHours: 10, courseFee: 1000 }));
  const enrollPath = '/cycles/' + cycle.id + '/enrollments';
  const paymentBody = { studentId: student.id, recordPayment: true, amountPaid: 1000, paymentMethod: 'CASH', receiptNumber: '12345' };
  const enrollmentRequest = ok(await req(enrollPath, 'POST', paymentBody, junior));
  assert(enrollmentRequest.pending);
  assert.equal(await prisma.enrollment.count({ where: { courseId: cycle.id } }), 0);
  assert.equal(await prisma.paymentEntry.count({ where: { courseId: cycle.id } }), 0);
  ok(await req('/student-requests/' + enrollmentRequest.requestId + '/approve', 'POST'));
  const enrollment = await prisma.enrollment.findUnique({ where: { courseId_studentId: { courseId: cycle.id, studentId: student.id } } });
  assert.equal(enrollment.amountPaid, 1000);
  assert.equal(await prisma.paymentEntry.count({ where: { enrollmentId: enrollment.id } }), 1);
  assert.equal((await req(enrollPath+'/'+enrollment.id,'DELETE',{confirm:true},junior)).status,403);
  assert.equal((await req('/students/'+student.id,'DELETE',{confirm:true},junior)).status,403);
  ok(await req(enrollPath+'/'+enrollment.id,'DELETE',{confirm:true,mode:'KEEP',reason:'Withdrawal, income retained'},modToken));
  assert.equal(await prisma.enrollment.findUnique({where:{id:enrollment.id}}),null);
  assert.equal((await prisma.retainedEnrollmentIncome.findUnique({where:{sourceEnrollmentId:enrollment.id}})).tuitionMinor,100000n);
  ok(await req('/students/'+student.id+'/archive','POST',{},modToken));
  assert((await prisma.student.findUnique({where:{id:student.id}})).deletedAt);
  assert.equal(await prisma.paymentEntry.count({where:{studentId:student.id}}),1);
  assert.equal((await req('/imports/course-ket/preview', 'POST', {}, junior)).status, 403);
  assert.equal((await req('/imports/course-ket/commit', 'POST', {}, junior)).status, 403);
  const history = ok(await req('/notifications/history?status=APPROVED&action=ASSIGN'));
  assert(history.items.some(n => n.request?.kind === 'STUDENT'));
  assert(history.items.every(n => n.status === 'APPROVED' && n.action === 'ASSIGN'));
  console.log('PASS: student creation/enrollment/removal approvals, rejection, manager bypass, moderator approval, no pre-approval payments, retained ledger, duplicate/stale guards, junior import prohibition, notifications.');
} finally { server.closeAllConnections(); await new Promise(r => server.close(r)); await prisma.$disconnect(); }
