import assert from 'node:assert/strict';
import express from 'express';
import service from '../../src/vercel.js';
import prisma from '../../src/db/prisma.js';
const app = express();
app.use(service);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
let token;
async function req(path, method = 'GET', body, auth = token) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}
const ok = r => {
  assert(r.status < 300, JSON.stringify(r));
  return r.data;
};
const login = async (username, password) => ok(await req('/auth/login', 'POST', { username, password })).token;
try {
  token = await login('main-admin', 'IsolatedDemoTest!123');
  // An admin creates a mod and gives it the Fouad title.
  const created = ok(
    await req('/auth/register', 'POST', { username: 'fouad-mod', password: 'FouadModTest!123', role: 'mod' })
  );
  const mainMod = ok(
    await req('/auth/register', 'POST', { username: 'main-mod', password: 'MainModTest!123', role: 'mod' })
  );
  assert.equal((await req('/users/' + created.user.id + '/branch-scope', 'PUT', { branchScope: 'MIAMI' })).status, 400);
  ok(await req('/users/' + created.user.id + '/branch-scope', 'PUT', { branchScope: 'FOUAD' }));
  const fouad = await login('fouad-mod', 'FouadModTest!123');
  const main = await login('main-mod', 'MainModTest!123');
  assert.equal(
    (await req('/users/' + mainMod.user.id + '/branch-scope', 'PUT', { branchScope: 'FOUAD' }, main)).status,
    403
  );
  assert.equal(ok(await req('/auth/me', 'GET', undefined, fouad)).user.branchScope, 'FOUAD');

  // The Fouad mod has no payroll at all.
  assert.equal((await req('/finances', 'GET', undefined, fouad)).status, 403);
  assert.equal((await req('/finances/selected-payments', 'POST', {}, fouad)).status, 403);
  assert.equal((await req('/finances/return-to-processing', 'POST', {}, fouad)).status, 403);
  ok(await req('/finances/income?month=2026-10', 'GET', undefined, fouad));
  const overview = ok(await req('/finances/overview?year=2026', 'GET', undefined, fouad));
  assert(overview.income && !('payroll' in overview));
  assert('payroll' in ok(await req('/finances/overview?year=2026', 'GET', undefined, main)));
  const cycles = ok(await req('/cycles', 'GET', undefined, fouad));
  assert(!JSON.stringify(cycles).includes('hourlyRate'));
  assert(!JSON.stringify(cycles).includes('payrollEarnings'));
  assert(JSON.stringify(ok(await req('/cycles', 'GET', undefined, main))).includes('hourlyRate'));
  const options = ok(await req('/exports/options', 'GET', undefined, fouad));
  assert(!JSON.stringify(options).includes('Hourly rate'));
  assert.equal(ok(await req('/employees/demo-instructor-3/details', 'GET', undefined, fouad)).paidPayments.length, 0);
  assert(ok(await req('/employees/demo-instructor-3/details', 'GET', undefined, main)).paidPayments.length > 0);
  assert.equal((await req('/imports/course-ket/private/review', 'POST', {}, fouad)).status, 403);
  // Teaching-team changes need a rate, so the Fouad mod requests them; only payroll managers review.
  const request = ok(
    await req('/cycles/cycle-pet-1/instructors', 'POST', { instructorId: 'demo-instructor-1', hourlyRate: 999 }, fouad)
  );
  assert(request.pending);
  assert.equal((await req('/assignments/' + request.pending.id, 'GET', undefined, fouad)).status, 403);
  const fouadUser = await prisma.user.findUnique({ where: { username: 'fouad-mod' } });
  assert.equal(await prisma.notification.count({ where: { userId: fouadUser.id, relatedId: request.pending.id } }), 0);
  assert(await prisma.notification.count({ where: { userId: mainMod.user.id, relatedId: request.pending.id } }));
  ok(await req('/assignments/' + request.pending.id + '/approve', 'POST', { hourlyRate: 150 }, main));
  // Otherwise the Fouad mod works like any mod: e.g. creating a cycle and collecting tuition.
  const cycle = ok(
    await req(
      '/cycles',
      'POST',
      { parentCourseId: 'course-ket', cycleNumber: 7001, branch: 'FOUAD', courseFee: 1000, startDate: '2026-11-01' },
      fouad
    )
  );
  const enrollment = ok(
    await req(
      '/cycles/' + cycle.id + '/enrollments',
      'POST',
      {
        studentId: 'demo-student-8',
        recordPayment: true,
        amountPaid: 1000,
        paymentMethod: 'CASH',
        receiptNumber: 'F-100'
      },
      fouad
    )
  );
  await prisma.course.update({ where: { id: 'course-ket' }, data: { bookPrice: 200 } });
  ok(
    await req(
      '/cycles/' + cycle.id + '/enrollments/' + enrollment.id + '/books',
      'POST',
      { status: 'PAID', expectedPrice: 200 },
      fouad
    )
  );

  // Fouad money: everyone with management access can see it; only admins and the main mod mark it.
  let checks = ok(await req('/finances/checks?branch=FOUAD', 'GET', undefined, fouad));
  const tuition = checks.items.find(i => i.kind === 'PAYMENT' && i.receiptNumber === 'F-100');
  const book = checks.items.find(i => i.kind === 'BOOK' && i.cycleId === cycle.id);
  assert(tuition && book);
  assert.equal(tuition.state, 'UNCHECKED');
  assert.equal(tuition.recordedBy, 'fouad-mod');
  assert(
    checks.items.some(i => i.recordedBy !== 'fouad-mod'),
    'money on Fouad cycles counts regardless of who recorded it'
  );
  assert(checks.items.every(i => !['MIAMI', 'SMART'].includes(i.branch)));
  assert.equal((await req('/finances/checks?branch=MIAMI')).status, 400);
  const pick = [
    { kind: 'PAYMENT', id: tuition.id },
    { kind: 'BOOK', id: book.id }
  ];
  assert.equal((await req('/finances/checks', 'POST', { branch: 'FOUAD', items: pick }, fouad)).status, 403);
  ok(await req('/finances/checks', 'POST', { branch: 'FOUAD', items: pick, note: 'Matched receipt F-100' }, main));
  checks = ok(await req('/finances/checks?branch=FOUAD&status=CHECKED'));
  assert.equal(checks.items.length, 2);
  assert(checks.items.every(i => i.check.checkedBy === 'main-mod' && i.check.note === 'Matched receipt F-100'));
  assert.equal(ok(await req('/finances/checks?branch=FOUAD&summary=1')).summary.checked.count, 2);
  // Undoing the book payment after it was checked flags it for another look.
  const bookRow = await prisma.bookPayment.findUnique({ where: { id: book.id } });
  ok(
    await req(
      '/cycles/' + cycle.id + '/enrollments/' + enrollment.id + '/books',
      'POST',
      { status: 'UNPAID', paymentId: bookRow.id },
      fouad
    )
  );
  checks = ok(await req('/finances/checks?branch=FOUAD&status=CHANGED'));
  assert.deepEqual(
    checks.items.map(i => i.id),
    [book.id]
  );
  ok(await req('/finances/checks/uncheck', 'POST', { branch: 'FOUAD', items: [{ kind: 'BOOK', id: book.id }] }, main));
  assert.equal(ok(await req('/finances/checks?branch=FOUAD&status=CHANGED')).items.length, 0);
  // Changing the role away from mod clears the branch title.
  ok(await req('/users/' + created.user.id + '/role', 'PUT', { role: 'user' }));
  assert.equal((await prisma.user.findUnique({ where: { id: created.user.id } })).branchScope, null);
  console.log(
    'PASS: branch mod titles, no payroll for branch mods, approvals by main managers, Fouad money checks and changed-after-check flags.'
  );
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
