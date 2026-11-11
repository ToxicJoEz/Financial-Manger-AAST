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
  // Miami is a normal branch now: it can have its own branch mods.
  assert.equal(
    (await req('/users/' + created.user.id + '/branch-scope', 'PUT', { branchScope: 'NOWHERE' })).status,
    400
  );
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
  const cycles = ok(await req('/cycles?pageSize=100', 'GET', undefined, fouad));
  assert(cycles.rows.length && cycles.counts.payrollDue === undefined);
  // A branch mod only sees and changes cycles in their own branch.
  assert(cycles.rows.every(c => c.branch === 'FOUAD'));
  assert.equal((await req('/cycles/cycle-ket-12', 'GET', undefined, fouad)).status, 404);
  assert.equal((await req('/cycles/cycle-ket-12', 'PUT', { details: 'x' }, fouad)).status, 404);
  assert.equal((await req('/cycles/cycle-ket-13', 'PUT', { branch: 'MIAMI' }, fouad)).status, 403);
  assert.equal((await req('/cycles/bulk-archive', 'POST', { ids: ['cycle-ket-12'] }, fouad)).status, 403);
  assert.equal(
    (
      await req(
        '/cycles',
        'POST',
        { parentCourseId: 'course-ket', cycleNumber: 2, branch: 'MIAMI', courseFee: 1000, startDate: '2026-11-01' },
        fouad
      )
    ).status,
    403
  );
  // Only admins and the main mod create or open umbrellas; branch mods only see umbrellas open for their branch.
  assert.equal((await req('/courses', 'POST', { name: 'Branch umbrella', code: 'BR-1' }, fouad)).status, 403);
  assert.equal((await req('/courses/course-ielts/branches', 'PUT', { branches: ['FOUAD'] }, fouad)).status, 403);
  ok(await req('/courses/course-ielts/branches', 'PUT', { branches: ['SMART'] }, main));
  assert(!ok(await req('/courses', 'GET', undefined, fouad)).some(c => c.id === 'course-ielts'));
  assert.equal((await req('/courses/course-ielts', 'GET', undefined, fouad)).status, 404);
  ok(await req('/courses/course-ielts/branches', 'PUT', { branches: ['SMART', 'FOUAD'] }, main));
  assert(ok(await req('/courses', 'GET', undefined, fouad)).some(c => c.id === 'course-ielts'));
  const catalog = ok(await req('/courses', 'GET', undefined, fouad));
  assert(catalog.every(c => c.branches.every(b => b === 'FOUAD')));
  const fouadIncome = ok(await req('/finances/income?year=2026', 'GET', undefined, fouad));
  assert(fouadIncome.cycles.every(c => c.branch === 'FOUAD'));
  assert.equal(fouadIncome.months.length, 12);
  // Income and salary reports take a month, a range of months or a year.
  const range = ok(await req('/finances/income?from=2026-09&to=2026-12', 'GET', undefined, main));
  assert.equal(range.months.length, 4);
  assert.equal(
    range.summary.income,
    Math.round(range.months.reduce((sum, m) => sum + m.summary.income, 0) * 100) / 100
  );
  assert.equal((await req('/finances/income?from=2026-12&to=2026-01', 'GET', undefined, main)).status, 400);
  const yearPay = ok(await req('/finances?month=2026', 'GET', undefined, main)).monthly;
  const rangePay = ok(await req('/finances?month=2026-01:2026-12', 'GET', undefined, main)).monthly;
  assert.equal(rangePay.totalPaid, yearPay.totalPaid);
  assert.equal((await req('/finances?month=2026-12:2026-01', 'GET', undefined, main)).status, 400);
  const sharedStudent = await prisma.enrollment.findFirst({
    where: { course: { branch: 'MIAMI' } },
    select: { studentId: true }
  });
  const studentView = ok(await req('/students/' + sharedStudent.studentId, 'GET', undefined, fouad));
  assert(studentView.enrollments.every(e => e.course.branch === 'FOUAD'));
  assert.equal((await req('/students/' + sharedStudent.studentId, 'DELETE', {}, fouad)).status, 403);
  assert(
    ok(await req('/employees/demo-instructor-1/details', 'GET', undefined, fouad)).courseAssignments.every(
      a => a.course.branch === 'FOUAD'
    )
  );
  assert(!JSON.stringify(cycles).includes('hourlyRate'));
  assert(!JSON.stringify(cycles).includes('payrollEarnings'));
  assert(JSON.stringify(ok(await req('/cycles?pageSize=100', 'GET', undefined, main)).rows).includes('hourlyRate'));
  assert.equal((await req('/cycles?status=payroll-due', 'GET', undefined, fouad)).status, 403);
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
      { parentCourseId: 'course-ket', cycleNumber: 1, branch: 'FOUAD', courseFee: 1000, startDate: '2026-11-01' },
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

  // Branch money is checked by admins and the main mod only; branch mods have no checks page.
  assert.equal((await req('/finances/checks?branch=FOUAD', 'GET', undefined, fouad)).status, 403);
  let checks = ok(await req('/finances/checks?branch=FOUAD', 'GET', undefined, main));
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
  assert.equal((await req('/finances/checks?branch=NOWHERE')).status, 400);
  assert.equal(ok(await req('/finances/checks?branch=MIAMI&summary=1')).branch, 'MIAMI');
  assert.equal(ok(await req('/finances/checks?branch=SMART&summary=1')).branch, 'SMART');
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
  // Once confirmed, the branch mod can no longer undo, edit or remove that money; the main mod still can.
  const bookRow = await prisma.bookPayment.findUnique({ where: { id: book.id } });
  const bookPath = '/cycles/' + cycle.id + '/enrollments/' + enrollment.id + '/books';
  const enrollmentPath = '/cycles/' + cycle.id + '/enrollments/' + enrollment.id;
  assert.equal((await req(bookPath, 'POST', { status: 'UNPAID', paymentId: bookRow.id }, fouad)).status, 403);
  assert.equal((await req(enrollmentPath, 'PUT', { customFee: 500 }, fouad)).status, 403);
  assert.equal((await req(enrollmentPath, 'DELETE', { confirm: true, mode: 'KEEP' }, fouad)).status, 403);
  assert.equal(
    (await req(enrollmentPath + '/payments/' + tuition.id + '/reverse', 'POST', { note: 'Typo' }, fouad)).status,
    403
  );
  assert.equal((await req('/cycles/' + cycle.id + '/permanent', 'DELETE', { confirm: true }, fouad)).status, 403);
  const cycleView = ok(await req('/cycles/' + cycle.id, 'GET', undefined, fouad));
  const shown = cycleView.enrollments.find(e => e.id === enrollment.id);
  assert(shown.moneyConfirmed && shown.books.confirmed && shown.paymentSummary.every(p => p.confirmed));
  // Undoing the book payment after it was checked flags it for another look.
  ok(await req(bookPath, 'POST', { status: 'UNPAID', paymentId: bookRow.id }, main));
  checks = ok(await req('/finances/checks?branch=FOUAD&status=CHANGED'));
  assert.deepEqual(
    checks.items.map(i => i.id),
    [book.id]
  );
  ok(await req('/finances/checks/uncheck', 'POST', { branch: 'FOUAD', items: [{ kind: 'BOOK', id: book.id }] }, main));
  assert.equal(ok(await req('/finances/checks?branch=FOUAD&status=CHANGED')).items.length, 0);
  // Unconfirmed money can still be undone by the branch mod who works there.
  const second = ok(
    await req(
      '/cycles/' + cycle.id + '/enrollments',
      'POST',
      {
        studentId: 'demo-student-7',
        recordPayment: true,
        amountPaid: 1000,
        paymentMethod: 'CASH',
        receiptNumber: 'F-101'
      },
      fouad
    )
  );
  const secondEntry = await prisma.paymentEntry.findFirst({ where: { enrollmentId: second.id } });
  ok(
    await req(
      '/cycles/' + cycle.id + '/enrollments/' + second.id + '/payments/' + secondEntry.id + '/reverse',
      'POST',
      { note: 'Wrong receipt' },
      fouad
    )
  );
  // Completed cycles take no new students, for anyone, until they are reopened.
  await prisma.cycle.update({ where: { id: cycle.id }, data: { isFinished: true } });
  assert.equal(
    (await req('/cycles/' + cycle.id + '/enrollments', 'POST', { studentId: 'demo-student-6' }, main)).status,
    409
  );
  // Users see only the branches they are given; with none, they see nothing.
  const viewer = ok(await req('/auth/register', 'POST', { username: 'branch-viewer', password: 'ViewerTest!123' }));
  const viewerToken = await login('branch-viewer', 'ViewerTest!123');
  assert.equal(ok(await req('/cycles?pageSize=100', 'GET', undefined, viewerToken)).total, 0);
  assert.equal(ok(await req('/students', 'GET', undefined, viewerToken)).total, 0);
  assert.equal(ok(await req('/courses', 'GET', undefined, viewerToken)).length, 0);
  assert.equal(
    (await req('/users/' + viewer.user.id + '/branches', 'PUT', { branches: ['FOUAD'] }, fouad)).status,
    403
  );
  ok(await req('/users/' + viewer.user.id + '/branches', 'PUT', { branches: ['FOUAD', 'SMART'] }, main));
  const seen = ok(await req('/cycles?pageSize=100', 'GET', undefined, viewerToken)).rows;
  assert(seen.length && seen.every(c => ['FOUAD', 'SMART'].includes(c.branch)));
  assert.equal((await req('/cycles/cycle-ket-12', 'GET', undefined, viewerToken)).status, 404);
  assert(ok(await req('/students', 'GET', undefined, viewerToken)).total > 0);
  // A branch mod's new user gets that mod's branch.
  const fromFouad = ok(
    await req('/auth/register', 'POST', { username: 'fouad-viewer', password: 'ViewerTest!123' }, fouad)
  );
  assert.equal((await prisma.user.findUnique({ where: { id: fromFouad.user.id } })).branches, 'FOUAD');
  // Next levels: linked to the cycle they follow (same umbrella and branch), students carried over unpaid.
  const levelOne = ok(
    await req(
      '/cycles',
      'POST',
      { parentCourseId: 'course-pet', cycleNumber: 5, branch: 'MIAMI', courseFee: 900, startDate: '2027-01-10' },
      main
    )
  );
  assert.equal(levelOne.name, 'PET 5 - January 2027');
  ok(
    await req(
      '/cycles/' + levelOne.id + '/enrollments',
      'POST',
      { studentId: 'demo-student-1', recordPayment: true, amountPaid: 900 },
      main
    )
  );
  ok(
    await req(
      '/cycles/' + levelOne.id + '/enrollments',
      'POST',
      { studentId: 'demo-student-2', recordPayment: true, amountPaid: 900 },
      main
    )
  );
  const nextBody = {
    parentCourseId: 'course-pet',
    cycleNumber: 6,
    branch: 'MIAMI',
    courseFee: 1000,
    startDate: '2027-03-01',
    previousCycleId: levelOne.id
  };
  assert.equal((await req('/cycles', 'POST', { ...nextBody, branch: 'SMART' }, main)).status, 409);
  assert.equal((await req('/cycles', 'POST', { ...nextBody, parentCourseId: 'course-ket' }, main)).status, 409);
  assert.equal((await req('/cycles', 'POST', { ...nextBody, studentIds: ['demo-student-5'] }, main)).status, 400);
  const levelTwo = ok(await req('/cycles', 'POST', { ...nextBody, studentIds: ['demo-student-1'] }, main));
  const linked = ok(await req('/cycles/' + levelTwo.id, 'GET', undefined, main));
  assert.equal(linked.previousCycle.id, levelOne.id);
  assert.equal(linked.enrollments.length, 1);
  assert.equal(linked.enrollments[0].status, 'UNPAID');
  assert.equal(linked.enrollments[0].amountPaid, 0);
  assert.equal(ok(await req('/cycles/' + levelOne.id, 'GET', undefined, main)).nextCycles[0].id, levelTwo.id);
  // Payment recorded later on the new level.
  ok(
    await req(
      '/cycles/' + levelTwo.id + '/enrollments/' + linked.enrollments[0].id + '/payments',
      'POST',
      {
        amount: 1000,
        kind: 'PAYMENT',
        note: 'Tuition payment',
        idempotencyKey: 'next-level-pay-1',
        paymentMethod: 'CASH'
      },
      main
    )
  );
  assert.equal(ok(await req('/cycles/' + levelTwo.id, 'GET', undefined, main)).enrollments[0].status, 'PAID');
  // Chains list together: the second level comes right after the first.
  const petRows = ok(await req('/cycles?parentCourseId=course-pet&pageSize=100', 'GET', undefined, main)).rows;
  const at = petRows.findIndex(c => c.id === levelOne.id);
  assert.equal(petRows[at + 1]?.id, levelTwo.id);
  assert.equal((await req('/cycles/' + levelTwo.id, 'PUT', { branch: 'SMART' }, main)).status, 409);

  // The main mod manages users and branch mods only; never admins or other main mods.
  const helper = ok(
    await req(
      '/auth/register',
      'POST',
      { username: 'aswan-helper', password: 'AswanHelper!123', role: 'mod', branchScope: 'ASWAN' },
      main
    )
  );
  assert.equal((await prisma.user.findUnique({ where: { id: helper.user.id } })).branchScope, 'ASWAN');
  assert.equal(
    (await req('/auth/register', 'POST', { username: 'new-admin', password: 'NewAdmin!123', role: 'admin' }, main))
      .status,
    403
  );
  assert.equal(
    (await req('/auth/register', 'POST', { username: 'new-main', password: 'NewMain!123', role: 'mod' }, main)).status,
    403
  );
  const admin = await prisma.user.findFirst({ where: { role: 'admin', username: { not: 'main-admin' } } });
  assert.equal((await req('/users/' + admin.id + '/status', 'PUT', { isBanned: true }, main)).status, 403);
  assert.equal((await req('/users/' + mainMod.user.id + '/status', 'PUT', { isBanned: true }, main)).status, 403);
  ok(await req('/users/' + helper.user.id + '/status', 'PUT', { isBanned: true }, main));
  ok(await req('/users/' + helper.user.id + '/status', 'PUT', { isBanned: false }, main));
  assert.equal((await req('/users/' + helper.user.id + '/status', 'PUT', { isActive: false }, main)).status, 400);
  ok(await req('/users/' + helper.user.id + '/branch-scope', 'PUT', { branchScope: 'SMART' }, main));
  assert.equal(
    (await req('/users/' + helper.user.id + '/branch-scope', 'PUT', { branchScope: null }, main)).status,
    403
  );
  assert.equal((await req('/users/' + helper.user.id + '/role', 'PUT', { role: 'admin' }, main)).status, 403);
  ok(await req('/users/' + helper.user.id + '/role', 'PUT', { role: 'user' }, main));
  assert.equal((await req('/users/' + helper.user.id + '/role', 'PUT', { role: 'mod' }, main)).status, 403);
  ok(await req('/users/' + helper.user.id + '/role', 'PUT', { role: 'mod', branchScope: 'DOKKI' }, main));
  assert.equal((await prisma.user.findUnique({ where: { id: helper.user.id } })).branchScope, 'DOKKI');
  // Branch mods: no activity log and no notifications.
  assert.equal((await req('/logs', 'GET', undefined, fouad)).status, 403);
  assert.equal((await req('/notifications/history', 'GET', undefined, fouad)).status, 403);
  ok(await req('/logs', 'GET', undefined, main));
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
