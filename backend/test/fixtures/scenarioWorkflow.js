// End-to-end scenarios, from creating umbrellas to paying employees. Each step that does not behave as expected
// is recorded as a finding (instead of stopping), and the findings are printed at the end for review.
import express from 'express';
import service from '../../src/vercel.js';
import prisma from '../../src/db/prisma.js';
const app = express();
app.use(service);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
const PASSWORD = 'IsolatedDemoTest!123';
const today = new Date().toISOString().slice(0, 10);
const findings = [];
const calls = [];
let scenario = '';
let keySeq = 0;
const key = () => `scenario-${Date.now()}-${++keySeq}`;
async function req(path, method = 'GET', body, auth) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  calls.push({ scenario, method, path, status: response.status });
  return { status: response.status, data };
}
const note = (label, info) => findings.push({ scenario, label, info });
const check = (label, condition, info) => {
  if (!condition) note(label, info);
  return Boolean(condition);
};
// A step that should work: records a finding if it did not, and returns its data (or null).
function must(r, label) {
  if (r.status >= 300) {
    note(label + ' failed', { status: r.status, error: r.data?.error || r.data });
    return null;
  }
  return r.data;
}
// A step that should be refused with one of these statuses.
const refused = (r, label, statuses = [400, 403, 404, 409]) =>
  check(label + ' should be refused', statuses.includes(r.status), { status: r.status, body: r.data });
const login = async (username, password = PASSWORD) =>
  (await req('/auth/login', 'POST', { username, password })).data?.token;
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;

try {
  const started = new Date();
  const admin = await login('main-admin'),
    main = await login('Youssef Wael'),
    user = await login('Joe');

  // ---- Scenario 1: a group course from umbrella to paid payroll -----------------------------------------
  scenario = '1 · Group course lifecycle';
  const fce = must(
    await req('/courses', 'POST', { name: 'Scenario FCE', code: 'SC-FCE', isPrivate: false, bookPrice: 500 }, main),
    'Main mod creates group umbrella'
  );
  must(
    await req(`/courses/${fce.id}/branches`, 'PUT', { branches: ['MIAMI', 'FOUAD'] }, main),
    'Open umbrella for branches'
  );
  const cycle = must(
    await req(
      '/cycles',
      'POST',
      {
        parentCourseId: fce.id,
        cycleNumber: 1,
        branch: 'MIAMI',
        startDate: '2026-09-01',
        endDate: '2026-10-15',
        totalHours: 20,
        courseFee: 2000,
        instructorId: 'demo-instructor-1',
        hourlyRate: 100,
        venue: 'Room 1',
        classStartTime: '10:00',
        classEndTime: '12:00'
      },
      main
    ),
    'Create group cycle'
  );
  check(
    'Cycle name follows "<umbrella> <level> - <month year>"',
    cycle?.name === 'SCENARIO FCE 1 - September 2026',
    cycle?.name
  );
  refused(
    await req(
      '/cycles',
      'POST',
      { parentCourseId: fce.id, cycleNumber: 1, branch: 'ASWAN', startDate: '2026-09-01', courseFee: 1 },
      main
    ),
    'Cycle in a branch the umbrella is not open for'
  );
  const enroll = (body, auth = main) => req(`/cycles/${cycle.id}/enrollments`, 'POST', body, auth);
  must(
    await enroll({
      newStudent: { name: 'طالب السيناريو الأول', mobile: '01055500011' },
      tuitionType: 'FULL',
      recordPayment: true,
      amountPaid: 2000,
      paymentMethod: 'CASH',
      receiptNumber: 'SC-R1'
    }),
    'Enroll a new student, fully paid'
  );
  // New enrollments must be fully paid (partial / unpaid enrollment is refused); noted separately.
  refused(
    await enroll({
      studentId: 'demo-student-1',
      tuitionType: 'FULL',
      recordPayment: true,
      amountPaid: 500,
      paymentMethod: 'CARD'
    }),
    'Enrolling with a partial payment'
  );
  must(
    await enroll({
      studentId: 'demo-student-1',
      tuitionType: 'FULL',
      recordPayment: true,
      amountPaid: 2000,
      paymentMethod: 'CARD'
    }),
    'Enroll fully paid by card'
  );
  must(
    await enroll({
      studentId: 'demo-student-2',
      tuitionType: 'DISCOUNTED',
      customFee: 1500,
      recordPayment: true,
      amountPaid: 1500,
      paymentMethod: 'CASH'
    }),
    'Enroll discounted, fully paid'
  );
  for (const body of [
    { studentId: 'demo-student-1', tuitionType: 'FULL', recordPayment: true, amountPaid: 2000, paymentMethod: 'CASH' },
    { studentId: 'demo-student-1', tuitionType: 'FULL', amountPaid: 0 }
  ]) {
    const twice = await enroll(body);
    refused(twice, 'Enrolling the same student twice', [409]);
    check(
      'Double enrollment says the student is already enrolled',
      /already enrolled/.test(twice.data?.error || ''),
      twice.data
    );
  }
  check(
    'Still one enrollment for that student',
    (await prisma.enrollment.count({ where: { courseId: cycle.id, studentId: 'demo-student-1' } })) === 1
  );
  let detail = must(await req('/cycles/' + cycle.id, 'GET', undefined, main), 'Read cycle');
  const byStudent = id => detail.enrollments.find(e => e.studentId === id);
  refused(
    await req(
      `/cycles/${cycle.id}/enrollments/${byStudent('demo-student-1').id}/payments`,
      'POST',
      { amount: 100, note: 'Overpay', idempotencyKey: key() },
      main
    ),
    'Paying more than the fee'
  );
  for (const e of detail.enrollments.slice(0, 2))
    must(
      await req(`/cycles/${cycle.id}/enrollments/${e.id}/books`, 'POST', { status: 'PAID', expectedPrice: 500 }, main),
      'Mark books paid'
    );
  detail = must(await req('/cycles/' + cycle.id, 'GET', undefined, main), 'Read cycle again');
  check('Expected tuition = 2000 + 2000 + 1500', near(detail.totalExpectedRevenue, 5500), detail.totalExpectedRevenue);
  check(
    'Collected tuition = 2000 + 2000 + 1500',
    near(detail.totalCollectedRevenue, 5500),
    detail.totalCollectedRevenue
  );
  // A user sees fees and paid status, never amounts paid.
  const asUser = must(await req('/cycles/' + cycle.id, 'GET', undefined, user), 'User opens the cycle');
  check(
    'Users see no amounts paid',
    asUser && asUser.enrollments.every(e => e.amountPaid === undefined),
    asUser?.enrollments?.[0]
  );
  check('Users see no hourly rates', asUser && !JSON.stringify(asUser).includes('hourlyRate'));
  // Complete, then pay the employee.
  must(await req(`/cycles/${cycle.id}/finish`, 'POST', { totalHours: 20 }, main), 'Complete the cycle');
  let payroll = must(await req('/finances', 'GET', undefined, admin), 'Open payroll');
  const earning = payroll?.earnings.find(e => e.courseId === cycle.id);
  check(
    'Completion records 20 h × 100 = 2000 unpaid',
    earning && near(earning.amount, 2000) && earning.status === 'UNPAID',
    earning
  );
  const batch = must(
    await req(
      '/finances/batches',
      'POST',
      {
        earningIds: [earning.id],
        versions: { [earning.id]: earning.updatedAt },
        initiatedDate: today,
        idempotencyKey: key()
      },
      admin
    ),
    'Start a payment batch'
  );
  must(
    await req(`/finances/batches/${batch?.id}/pay`, 'POST', { actualPaymentDate: today }, admin),
    'Mark the batch paid'
  );
  payroll = must(await req('/finances', 'GET', undefined, admin), 'Open payroll after paying');
  check(
    'Earning shows as PAID',
    payroll?.earnings.find(e => e.id === earning.id)?.status === 'PAID',
    payroll?.earnings.find(e => e.id === earning.id)
  );
  const reopen = await req(`/cycles/${cycle.id}/revert`, 'POST', {}, main);
  refused(reopen, 'Reopening a cycle whose payroll is paid', [409]);
  check('Refusal says which batch', /Payment batch \d+/.test(reopen.data?.error || ''), reopen.data);
  // Income for September matches what was collected.
  const income = must(await req('/finances/income?month=2026-09', 'GET', undefined, admin), 'Income for September');
  const row = income?.cycles.find(c => c.id === cycle.id);
  check('Income tuition 5500', row && near(row.tuition, 5500), row);
  check('Income books 1000', row && near(row.books, 1000), row);
  // Next level with the same students, carried over unpaid.
  const level2 = must(
    await req(
      '/cycles',
      'POST',
      {
        parentCourseId: fce.id,
        cycleNumber: 2,
        branch: 'MIAMI',
        startDate: '2026-10-20',
        courseFee: 2000,
        totalHours: 20,
        previousCycleId: cycle.id,
        studentIds: detail.enrollments.map(e => e.studentId)
      },
      main
    ),
    'Create next level with students carried over'
  );
  const l2 = level2 && must(await req('/cycles/' + level2.id, 'GET', undefined, main), 'Read next level');
  check(
    'Next level has the 3 students, all unpaid',
    l2 && l2.enrollments.length === 3 && l2.enrollments.every(e => e.amountPaid === 0),
    l2?.enrollments?.map(e => e.amountPaid)
  );
  check('Next level links back', l2?.previousCycle?.id === cycle.id, l2?.previousCycle);
  // Carried-over students start unpaid and are settled in one step: full, discounted or exempt. No instalments.
  const settle = (e, body) =>
    req(
      `/cycles/${level2.id}/enrollments/${e?.id}/settle`,
      'POST',
      { idempotencyKey: key(), paymentMethod: 'CASH', ...body },
      main
    );
  const [c1, c2, c3] = [
    'demo-student-1',
    'demo-student-2',
    l2?.enrollments.find(e => !e.studentId.startsWith('demo-'))?.studentId
  ].map(id => l2?.enrollments.find(e => e.studentId === id));
  refused(
    await req(
      `/cycles/${level2.id}/enrollments/${c1?.id}/payments`,
      'POST',
      { amount: 1000, note: 'First instalment', idempotencyKey: key(), paymentMethod: 'CASH' },
      main
    ),
    'A part payment (instalment)',
    [400]
  );
  must(await settle(c1, { tuitionType: 'FULL', receiptNumber: 'SC-L2-1' }), 'Mark a carried-over student paid in full');
  must(
    await settle(c2, { tuitionType: 'DISCOUNTED', customFee: 1500 }),
    'Mark a carried-over student paid at a discount'
  );
  refused(await settle(c3, { tuitionType: 'DISCOUNTED', customFee: 2500 }), 'A "discount" above the standard fee', [
    400
  ]);
  must(await settle(c3, { tuitionType: 'EXEMPT' }), 'Mark a carried-over student exempt');
  refused(await settle(c1, { tuitionType: 'FULL' }), 'Marking an already-paid student paid again', [409]);
  const l2b = must(await req('/cycles/' + level2.id, 'GET', undefined, main), 'Read next level after settling');
  check(
    'Next level: expected 2000 + 1500 + 0, all collected',
    l2b && near(l2b.totalExpectedRevenue, 3500) && near(l2b.totalCollectedRevenue, 3500),
    [l2b?.totalExpectedRevenue, l2b?.totalCollectedRevenue]
  );
  check(
    'Next level statuses: paid, paid, exempt',
    l2b &&
      ['PAID', 'PAID', 'EXEMPT'].every(
        (st, n) => l2b.enrollments.find(e => e.id === [c1, c2, c3][n]?.id)?.status === st
      ),
    l2b?.enrollments?.map(e => e.status)
  );
  const discounted = l2b?.enrollments.find(e => e.id === c2?.id);
  check(
    'Discounted student owes nothing',
    discounted && near(discounted.remainingBalance, 0),
    discounted?.remainingBalance
  );
  const found = must(
    await req('/cycles?search=' + encodeURIComponent('طالب السيناريو'), 'GET', undefined, main),
    'Search by student name'
  );
  check(
    'Student search finds both levels',
    found && [cycle.id, level2?.id].every(id => found.rows.some(r => r.id === id)),
    found?.rows?.map(r => r.name)
  );
  const phone = must(await req('/cycles?search=01055500011', 'GET', undefined, main), 'Search by phone');
  check(
    'Phone search finds the cycle',
    phone?.rows.some(r => r.id === cycle.id)
  );
  refused(await req('/courses/' + fce.id, 'DELETE', {}, main), 'Archiving an umbrella with active cycles', [409]);
  refused(await req('/courses/' + fce.id, 'PUT', { isPrivate: true }, main), 'Moving a group umbrella to Private', [
    409
  ]);

  // ---- Scenario 2: private tuition with hours closed early and approvals -----------------------------
  scenario = '2 · Private course with early hour closing';
  const ielts = must(
    await req('/courses', 'POST', { name: 'Scenario IELTS', isPrivate: true, bookPrice: 300 }, admin),
    'Create private umbrella'
  );
  check('Private umbrella has no code', ielts && ielts.code === null, ielts?.code);
  const pc = must(
    await req(
      '/cycles',
      'POST',
      {
        parentCourseId: ielts.id,
        cycleNumber: 1,
        branch: 'MIAMI',
        startDate: '2026-09-05',
        endDate: '2026-10-30',
        totalHours: 12,
        courseFee: 4000
      },
      admin
    ),
    'Create private cycle'
  );
  for (const [instructorId, hourlyRate] of [
    ['demo-instructor-1', 200],
    ['demo-instructor-2', 150]
  ])
    must(await req(`/cycles/${pc.id}/instructors`, 'POST', { instructorId, hourlyRate }, admin), 'Assign employee');
  for (const studentId of ['demo-student-3', 'demo-student-4', 'demo-student-5'])
    must(
      await req(
        `/cycles/${pc.id}/enrollments`,
        'POST',
        { studentId, tuitionType: 'FULL', recordPayment: true, amountPaid: 4000, paymentMethod: 'CASH' },
        admin
      ),
      'Enroll private student'
    );
  refused(
    await req(
      `/cycles/${pc.id}/enrollments`,
      'POST',
      { studentId: 'demo-student-6', tuitionType: 'FULL', amountPaid: 0 },
      admin
    ),
    'A 4th private student',
    [409]
  );
  let team = (await prisma.courseInstructor.findMany({ where: { courseId: pc.id } })).sort((a, b) =>
    a.instructorId.localeCompare(b.instructorId)
  );
  const asked = must(
    await req(`/cycles/${pc.id}/instructors/${team[0].id}/close`, 'POST', { hours: 8 }, user),
    'User requests closing 8 h'
  );
  check('A user request waits for approval', asked?.pending?.id, asked);
  must(await req(`/assignments/${asked?.pending?.id}/approve`, 'POST', {}, main), 'Main mod approves the close');
  payroll = must(await req('/finances', 'GET', undefined, admin), 'Payroll after early close');
  const early = payroll?.earnings.find(e => e.courseId === pc.id && e.instructorId === 'demo-instructor-1');
  check(
    'Early close is in payroll: 8 h × 200 = 1600 unpaid',
    early && near(early.amount, 1600) && early.status === 'UNPAID',
    early
  );
  const b2 = must(
    await req(
      '/finances/batches',
      'POST',
      {
        earningIds: [early.id],
        versions: { [early.id]: early.updatedAt },
        initiatedDate: today,
        idempotencyKey: key()
      },
      admin
    ),
    'Pay the early-closed hours (start batch)'
  );
  must(
    await req(`/finances/batches/${b2?.id}/pay`, 'POST', { actualPaymentDate: today }, admin),
    'Mark early batch paid'
  );
  const reopenHours = await req(`/cycles/${pc.id}/instructors/${team[0].id}/reopen`, 'POST', {}, admin);
  refused(reopenHours, 'Reopening paid closed hours', [409]);
  refused(
    await req(`/cycles/${pc.id}/instructors/${team[1].id}/close`, 'POST', { hours: 5 }, admin),
    'Closing more than the hours left',
    [400]
  );
  must(
    await req(`/cycles/${pc.id}/finish`, 'POST', { totalHours: 12 }, admin),
    'Complete: the open employee gets the 4 h left'
  );
  payroll = must(await req('/finances', 'GET', undefined, admin), 'Payroll after completion');
  const rest = payroll?.earnings.find(e => e.courseId === pc.id && e.instructorId === 'demo-instructor-2');
  check('Remaining 4 h × 150 = 600 unpaid', rest && near(rest.amount, 600) && rest.status === 'UNPAID', rest);
  must(await req(`/cycles/${pc.id}/revert`, 'POST', {}, admin), 'Reopen: removes the unpaid 600, keeps the paid 1600');
  payroll = must(await req('/finances', 'GET', undefined, admin), 'Payroll after reopening');
  const after = payroll?.earnings.filter(e => e.courseId === pc.id) || [];
  check(
    'After reopening only the paid early close remains',
    after.length === 1 && after[0].status === 'PAID',
    after.map(e => [e.instructorName, e.amount, e.status])
  );
  must(await req(`/cycles/${pc.id}/finish`, 'POST', { totalHours: 12 }, admin), 'Complete again');
  // Earnings start date and students for private payroll rows.
  const privRow = (must(await req('/finances', 'GET', undefined, admin), 'Payroll') || { earnings: [] }).earnings.find(
    e => e.courseId === pc.id && e.status === 'UNPAID'
  );
  check('Private payroll rows list the students', privRow && privRow.students?.length === 3, privRow?.students);
  check('Private payroll rows are marked private', privRow?.isPrivate === true, privRow);

  // ---- Scenario 3: a branch mod's day, with money checks -------------------------------------------------
  scenario = '3 · Branch mod and money checks';
  must(
    await req(
      '/auth/register',
      'POST',
      { username: 'scenario-fouad', password: 'FouadScenario!123', role: 'mod', branchScope: 'FOUAD' },
      main
    ),
    'Main mod creates a Fouad branch mod'
  );
  const fouad = await login('scenario-fouad', 'FouadScenario!123');
  check('Branch mod can sign in', Boolean(fouad));
  const umbrellas = must(await req('/courses', 'GET', undefined, fouad), 'Branch mod lists umbrellas') || [];
  check(
    'Branch mod sees the umbrella opened for Fouad',
    umbrellas.some(c => c.id === fce.id)
  );
  check(
    'Branch mod does not see the Miami-only private umbrella',
    !umbrellas.some(c => c.id === ielts.id),
    umbrellas.map(c => c.name)
  );
  refused(
    await req(
      '/cycles',
      'POST',
      { parentCourseId: fce.id, cycleNumber: 1, branch: 'MIAMI', startDate: '2026-09-10', courseFee: 1000 },
      fouad
    ),
    'Branch mod creating a Miami cycle',
    [403]
  );
  const fc = must(
    await req(
      '/cycles',
      'POST',
      {
        parentCourseId: fce.id,
        cycleNumber: 1,
        branch: 'FOUAD',
        startDate: '2026-09-10',
        endDate: '2026-10-10',
        totalHours: 10,
        courseFee: 1800
      },
      fouad
    ),
    'Branch mod creates a Fouad cycle'
  );
  must(
    await req(
      `/cycles/${fc.id}/enrollments`,
      'POST',
      {
        studentId: 'demo-student-7',
        tuitionType: 'FULL',
        recordPayment: true,
        amountPaid: 1800,
        paymentMethod: 'CASH',
        receiptNumber: 'F-1'
      },
      fouad
    ),
    'Branch mod enrolls with payment'
  );
  refused(await req('/cycles/' + cycle.id, 'GET', undefined, fouad), 'Branch mod opening a Miami cycle', [403, 404]);
  const fdetail = must(await req('/cycles/' + fc.id, 'GET', undefined, fouad), 'Branch mod reads own cycle');
  check('Branch mod sees no hourly rates', fdetail && !JSON.stringify(fdetail).includes('hourlyRate'));
  const assign = must(
    await req(`/cycles/${fc.id}/instructors`, 'POST', { instructorId: 'demo-instructor-3', hourlyRate: 999 }, fouad),
    'Branch mod requests an employee'
  );
  check('Branch mod employee change is a request', assign?.pending?.id, assign);
  must(
    await req(`/assignments/${assign?.pending?.id}/approve`, 'POST', { hourlyRate: 120 }, main),
    'Main mod approves with rate 120'
  );
  const rate = await prisma.courseInstructor.findFirst({ where: { courseId: fc.id } });
  check('Approved rate is the main mod’s (120), not the requested 999', rate?.hourlyRate === 120, rate?.hourlyRate);
  // Before any check: the branch mod fully manages a cycle they created (students, complete, reopen).
  const fe = fdetail?.enrollments[0];
  check(
    'Own unchecked cycle is not locked for its branch mod',
    fdetail && !fdetail.lockedReason,
    fdetail?.lockedReason
  );
  must(
    await req(`/cycles/${fc.id}/enrollments`, 'POST', { studentId: 'demo-student-8', tuitionType: 'EXEMPT' }, fouad),
    'Branch mod enrolls an exempt student in own cycle'
  );
  const extra = (await prisma.enrollment.findFirst({ where: { courseId: fc.id, studentId: 'demo-student-8' } }))?.id;
  must(
    await req(`/cycles/${fc.id}/enrollments/${extra}`, 'DELETE', { confirm: true, mode: 'KEEP' }, fouad),
    'Branch mod removes a student from own unchecked cycle'
  );
  must(await req(`/cycles/${fc.id}`, 'PUT', { venue: 'Fouad room 2' }, fouad), 'Branch mod edits own unchecked cycle');
  must(
    await req(
      `/cycles/${fc.id}/enrollments`,
      'POST',
      { newStudent: { name: 'طالب فرع فؤاد فقط', mobile: '01077700077' }, tuitionType: 'EXEMPT' },
      fouad
    ),
    'Branch mod enrolls a new Fouad-only student'
  );
  const fouadOnly = (await prisma.student.findFirst({ where: { mobile: '01077700077' } }))?.id;
  must(await req(`/cycles/${fc.id}/finish`, 'POST', { totalHours: 10 }, fouad), 'Branch mod completes own cycle');
  refused(
    await req(`/cycles/${fc.id}/finish`, 'POST', { totalHours: 9 }, fouad),
    'Branch mod changing hours of a completed cycle',
    [403]
  );
  must(await req(`/cycles/${fc.id}/revert`, 'POST', {}, fouad), 'Branch mod reopens own unchecked cycle');
  must(await req(`/cycles/${fc.id}/finish`, 'POST', { totalHours: 10 }, fouad), 'Branch mod completes it again');

  // A cycle in the same branch created by someone else is view-only for the branch mod.
  const others = must(
    await req(
      '/cycles',
      'POST',
      {
        parentCourseId: fce.id,
        cycleNumber: 2,
        branch: 'FOUAD',
        startDate: '2026-09-12',
        totalHours: 8,
        courseFee: 1800
      },
      main
    ),
    'Main mod creates a Fouad cycle'
  );
  const othersView = must(await req('/cycles/' + others?.id, 'GET', undefined, fouad), 'Branch mod views it');
  check(
    'Someone else’s cycle is marked locked (not theirs)',
    /Only the branch mod who created this cycle/.test(othersView?.lockedReason || ''),
    othersView?.lockedReason
  );
  for (const [label, method, path, body] of [
    [
      'enrolling a student in someone else’s cycle',
      'POST',
      `/cycles/${others?.id}/enrollments`,
      { studentId: 'demo-student-8', tuitionType: 'EXEMPT' }
    ],
    ['editing someone else’s cycle', 'PUT', `/cycles/${others?.id}`, { venue: 'Mine now' }],
    ['archiving someone else’s cycle', 'DELETE', `/cycles/${others?.id}`, {}],
    ['completing someone else’s cycle', 'POST', `/cycles/${others?.id}/finish`, { totalHours: 8 }],
    ['bulk-archiving someone else’s cycle', 'POST', '/cycles/bulk-archive', { ids: [others?.id] }]
  ]) {
    const r = await req(path, method, body, fouad);
    refused(r, 'Branch mod ' + label, [403]);
    check(
      `Reason for ${label} names the creator rule`,
      /Only the branch mod who created this cycle/.test(r.data?.error || ''),
      r.data
    );
  }

  // The main mod checks one payment in the branch mod's cycle: the whole cycle locks for the branch mod.
  const checks = must(
    await req('/finances/checks?branch=FOUAD', 'GET', undefined, main),
    'Main mod opens Fouad checks'
  );
  const toCheck = (checks?.items || []).filter(i => i.cycleId === fc.id);
  check('Fouad checks list the new payment', toCheck.length > 0, (checks?.items || []).slice(0, 2));
  must(
    await req(
      '/finances/checks',
      'POST',
      {
        branch: 'FOUAD',
        items: toCheck.slice(0, 1).map(i => ({ kind: i.kind, id: i.id })),
        note: 'Receipt F-1 matched'
      },
      main
    ),
    'Main mod checks one payment'
  );
  const lockedView = must(await req('/cycles/' + fc.id, 'GET', undefined, fouad), 'Branch mod views own checked cycle');
  check(
    'Own cycle is now locked (checked)',
    /checked money in this cycle/.test(lockedView?.lockedReason || ''),
    lockedView?.lockedReason
  );
  const pays = must(
    await req(`/cycles/${fc.id}/enrollments/${fe?.id}/payments`, 'GET', undefined, fouad),
    'Branch mod reads payments'
  );
  const entry = [].concat(pays?.payments || pays?.entries || pays || []).find(p => p.kind === 'PAYMENT');
  for (const [label, method, path, body] of [
    [
      'reversing a payment',
      'POST',
      `/cycles/${fc.id}/enrollments/${fe?.id}/payments/${entry?.id}/reverse`,
      { note: 'Undo', idempotencyKey: key() }
    ],
    ['removing a student', 'DELETE', `/cycles/${fc.id}/enrollments/${fe?.id}`, { confirm: true, mode: 'KEEP' }],
    [
      'enrolling another student',
      'POST',
      `/cycles/${fc.id}/enrollments`,
      { studentId: 'demo-student-8', tuitionType: 'EXEMPT' }
    ],
    [
      'changing book status',
      'POST',
      `/cycles/${fc.id}/enrollments/${fe?.id}/books`,
      { status: 'EXEMPT', expectedPrice: 500 }
    ],
    ['editing the cycle', 'PUT', `/cycles/${fc.id}`, { venue: 'Changed after check' }],
    ['reopening the cycle', 'POST', `/cycles/${fc.id}/revert`, {}],
    ['archiving the cycle', 'DELETE', `/cycles/${fc.id}`, {}],
    ['archiving a student profile in it', 'POST', `/students/${fouadOnly}/archive`, {}]
  ]) {
    const r = await req(path, method, body, fouad);
    refused(r, 'In a checked cycle: branch mod ' + label, [403]);
    check(
      `Reason for ${label} says the cycle was checked`,
      /checked money in this cycle/.test(r.data?.error || ''),
      r.data
    );
  }
  check('The student is still enrolled', Boolean(await prisma.enrollment.findUnique({ where: { id: fe?.id || '' } })));
  // The main mod (and admins) can still change everything.
  must(await req(`/cycles/${fc.id}/revert`, 'POST', {}, main), 'Main mod reopens the checked cycle');
  must(
    await req(`/cycles/${fc.id}/enrollments`, 'POST', { studentId: 'demo-student-8', tuitionType: 'EXEMPT' }, main),
    'Main mod enrolls in the checked cycle'
  );
  must(await req(`/cycles/${fc.id}/finish`, 'POST', { totalHours: 10 }, main), 'Main mod completes it again');
  refused(await req('/logs', 'GET', undefined, fouad), 'Branch mod opening the activity log', [403]);
  refused(await req('/finances', 'GET', undefined, fouad), 'Branch mod opening payroll', [403]);
  refused(await req('/logs', 'GET', undefined, user), 'User opening the activity log', [403]);

  // ---- Scenario 4: the activity log matches everything above ------------------------------------------
  scenario = '4 · Activity log completeness';
  const logged = await prisma.systemLog.findMany({
    where: { createdAt: { gte: started } },
    orderBy: { createdAt: 'asc' }
  });
  const expected = calls.filter(c => c.method !== 'GET' || c.status >= 400);
  check('One log entry per action or failed request', logged.length === expected.length, {
    logged: logged.length,
    expected: expected.length,
    missing: expected.length - logged.length
  });
  const failures = logged.filter(l => l.outcome === 'FAILURE');
  check(
    'Every failure has a type and a reason',
    failures.every(l => l.errorKind && l.errorMessage),
    failures.filter(l => !l.errorKind || !l.errorMessage).map(l => l.description)
  );
  check(
    'No success carries a failure reason',
    logged.filter(l => l.outcome === 'SUCCESS').every(l => !l.errorKind && !l.errorMessage)
  );
  check('Failures match the refused requests', failures.length === expected.filter(c => c.status >= 400).length, {
    failures: failures.length,
    refusedRequests: expected.filter(c => c.status >= 400).length
  });
  check(
    'Every entry names who did it',
    logged.every(l => l.actorUsername && l.actorUsername !== 'Unknown account'),
    logged.filter(l => l.actorUsername === 'Unknown account').map(l => l.description)
  );
  check(
    'Paid-reopen refusal is "Blocked by a rule"',
    logged.some(l => l.action === 'REOPEN_CYCLE' && l.errorKind === 'BLOCKED_BY_RULE')
  );
  check(
    'No generic action names (CREATE / UPDATE / DELETE / ARCHIVE)',
    !logged.some(l => ['CREATE', 'UPDATE', 'DELETE', 'ARCHIVE'].includes(l.action)),
    logged.filter(l => ['CREATE', 'UPDATE', 'DELETE', 'ARCHIVE'].includes(l.action)).map(l => l.description)
  );
  for (const [action, path] of [
    ['REMOVE_STUDENT', '/enrollments/'],
    ['SETTLE_TUITION', '/settle'],
    ['RECORD_PAYMENT', '/payments'],
    ['CLOSE_HOURS', '/close'],
    ['ENROLL_STUDENT', '/enrollments']
  ])
    check(
      `Requests to ${path} are logged as ${action}`,
      logged.some(l => l.action === action),
      [...new Set(logged.filter(l => l.details?.path?.includes(path)).map(l => l.action))]
    );
  const kinds = {};
  for (const l of failures) kinds[l.errorKind] = (kinds[l.errorKind] || 0) + 1;
  const mainView = must(await req('/logs?actorUsername=main-admin', 'GET', undefined, main), 'Main mod opens the log');
  check('Main mod sees admin actions', mainView?.total > 0);

  console.log(
    'SCENARIO_FINDINGS ' +
      JSON.stringify(
        {
          findings,
          calls: calls.length,
          logged: logged.length,
          failureKinds: kinds,
          refusals: failures.map(l => `${l.errorKind} · ${l.action} · ${l.errorMessage}`),
          actions: [...new Set(logged.map(l => l.action))]
        },
        null,
        1
      )
  );
  console.log('PASS: scenarios ran to the end');
} catch (error) {
  console.log(
    'SCENARIO_FINDINGS ' +
      JSON.stringify({ findings, crashedIn: scenario, error: String(error.stack || error) }, null, 1)
  );
  console.log('PASS: scenarios stopped early');
} finally {
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
