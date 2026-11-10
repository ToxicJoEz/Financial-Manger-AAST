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
  const parent = ok(
    await req('/courses', 'POST', { name: 'Private academy', code: 'PRIVATE-TEST', isPrivate: true, bookPrice: 999 })
  );
  assert(parent.isPrivate);
  assert.equal(parent.bookPrice, 0);

  // Sub-umbrellas: manager-only, unique names, their own book price.
  const subPath = '/courses/' + parent.id + '/sub-courses';
  assert.equal((await req(subPath, 'POST', { name: 'KET', bookPrice: 100 }, junior)).status, 403);
  const ket = ok(await req(subPath, 'POST', { name: ' ket ', bookPrice: 100 }));
  assert.equal(ket.name, 'KET');
  assert.equal((await req(subPath, 'POST', { name: 'KET' })).status, 409);
  const pet = ok(await req(subPath, 'POST', { name: 'PET', bookPrice: 80 }));
  const group = ok(await req('/courses', 'POST', { name: 'Group only', code: 'GROUP-ONLY' }));
  assert.equal((await req('/courses/' + group.id + '/sub-courses', 'POST', { name: 'KET' })).status, 400);
  assert.equal(ok(await req('/courses/' + parent.id)).subCourseCount, 2);

  // Private cycles follow group-cycle rules inside their sub-umbrella: numbered, named after it.
  const params = {
    parentCourseId: parent.id,
    subCourseId: ket.id,
    cycleNumber: 1,
    branch: 'MIAMI',
    startDate: '2026-10-01',
    endDate: '2026-12-01',
    courseFee: 1000,
    totalHours: 10
  };
  assert.equal((await req('/cycles', 'POST', { ...params, subCourseId: undefined })).status, 400);
  assert.equal(
    (await req('/cycles', 'POST', { ...params, subCourseId: pet.id, parentCourseId: group.id })).status,
    400
  );
  const cycle = ok(await req('/cycles', 'POST', params));
  assert.equal(cycle.name, 'KET 1 - October 2026');
  // A second KET 1 in the same branch and month gets "(2)".
  const twin = ok(await req('/cycles', 'POST', params));
  assert.equal(twin.name, 'KET 1 - October 2026 (2)');
  await prisma.cycle.delete({ where: { id: twin.id } });
  const petOne = ok(await req('/cycles', 'POST', { ...params, subCourseId: pet.id }));
  assert.equal(petOne.name, 'PET 1 - October 2026');
  assert.equal(
    (await req('/courses/' + parent.id, 'PUT', { name: parent.name, code: parent.code, isPrivate: false })).status,
    409
  );
  ok(await req('/courses/' + parent.id, 'PUT', { name: 'Private renamed', code: parent.code, isPrivate: true }));
  assert.equal((await prisma.cycle.findUnique({ where: { id: cycle.id } })).name, 'KET 1 - October 2026');

  // Up to 3 students per private cycle.
  const path = '/cycles/' + cycle.id + '/enrollments';
  for (const studentId of ['demo-student-1', 'demo-student-2', 'demo-student-3'])
    ok(await req(path, 'POST', { studentId, tuitionType: 'FULL', amountPaid: 1000 }, junior));
  const count = await prisma.student.count();
  assert.equal(
    (await req(path, 'POST', { newStudent: { name: 'لا تنشئ هذا الطالب' }, tuitionType: 'FULL', amountPaid: 1000 }))
      .status,
    409
  );
  assert.equal(await prisma.student.count(), count);

  // Book price comes from the sub-umbrella; earlier purchases keep their amount.
  const entry = await prisma.enrollment.findFirst({ where: { courseId: cycle.id } });
  ok(await req(path + '/' + entry.id + '/books', 'POST', { status: 'PAID', expectedPrice: 100 }));
  ok(await req('/sub-courses/' + ket.id, 'PUT', { bookPrice: 150 }));
  assert.equal((await prisma.bookPayment.findFirst({ where: { enrollmentId: entry.id } })).amountMinor, 10000n);
  const detail = ok(await req('/cycles/' + cycle.id));
  assert(detail.isPrivate);
  assert(detail.privateSeatOccupied);
  assert.equal(detail.effectiveBookPrice, 150);
  assert.equal(detail.subCourse.name, 'KET');
  assert.equal(ok(await req('/students?pickerCourseId=' + cycle.id)).seatFull, true);

  // Renaming the sub-umbrella renames its cycles; the cycle number is editable within it.
  ok(await req('/sub-courses/' + ket.id, 'PUT', { name: 'Pre-KET' }));
  assert.equal((await prisma.cycle.findUnique({ where: { id: cycle.id } })).name, 'PRE-KET 1 - October 2026');
  assert.equal((await req('/cycles/' + petOne.id, 'PUT', { cycleNumber: 1 })).status, 200);
  ok(await req('/cycles/' + cycle.id, 'PUT', { cycleNumber: 4 }));
  assert.equal((await prisma.cycle.findUnique({ where: { id: cycle.id } })).name, 'PRE-KET 4 - October 2026');
  assert.equal((await req('/cycles/' + cycle.id, 'PUT', { subCourseId: pet.id })).status, 400);

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
  const partial = ok(await req('/cycles', 'POST', { ...params, cycleNumber: 3 }));
  ok(
    await req('/cycles/' + partial.id + '/enrollments', 'POST', {
      studentId: 'demo-student-1',
      tuitionType: 'EXEMPT',
      exempt: true,
      amountPaid: 0
    })
  );
  assert.equal(ok(await req('/students?pickerCourseId=' + partial.id)).seatFull, undefined);
  const partialDetail = ok(await req('/cycles/' + partial.id));
  assert.equal(partialDetail.privateSeatOccupied, false);
  assert.equal(partialDetail.privateSeatCount, 1);
  assert.equal(partialDetail.privateSeatLimit, 3);

  // Payroll, income and exports are per cycle, unchanged by sub-umbrellas.
  for (const instructorId of ['demo-instructor-1', 'demo-instructor-2'])
    ok(await req('/cycles/' + cycle.id + '/instructors', 'POST', { instructorId, hourlyRate: 100 }));
  const assignments = await prisma.courseInstructor.findMany({ where: { courseId: cycle.id } });
  ok(
    await req('/cycles/' + cycle.id + '/finish', 'POST', {
      totalHours: 10,
      instructorHours: assignments.map(a => ({ courseInstructorId: a.id, hoursTaught: 5 }))
    })
  );
  const payroll = ok(await req('/finances?month=2026-10'));
  assert.equal(payroll.earnings.filter(e => e.courseId === cycle.id).length, 2);
  assert(payroll.earnings.filter(e => e.courseId === cycle.id).every(e => e.isPrivate));
  const income = ok(await req('/finances/income?month=2026-10'));
  const incomeRow = income.cycles.find(c => c.id === cycle.id);
  assert(incomeRow.isPrivate);
  assert.equal(incomeRow.subCourseId, ket.id);
  const report = ok(
    await req('/exports', 'POST', {
      sheets: { courses: ['course', 'courseName'], payroll: ['course', 'earned'] },
      filters: { parentCourseId: parent.id }
    })
  );
  assert(report.sheets.find(s => s.key === 'courses').rows.every(row => row.course.includes('(Private)')));
  assert(report.sheets.find(s => s.key === 'payroll').rows.every(row => row.course.includes('(Private)')));

  // Archiving needs every cycle archived first; restoring a cycle needs its sub-umbrella restored.
  assert.equal((await req('/sub-courses/' + pet.id, 'DELETE')).status, 409);
  ok(await req('/cycles/' + petOne.id, 'DELETE'));
  ok(await req('/sub-courses/' + pet.id, 'DELETE'));
  assert.equal((await req('/cycles/' + petOne.id + '/restore', 'POST')).status, 409);
  assert.equal(
    ok(await req(subPath, 'GET', undefined, junior)).subCourses.some(s => s.id === pet.id),
    false
  );
  ok(await req('/sub-courses/' + pet.id + '/restore', 'POST'));
  ok(await req('/cycles/' + petOne.id + '/restore', 'POST'));
  // Permanent deletion of a sub-umbrella uses the same preview and confirmation as cycles.
  const empty = ok(await req(subPath, 'POST', { name: 'CEPT' }));
  const deletion = ok(await req('/sub-courses/' + empty.id + '/deletion-preview'));
  assert.equal(
    (
      await req('/sub-courses/' + empty.id + '/permanent', 'DELETE', {
        confirm: false,
        version: deletion.version
      })
    ).status,
    400
  );
  ok(
    await req('/sub-courses/' + empty.id + '/permanent', 'DELETE', {
      confirm: true,
      confirmationName: 'CEPT',
      version: deletion.version
    })
  );
  assert.equal(await prisma.subCourse.findUnique({ where: { id: empty.id } }), null);

  // Roster import into a sub-umbrella: up to 3 students, numbered like other cycles there.
  const importer = ok(await req('/courses', 'POST', { name: 'Private import', code: '1T9999', isPrivate: true }));
  const ielts = ok(await req('/courses/' + importer.id + '/sub-courses', 'POST', { name: 'IELTS', bookPrice: 200 }));
  const bytes = await workbook({ reg: 'PRIVATE-IMPORT', amount: 1000, code: '1T9999' });
  const importBody = { branch: 'MIAMI', courseFee: 1000, totalHours: 10, subCourseId: ielts.id, cycleNumber: 1 };
  const preview = ok(await upload('/imports/' + importer.id + '/preview', bytes));
  assert.equal(
    (
      await req('/imports/' + importer.id + '/commit', 'POST', {
        ...importBody,
        subCourseId: undefined,
        previewToken: preview.previewToken,
        choices: { 'PRIVATE-IMPORT': { profile: 'fill', feeMode: 'standard' } }
      })
    ).status,
    400
  );
  const imported = ok(
    await req('/imports/' + importer.id + '/commit', 'POST', {
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
  const multi = ok(await upload('/imports/' + importer.id + '/preview', Buffer.from(await book.xlsx.writeBuffer())));
  assert.equal(multi.rows.length, 2);
  const pair = ok(
    await req('/imports/' + importer.id + '/commit', 'POST', {
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
    'PASS: private sub-umbrellas, numbering and naming, 3-seat capacity, book prices, archive/delete rules, finance metadata and roster import'
  );
} finally {
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
