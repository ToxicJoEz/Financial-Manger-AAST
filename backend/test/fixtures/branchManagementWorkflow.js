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
  const admin = await login('main-admin'),
    main = await login('Youssef Wael'),
    user = await login('Joe');
  // Everyone reads branches; only admins and the main mod change them.
  assert.equal(ok(await req('/branches', 'GET', undefined, user)).filter(b => b.active).length, 7);
  assert.equal((await req('/branches', 'POST', { name: 'Nasr City' }, user)).status, 403);
  const nasr = ok(await req('/branches', 'POST', { name: 'Nasr City', color: '#4f46e5' }, main));
  assert.equal(nasr.code, 'NASR-CITY');
  assert.equal((await req('/branches', 'POST', { name: 'nasr city' }, main)).status, 409);
  ok(await req('/branches/NASR-CITY', 'PUT', { name: 'Nasr City East', color: '#0f766e' }, main));
  // The new branch works everywhere at once: umbrellas, cycles, branch mods, users.
  ok(await req('/courses/course-ket/branches', 'PUT', { branches: ['MIAMI', 'NASR-CITY'] }, main));
  const cycle = ok(
    await req(
      '/cycles',
      'POST',
      { parentCourseId: 'course-ket', cycleNumber: 1, branch: 'NASR-CITY', startDate: '2026-11-03', courseFee: 1000 },
      main
    )
  );
  ok(
    await req(
      `/cycles/${cycle.id}/enrollments`,
      'POST',
      {
        studentId: 'demo-student-1',
        tuitionType: 'FULL',
        recordPayment: true,
        amountPaid: 1000,
        paymentMethod: 'CASH'
      },
      main
    )
  );
  const mod = ok(
    await req(
      '/auth/register',
      'POST',
      { username: 'nasr-mod', password: 'NasrModTest!123', role: 'mod', branchScope: 'NASR-CITY' },
      main
    )
  );
  const joe = await prisma.user.findUnique({ where: { username: 'Joe' } });
  ok(await req(`/users/${joe.id}/branches`, 'PUT', { branches: ['MIAMI', 'NASR-CITY'] }, main));
  // Impact, then delete keeping the data: everything is renamed NASR-CITY-DELETED and kept as history.
  const impact = ok(await req('/branches/NASR-CITY/impact', 'GET', undefined, main));
  assert.equal(impact.cycles, 1);
  assert.deepEqual(impact.branchMods, ['nasr-mod']);
  assert.equal((await req('/branches/NASR-CITY', 'DELETE', { mode: 'KEEP' }, main)).status, 400);
  ok(await req('/branches/NASR-CITY', 'DELETE', { mode: 'KEEP', confirm: true }, main));
  assert.equal((await prisma.cycle.findUnique({ where: { id: cycle.id } })).branch, 'NASR-CITY-DELETED');
  assert.equal(await prisma.enrollment.count({ where: { courseId: cycle.id } }), 1);
  assert.equal((await prisma.course.findUnique({ where: { id: 'course-ket' } })).branches, 'MIAMI');
  const bannedMod = await prisma.user.findUnique({ where: { id: mod.user.id } });
  assert(bannedMod.isBanned && bannedMod.branchScope === 'NASR-CITY-DELETED');
  assert.equal((await prisma.user.findUnique({ where: { id: joe.id } })).branches, 'MIAMI');
  const list = ok(await req('/branches', 'GET', undefined, admin));
  assert(list.some(b => b.code === 'NASR-CITY-DELETED' && !b.active));
  assert(!list.some(b => b.code === 'NASR-CITY'));
  // Nothing new goes into a deleted branch; its data stays visible to managers.
  assert.equal(
    (
      await req(
        '/cycles',
        'POST',
        {
          parentCourseId: 'course-ket',
          cycleNumber: 2,
          branch: 'NASR-CITY-DELETED',
          startDate: '2026-11-04',
          courseFee: 1
        },
        main
      )
    ).status,
    409
  );
  assert(ok(await req('/cycles?branch=NASR-CITY-DELETED', 'GET', undefined, main)).rows.some(r => r.id === cycle.id));
  // Delete everything: cycles, enrollments, payments and students who studied only there.
  ok(await req('/branches', 'POST', { name: 'Tagamoa' }, admin));
  ok(await req('/courses/course-pet/branches', 'PUT', { branches: ['MIAMI', 'TAGAMOA'] }, admin));
  const gone = ok(
    await req(
      '/cycles',
      'POST',
      { parentCourseId: 'course-pet', cycleNumber: 1, branch: 'TAGAMOA', startDate: '2026-11-05', courseFee: 500 },
      admin
    )
  );
  ok(
    await req(
      `/cycles/${gone.id}/enrollments`,
      'POST',
      {
        newStudent: { name: 'طالب التجمع فقط', mobile: '01088800088' },
        tuitionType: 'FULL',
        recordPayment: true,
        amountPaid: 500,
        paymentMethod: 'CASH'
      },
      admin
    )
  );
  ok(
    await req(`/cycles/${gone.id}/enrollments`, 'POST', { studentId: 'demo-student-2', tuitionType: 'EXEMPT' }, admin)
  );
  ok(await req('/branches/TAGAMOA', 'DELETE', { mode: 'DELETE_DATA', confirm: true }, admin));
  assert.equal(await prisma.cycle.findUnique({ where: { id: gone.id } }), null);
  assert.equal(await prisma.paymentEntry.count({ where: { courseId: gone.id } }), 0);
  assert.equal(
    await prisma.student.count({ where: { mobile: '01088800088' } }),
    0,
    'student only in that branch is removed'
  );
  assert(await prisma.student.findUnique({ where: { id: 'demo-student-2' } }), 'students with other cycles stay');
  assert(!ok(await req('/branches', 'GET', undefined, admin)).some(b => b.code.startsWith('TAGAMOA')));
  // Deleting everything is refused while employee earnings are in payment batches.
  const earning = await prisma.payrollEarning.findFirst({
    where: { batchId: { not: null } },
    include: { course: true }
  });
  const locked = earning.course.branch;
  const refused = await req(`/branches/${locked}`, 'DELETE', { mode: 'DELETE_DATA', confirm: true }, admin);
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /payment batches/);
  assert(await prisma.cycle.findUnique({ where: { id: earning.courseId } }));
  console.log(
    'PASS: branches added, renamed and deleted (keep as history or delete all), with refusals and permissions'
  );
} finally {
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
