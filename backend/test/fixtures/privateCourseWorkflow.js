import assert from 'node:assert/strict';
import express from 'express';
import ExcelJS from 'exceljs';
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
async function upload(path, bytes) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer ' + token },
    body: bytes
  });
  return { status: response.status, data: await response.json() };
}
const ok = r => {
  assert(r.status < 300, JSON.stringify(r));
  return r.data;
};
async function workbook({
  reg = 'IMPORT-1',
  name = 'طالب تجريبي',
  method = 'غ',
  amount = 1440,
  code = '1T1036',
  receipt = 'TEST-RECEIPT'
} = {}) {
  const b = new ExcelJS.Workbook(),
    s = b.addWorksheet('Roster');
  s.mergeCells('G15:AB18');
  s.getCell('G15').value = `الدورة : ${code} _ KET\nفترة الانعقاد : 2026/10/06 - 2026/11/01`;
  for (const [cell, value] of Object.entries({
    A20: 'السداد',
    D20: 'الحافظة',
    E21: 'العملة',
    F21: 'القيمة',
    N20: 'الموبايل',
    O20: 'تاريخ الميلاد',
    P20: 'محل الميلاد',
    S20: 'الجنسية',
    V20: 'اسم الطالب - Eng.',
    Y20: 'اسم الطالب',
    AB20: 'رقم التسجيل',
    A22: method,
    D22: receipt,
    E22: 'جنيه مصري',
    F22: amount,
    N22: '01000000000',
    O22: '2005/01/02',
    P22: 'الإسكندرية',
    S22: 'مصري',
    V22: 'Test Student',
    Y22: name,
    AB22: reg
  }))
    s.getCell(cell).value = value;
  return Buffer.from(await b.xlsx.writeBuffer());
}
try {
  token = ok(await req('/auth/login', 'POST', { username: 'main-admin', password: 'IsolatedDemoTest!123' })).token;
  const junior = ok(await req('/auth/login', 'POST', { username: 'Joe', password: 'IsolatedDemoTest!123' })).token;

  // Umbrellas are made inside the Group or Private section and stay there.
  assert.equal((await req('/courses', 'POST', { name: 'No section', code: 'NO-SECTION' })).status, 400);
  assert.equal((await req('/courses', 'POST', { name: 'KET', isPrivate: true }, junior)).status, 403);
  const ket = ok(await req('/courses', 'POST', { name: ' ket ', isPrivate: true, code: 'IGNORED', bookPrice: 100 }));
  assert(ket.isPrivate);
  assert.equal(ket.name, 'KET');
  assert.equal(ket.code, null);
  assert.equal(ket.bookPrice, 100);
  // Private names are unique; group umbrellas need their own code.
  assert.equal((await req('/courses', 'POST', { name: 'KET', isPrivate: true })).status, 409);
  assert.equal((await req('/courses', 'POST', { name: 'Group no code', isPrivate: false })).status, 400);
  const pet = ok(await req('/courses', 'POST', { name: 'PET', isPrivate: true, bookPrice: 80 }));
  const group = ok(await req('/courses', 'POST', { name: 'Group only', code: 'GROUP-ONLY', isPrivate: false }));
  assert.equal(group.code, 'GROUP-ONLY');
  assert.equal(
    (await req('/courses', 'POST', { name: 'Group copy', code: 'GROUP-ONLY', isPrivate: false })).status,
    409
  );
  assert.equal((await req('/courses/' + ket.id, 'PUT', { name: 'KET', isPrivate: false })).status, 409);

  // Private cycles sit directly under their umbrella: numbered and named after it.
  const params = {
    parentCourseId: ket.id,
    cycleNumber: 1,
    branch: 'MIAMI',
    startDate: '2026-10-01',
    endDate: '2026-12-01',
    courseFee: 1000,
    totalHours: 10
  };
  const cycle = ok(await req('/cycles', 'POST', params));
  assert.equal(cycle.name, 'KET 1 - October 2026');
  // A second KET 1 in the same branch and month gets "(2)".
  const twin = ok(await req('/cycles', 'POST', params));
  assert.equal(twin.name, 'KET 1 - October 2026 (2)');
  await prisma.cycle.delete({ where: { id: twin.id } });
  const petOne = ok(await req('/cycles', 'POST', { ...params, parentCourseId: pet.id }));
  assert.equal(petOne.name, 'PET 1 - October 2026');
  assert.equal((await req('/cycles/' + cycle.id, 'PUT', { parentCourseId: pet.id })).status, 400);

  // Up to 3 students per private cycle.
  const path = '/cycles/' + cycle.id + '/enrollments';
  for (const studentId of ['demo-student-1', 'demo-student-2', 'demo-student-3'])
    ok(await req(path, 'POST', { studentId, tuitionType: 'FULL', amountPaid: 1000 }));
  const count = await prisma.student.count();
  assert.equal(
    (await req(path, 'POST', { newStudent: { name: 'لا تنشئ هذا الطالب' }, tuitionType: 'FULL', amountPaid: 1000 }))
      .status,
    409
  );
  assert.equal(await prisma.student.count(), count);

  // Book price comes from the umbrella; earlier purchases keep their amount.
  const entry = await prisma.enrollment.findFirst({ where: { courseId: cycle.id } });
  ok(await req(path + '/' + entry.id + '/books', 'POST', { status: 'PAID', expectedPrice: 100 }));
  ok(await req('/courses/' + ket.id, 'PUT', { bookPrice: 150 }));
  assert.equal((await prisma.bookPayment.findFirst({ where: { enrollmentId: entry.id } })).amountMinor, 10000n);
  const detail = ok(await req('/cycles/' + cycle.id));
  assert(detail.isPrivate);
  assert(detail.privateSeatOccupied);
  assert.equal(detail.effectiveBookPrice, 150);
  assert.equal(ok(await req('/students?pickerCourseId=' + cycle.id)).seatFull, true);

  // Search by student name or phone finds the cycle and its umbrella.
  const student = await prisma.student.findUnique({ where: { id: 'demo-student-1' } });
  const byName = ok(await req('/cycles?search=' + encodeURIComponent(student.name)));
  assert(byName.rows.some(r => r.id === cycle.id));
  if (student.mobile) {
    const byPhone = ok(await req('/cycles?search=' + encodeURIComponent(student.mobile.slice(-6))));
    assert(byPhone.rows.some(r => r.id === cycle.id));
  }
  const matches = ok(await req('/courses/student-matches?q=' + encodeURIComponent(student.name)));
  assert(matches.find(m => m.courseId === ket.id).students.includes(student.name));
  assert(ok(await req('/cycles?section=private&pageSize=100')).rows.every(r => r.parentCourse.isPrivate));

  // Renaming the umbrella renames its cycles; the level is editable.
  ok(await req('/courses/' + ket.id, 'PUT', { name: 'Pre-KET' }));
  assert.equal((await prisma.cycle.findUnique({ where: { id: cycle.id } })).name, 'PRE-KET 1 - October 2026');
  ok(await req('/cycles/' + cycle.id, 'PUT', { cycleNumber: 4 }));
  assert.equal((await prisma.cycle.findUnique({ where: { id: cycle.id } })).name, 'PRE-KET 4 - October 2026');

  const race = ok(await req('/cycles', 'POST', { ...params, cycleNumber: 2 }));
  const results = [];
  for (const studentId of ['demo-student-1', 'demo-student-2', 'demo-student-3', 'demo-student-4'])
    results.push(
      await req('/cycles/' + race.id + '/enrollments', 'POST', {
        studentId,
        tuitionType: 'EXEMPT',
        exempt: true,
        amountPaid: 0
      })
    );
  assert.deepEqual(
    results.map(x => x.status),
    [201, 201, 201, 409]
  );

  // Closing an employee's hours before the cycle ends: capped by the cycle's hours, straight into unpaid payroll.
  for (const instructorId of ['demo-instructor-1', 'demo-instructor-2'])
    ok(await req('/cycles/' + cycle.id + '/instructors', 'POST', { instructorId, hourlyRate: 100 }));
  const [a1, a2] = await Promise.all(
    ['demo-instructor-1', 'demo-instructor-2'].map(instructorId =>
      prisma.courseInstructor.findFirst({ where: { courseId: cycle.id, instructorId } })
    )
  );
  const close = (a, hours, auth) => req(`/cycles/${cycle.id}/instructors/${a.id}/close`, 'POST', { hours }, auth);
  const reopen = (a, auth) => req(`/cycles/${cycle.id}/instructors/${a.id}/reopen`, 'POST', {}, auth);
  const earning = a => prisma.payrollEarning.findFirst({ where: { courseId: cycle.id, instructorId: a.instructorId } });
  assert.equal((await close(a1, 11)).status, 400);
  ok(await close(a1, 6));
  assert.equal((await earning(a1)).amountMinor, 60000n);
  assert.equal((await earning(a1)).batchId, null);
  assert.equal((await close(a1, 1)).status, 409);
  assert.equal((await req(`/cycles/${cycle.id}/instructors/${a1.id}`, 'DELETE')).status, 409);
  // Everyone else sends a request; approving it closes the hours.
  assert.equal((await close(a2, 5, junior)).status, 400);
  const asked = ok(await close(a2, 3, junior));
  assert.equal(await earning(a2), null);
  const pending = await prisma.pendingAssignment.findUnique({ where: { id: asked.pending.id } });
  assert.equal(pending.type, 'CLOSE_HOURS');
  assert.equal(pending.hours, 3);
  assert.equal((await req('/assignments/' + pending.id + '/approve', 'POST', {}, junior)).status, 403);
  ok(await req('/assignments/' + pending.id + '/approve', 'POST', {}));
  assert.equal((await earning(a2)).amountMinor, 30000n);
  // Only admins and the main mod reopen; reopening removes the unpaid earning.
  assert.equal((await reopen(a2, junior)).status, 403);
  ok(await reopen(a2));
  assert.equal(await earning(a2), null);
  assert.equal((await prisma.courseInstructor.findUnique({ where: { id: a2.id } })).hoursTaught, null);

  // Completing the cycle: closed hours stay; the open employee gets the hours left.
  assert.equal(
    (
      await req('/cycles/' + cycle.id + '/finish', 'POST', {
        totalHours: 10,
        instructorHours: [{ courseInstructorId: a2.id, hoursTaught: 5 }]
      })
    ).status,
    400
  );
  ok(
    await req('/cycles/' + cycle.id + '/finish', 'POST', {
      totalHours: 10,
      instructorHours: [
        { courseInstructorId: a1.id, hoursTaught: 99 },
        { courseInstructorId: a2.id, hoursTaught: 4 }
      ]
    })
  );
  assert.equal((await earning(a1)).amountMinor, 60000n);
  assert.equal((await earning(a2)).amountMinor, 40000n);
  assert.equal((await reopen(a1)).status, 409);
  // Reopening the cycle removes the completion earnings only; the early close stays.
  assert.equal((await req('/cycles/' + cycle.id + '/revert', 'POST', {}, junior)).status, 403);
  ok(await req('/cycles/' + cycle.id + '/revert', 'POST'));
  assert.equal(await earning(a2), null);
  assert.equal((await earning(a1)).amountMinor, 60000n);
  ok(await req('/cycles/' + cycle.id + '/finish', 'POST', { totalHours: 10 }));
  assert.equal((await earning(a2)).hours, 4);
  // Once an earning is in a payment batch, going back is refused and says where it is.
  const run = await prisma.paymentRun.create({
    data: { year: 2026, month: 10, number: 9, initiatedDate: new Date('2026-10-20T00:00:00Z') }
  });
  const batch = await prisma.instructorPaymentBatch.create({
    data: { runId: run.id, instructorId: a2.instructorId, instructorName: 'Batch', status: 'PROCESSING' }
  });
  await prisma.payrollEarning.update({ where: { id: (await earning(a2)).id }, data: { batchId: batch.id } });
  const refused = await req('/cycles/' + cycle.id + '/revert', 'POST');
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /Payment batch 9 · October 2026 \(processing\)/);
  assert.equal((await prisma.cycle.findUnique({ where: { id: cycle.id } })).isFinished, true);

  // Payroll, income and exports are per cycle.
  const payroll = ok(await req('/finances?month=2026-10'));
  assert.equal(payroll.earnings.filter(e => e.courseId === cycle.id).length, 2);
  assert(payroll.earnings.filter(e => e.courseId === cycle.id).every(e => e.isPrivate));
  const income = ok(await req('/finances/income?month=2026-10'));
  const incomeRow = income.cycles.find(c => c.id === cycle.id);
  assert(incomeRow.isPrivate);
  assert.equal(incomeRow.parentCourseId, ket.id);
  const report = ok(
    await req('/exports', 'POST', {
      sheets: { courses: ['course', 'courseName'], payroll: ['course', 'earned'] },
      filters: { parentCourseId: ket.id }
    })
  );
  assert(report.sheets.find(s => s.key === 'courses').rows.every(row => row.course.includes('(Private)')));
  assert(report.sheets.find(s => s.key === 'payroll').rows.every(row => row.course.includes('(Private)')));

  // Archiving needs every cycle archived first; restoring a cycle needs its umbrella restored.
  assert.equal((await req('/courses/' + pet.id, 'DELETE')).status, 409);
  ok(await req('/cycles/' + petOne.id, 'DELETE'));
  ok(await req('/courses/' + pet.id, 'DELETE'));
  assert.equal((await req('/cycles/' + petOne.id + '/restore', 'POST')).status, 409);
  assert.equal(
    ok(await req('/courses', 'GET', undefined, junior)).some(c => c.id === pet.id),
    false
  );
  ok(await req('/courses/' + pet.id + '/restore', 'POST'));
  ok(await req('/cycles/' + petOne.id + '/restore', 'POST'));
  // Permanent deletion of an empty private umbrella uses the usual preview and confirmation.
  const empty = ok(await req('/courses', 'POST', { name: 'CEPT', isPrivate: true }));
  const deletion = ok(await req('/courses/' + empty.id + '/deletion-preview'));
  assert.equal(
    (await req('/courses/' + empty.id + '/permanent', 'DELETE', { confirm: false, version: deletion.version })).status,
    400
  );
  ok(await req('/courses/' + empty.id + '/permanent', 'DELETE', { confirm: true, version: deletion.version }));
  assert.equal(await prisma.course.findUnique({ where: { id: empty.id } }), null);

  // Roster import into a private umbrella: no course code to match; numbered like other cycles there.
  const ielts = ok(await req('/courses', 'POST', { name: 'IELTS', isPrivate: true, bookPrice: 200 }));
  const bytes = await workbook({ reg: 'PRIVATE-IMPORT', amount: 1000, code: '1T9999' });
  const importBody = { branch: 'MIAMI', courseFee: 1000, totalHours: 10, cycleNumber: 1 };
  const preview = ok(await upload('/imports/' + ielts.id + '/preview', bytes));
  assert.equal(preview.courseMismatch, false);
  const imported = ok(
    await req('/imports/' + ielts.id + '/commit', 'POST', {
      ...importBody,
      previewToken: preview.previewToken,
      choices: { 'PRIVATE-IMPORT': { profile: 'fill', feeMode: 'standard' } }
    })
  );
  assert.match(imported.cycleName, /^IELTS 1 - [A-Z][a-z]+ \d{4}$/);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes);
  const sheet = book.worksheets[0];
  sheet.getRow(22).eachCell((cell, col) => (sheet.getRow(23).getCell(col).value = cell.value));
  sheet.getCell('AB23').value = 'PRIVATE-SECOND';
  sheet.getCell('Y23').value = 'طالب آخر';
  sheet.getCell('N23').value = '01000000009';
  const multi = ok(await upload('/imports/' + ielts.id + '/preview', Buffer.from(await book.xlsx.writeBuffer())));
  assert.equal(multi.rows.length, 2);
  const pair = ok(
    await req('/imports/' + ielts.id + '/commit', 'POST', {
      ...importBody,
      cycleNumber: 2,
      previewToken: multi.previewToken,
      choices: {
        'PRIVATE-IMPORT': { profile: 'keep', feeMode: 'standard' },
        'PRIVATE-SECOND': { profile: 'fill', feeMode: 'standard' }
      }
    })
  );
  assert.match(pair.cycleName, /^IELTS 2 - [A-Z][a-z]+ \d{4}$/);
  assert.equal(await prisma.enrollment.count({ where: { courseId: pair.cycleId } }), 2);
  console.log(
    'PASS: Group/Private umbrellas, private numbering and naming, 3-seat capacity, book prices, student search, early hour closing with approval and reopen, archive/delete rules, finance metadata and roster import'
  );
} finally {
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
