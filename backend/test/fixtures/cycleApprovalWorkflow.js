import assert from 'node:assert/strict';
import express from 'express';
import service from '../../src/vercel.js';
import prisma from '../../src/db/prisma.js';
const app = express();
app.use(service);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function req(path, method = 'GET', body, auth) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}
const ok = r => {
  assert(r.status < 300, JSON.stringify(r.data));
  return r.data;
};
const login = async (username, password = 'IsolatedDemoTest!123') =>
  ok(await req('/auth/login', 'POST', { username, password })).token;
try {
  const main = await login('Youssef Wael');
  ok(
    await req(
      '/auth/register',
      'POST',
      { username: 'miami-mod', password: 'MiamiModTest!123', role: 'mod', branchScope: 'MIAMI' },
      main
    )
  );
  const miami = await login('miami-mod', 'MiamiModTest!123');

  // 1. Exam umbrellas run cycles without a level; others still need one.
  const plain = ok(
    await req(
      '/cycles',
      'POST',
      { parentCourseId: 'course-ielts', branch: 'MIAMI', startDate: '2026-11-03', courseFee: 900 },
      main
    )
  );
  assert.equal(plain.name, 'IELTS - November 2026');
  assert.equal(plain.cycleNumber, null);
  assert.equal(plain.approvalStatus, 'APPROVED', 'the main mod’s cycles need no approval');
  const second = ok(
    await req('/cycles', 'POST', { parentCourseId: 'course-ielts', branch: 'MIAMI', startDate: '2026-11-20' }, main)
  );
  assert.equal(second.name, 'IELTS - November 2026 (2)');
  const levelled = ok(
    await req(
      '/cycles',
      'POST',
      { parentCourseId: 'course-ielts', cycleNumber: 2, branch: 'MIAMI', startDate: '2026-11-03' },
      main
    )
  );
  assert.equal(levelled.name, 'IELTS 2 - November 2026', 'a level can still be given');
  const noLevel = await req('/cycles', 'POST', { parentCourseId: 'course-ket', branch: 'MIAMI', startDate: '2026-11-03' }, main);
  assert.equal(noLevel.status, 400);
  assert.match(noLevel.data.error, /Level/);
  // Removing the level of an exam cycle renames it.
  const renamed = ok(await req(`/cycles/${levelled.id}`, 'PUT', { cycleNumber: '' }, main));
  assert.equal(renamed.name, 'IELTS - November 2026 (3)');

  // 2. A branch mod's new cycle waits for approval; the main mod is told.
  const pending = ok(
    await req(
      '/cycles',
      'POST',
      { parentCourseId: 'course-ielts', branch: 'MIAMI', startDate: '2026-12-01', courseFee: 800 },
      miami
    )
  );
  assert.equal(pending.approvalStatus, 'PENDING');
  const mainUser = await prisma.user.findUnique({ where: { username: 'Youssef Wael' } });
  const inbox = ok(await req('/notifications/history', 'GET', undefined, main)).items;
  const request = inbox.find(n => n.relatedId === pending.id);
  assert(request && request.action === 'CYCLE' && request.status === 'PENDING', JSON.stringify(request));
  assert(ok(await req('/attention', 'GET', undefined, main)).cyclesToApprove >= 1);
  const listed = ok(await req('/cycles?status=pending&parentCourseId=course-ielts', 'GET', undefined, main));
  assert(listed.rows.some(r => r.id === pending.id), 'pending cycles show under Pending');
  // While pending, the branch mod keeps working on it (edit, enroll).
  ok(await req(`/cycles/${pending.id}`, 'PUT', { venue: 'Room 4' }, miami));
  ok(
    await req(
      `/cycles/${pending.id}/enrollments`,
      'POST',
      { studentId: 'demo-student-1', tuitionType: 'FULL', recordPayment: true, amountPaid: 800, paymentMethod: 'CASH' },
      miami
    )
  );
  // Only admins and the main mod decide.
  assert.equal((await req(`/cycles/${pending.id}/approve`, 'POST', {}, miami)).status, 403);
  // The main mod may fix details before approving.
  ok(await req(`/cycles/${pending.id}`, 'PUT', { courseFee: 850 }, main));
  ok(await req(`/cycles/${pending.id}/approve`, 'POST', {}, main));
  assert.equal((await req(`/cycles/${pending.id}/approve`, 'POST', {}, main)).status, 409);
  // 3. Approved: the cycle's details are locked for the branch mod at once (no edit, no archive, no delete)...
  const locked = await req(`/cycles/${pending.id}`, 'PUT', { venue: 'Room 9' }, miami);
  assert.equal(locked.status, 403);
  assert.match(locked.data.error, /approved/);
  assert.equal((await req(`/cycles/${pending.id}`, 'DELETE', undefined, miami)).status, 403);
  assert.equal((await req(`/cycles/${pending.id}/permanent`, 'DELETE', undefined, miami)).status, 403);
  let view = ok(await req(`/cycles/${pending.id}`, 'GET', undefined, miami));
  assert.match(view.lockedReason, /approved/);
  assert.equal(view.studentsLockedReason, null);
  // ...but its students stay open: new students can still join and pay.
  const late = ok(
    await req(
      `/cycles/${pending.id}/enrollments`,
      'POST',
      { newStudent: { name: 'طالب متأخر', mobile: '01077700077' }, tuitionType: 'FULL', recordPayment: true, amountPaid: 850, paymentMethod: 'CASH' },
      miami
    )
  );
  assert(late);
  // Once the main mod checks money in the cycle, its students lock too.
  const checks = ok(await req('/finances/checks?branch=MIAMI', 'GET', undefined, main));
  const paid = checks.items.find(i => i.kind === 'PAYMENT' && i.cycleId === pending.id);
  assert(paid, 'the payment is waiting to be checked');
  ok(await req('/finances/checks', 'POST', { branch: 'MIAMI', items: [{ kind: 'PAYMENT', id: paid.id }] }, main));
  const shut = await req(
    `/cycles/${pending.id}/enrollments`,
    'POST',
    { studentId: 'demo-student-3', tuitionType: 'EXEMPT' },
    miami
  );
  assert.equal(shut.status, 403);
  assert.match(shut.data.error, /checked money/);
  view = ok(await req(`/cycles/${pending.id}`, 'GET', undefined, miami));
  assert.match(view.studentsLockedReason, /checked money/);
  const told = ok(await req('/notifications/history', 'GET', undefined, miami)).items;
  assert(told.some(n => n.type === 'CYCLE_APPROVED' && n.relatedId === pending.id && n.status === 'APPROVED'));
  assert(
    (await prisma.notification.findFirst({ where: { userId: mainUser.id, relatedId: pending.id } })).isResolved,
    'the request is marked resolved for the main mod'
  );

  // 4. Rejected: archived, with the reason sent to the branch mod; only managers bring it back (approving it).
  const wrong = ok(
    await req('/cycles', 'POST', { parentCourseId: 'course-ket', cycleNumber: 1, branch: 'MIAMI', startDate: '2026-12-02' }, miami)
  );
  ok(await req(`/cycles/${wrong.id}/reject`, 'POST', { reason: 'Duplicate of KET 1' }, main));
  const rejected = await prisma.cycle.findUnique({ where: { id: wrong.id } });
  assert(rejected.archivedAt && rejected.approvalStatus === 'REJECTED' && rejected.rejectionReason === 'Duplicate of KET 1');
  const news = ok(await req('/notifications/history?status=REJECTED', 'GET', undefined, miami)).items;
  assert(news.some(n => n.relatedId === wrong.id && /Duplicate of KET 1/.test(n.message)));
  assert.equal((await req(`/cycles/${wrong.id}/restore`, 'POST', {}, miami)).status, 403);
  ok(await req(`/cycles/${wrong.id}/restore`, 'POST', {}, main));
  assert.equal((await prisma.cycle.findUnique({ where: { id: wrong.id } })).approvalStatus, 'APPROVED');

  console.log('PASS: numberless exam cycles; branch mod cycles pending until approved (details lock) or rejected; students lock on money check');
} finally {
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
