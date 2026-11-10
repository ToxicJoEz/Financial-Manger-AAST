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

function makeSheet(book, name, headersAt = 4) {
  const s = book.addWorksheet(name);
  s.getCell('E2').value = 'Employee / 9999 EGP per hour';
  for (const [col, text] of Object.entries({
    B: 'NO',
    C: 'Start Date',
    D: 'Name',
    E: 'Phone Number',
    F: 'COURSE',
    G: 'End Date',
    H: 'Duration',
    I: 'Currency',
    J: 'Amount',
    K: 'Payment',
    L: 'Books'
  }))
    s.getCell(col + headersAt).value = text;
  return s;
}
async function workbook() {
  const book = new ExcelJS.Workbook(),
    s = makeSheet(book, 'مي عادل');
  // Rows 5-6: two students sharing merged cells (one cycle, 7000 split 3500 / 3500).
  const values = {
    C5: '11/9/20226',
    D5: 'Different spelling existing student',
    E5: '+20 1000000000',
    F5: 'KET 2',
    G5: '21/09/2026',
    H5: '18:30 Hrs / 999 EGP',
    I5: 'EGP',
    J5: 7000,
    K5: 'IGNORE',
    L5: 'IGNORE',
    D6: 'Second student',
    E6: '01011111111',
    // Row 8: a separate student whose "KET 2" clashes with the group above.
    C8: '01/10/2026',
    D8: 'Third student',
    E8: '01044444444',
    F8: 'KET 2 / S',
    H8: '10 Hrs / 150 EGP',
    I8: 'EGP',
    J8: 5500
  };
  for (const [c, v] of Object.entries(values)) s.getCell(c).value = v;
  for (const col of ['C', 'F', 'G', 'H', 'I', 'J']) s.mergeCells(`${col}5:${col}6`);
  s.getCell('B7').value = 500;
  const t = makeSheet(book, 'New teacher', 5);
  for (const [c, v] of Object.entries({
    C6: '02/11/2026',
    D6: 'Free new student',
    E6: '01022222222',
    F6: 'IELTS',
    H6: '20 Hrs / 140 EGP',
    I6: 'EGP',
    J6: 'FREE',
    K6: 1
  }))
    t.getCell(c).value = v;
  return Buffer.from(await book.xlsx.writeBuffer());
}
const numbersOf = preview => Object.fromEntries(preview.groups.map(g => [g.id, g.cycleNumber]));
try {
  token = ok(await req('/auth/login', 'POST', { username: 'main-admin', password: 'IsolatedDemoTest!123' })).token;
  const junior = ok(await req('/auth/login', 'POST', { username: 'Joe', password: 'IsolatedDemoTest!123' })).token;
  const existing = await prisma.student.create({ data: { name: 'الطالب الموجود', mobile: '01000000000' } });
  const parent = ok(
    await req('/courses', 'POST', { name: 'Private import academy', code: 'PRIVATE-BULK', isPrivate: true })
  );
  const ket = ok(await req('/courses/' + parent.id + '/sub-courses', 'POST', { name: 'KET', bookPrice: 50 }));
  const path = '/imports/' + parent.id + '/private';
  const bytes = await workbook();
  const forbidden = await fetch(base + path + '/preview', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + junior, 'Content-Type': 'application/octet-stream' },
    body: bytes
  });
  assert.equal(forbidden.status, 403);

  let preview = ok(await upload(path + '/preview', bytes));
  assert.equal(preview.rows.length, 4);
  assert.equal(preview.sheets.length, 2);
  assert.equal(preview.groups.length, 3);
  const pair = preview.groups.find(g => g.rowIds.length === 2),
    third = preview.groups.find(g => g.sourceRows[0] === 8),
    free = preview.groups.find(g => g.sheetId === '1');
  const [first, second] = pair.rowIds.map(id => preview.rows.find(r => r.id === id));
  assert.equal(first.startDate, '2026-09-11');
  assert.equal(first.hours, 18.5);
  assert.equal(first.hourlyRate, '999');
  assert(first.notes.some(n => n.includes('20226')));
  assert.equal(first.matches[0].id, existing.id);
  assert.deepEqual([first.amount, second.amount], [3500, 3500]);
  assert.deepEqual(pair.sharedAmount, { total: 7000, students: 2 });
  assert.equal(pair.subCourseName, 'KET');
  assert.equal(pair.cycleNumber, 2);
  assert.equal(pair.numberSource, 'file');
  assert.equal(pair.newSubCourse, false);
  // Levels come from the file ("KET 2"); a repeat in the same branch and month is named "(2)" on import.
  assert.equal(third.cycleNumber, 2);
  assert(!third.errors.some(e => e.includes('already exists')));
  assert(preview.rows.find(r => r.id === third.rowIds[0]).notes.some(n => n.includes('/ S')));
  assert.equal(free.subCourseName, 'IELTS');
  assert.equal(free.cycleNumber, null);
  assert.equal(free.numberSource, 'missing');
  assert(free.errors.some(e => e.includes('Enter the level')));
  assert.deepEqual(preview.newSubCourses, ['IELTS']);

  const edits = Object.fromEntries(preview.rows.map(r => [r.id, { ...r, branch: 'MIAMI' }]));
  preview = ok(
    await req(path + '/review', 'POST', {
      previewToken: preview.previewToken,
      edits,
      numbers: { [third.id]: 3, [free.id]: 1 }
    })
  );
  assert(preview.rows.every(r => !r.errors.length));
  assert(
    preview.groups.every(g => !g.errors.length),
    JSON.stringify(preview.groups.map(g => g.errors))
  );
  assert.equal(preview.groups.find(g => g.id === third.id).cycleNumber, 3);
  const employees = {
    0: { mode: 'existing', employeeId: 'demo-instructor-1' },
    1: { mode: 'new', name: 'موظف جديد', employeeId: 'NEW-PRIVATE-EMP' }
  };
  const payload = {
    previewToken: preview.previewToken,
    rowIds: preview.rows.map(r => r.id),
    numbers: numbersOf(preview),
    newSubCourses: { IELTS: { bookPrice: 75 } },
    employees,
    students: {}
  };
  const before = await prisma.cycle.count();
  // Students who study together must be selected together.
  assert.equal(
    (await req(path + '/commit', 'POST', { ...payload, rowIds: payload.rowIds.filter(id => id !== pair.rowIds[1]) }))
      .status,
    400
  );
  const invalidRate = ok(
    await req(path + '/review', 'POST', {
      previewToken: preview.previewToken,
      edits: { [free.rowIds[0]]: { hourlyRate: '' } },
      numbers: { [third.id]: 3, [free.id]: 1 }
    })
  );
  assert.equal(
    (await req(path + '/commit', 'POST', { ...payload, previewToken: invalidRate.previewToken })).status,
    400
  );
  assert.equal(await prisma.cycle.count(), before);
  assert.equal(await prisma.instructor.count({ where: { employeeId: 'NEW-PRIVATE-EMP' } }), 0);
  assert.equal(await prisma.subCourse.count({ where: { parentCourseId: parent.id, name: 'IELTS' } }), 0);

  const result = ok(await req(path + '/commit', 'POST', payload));
  assert.equal(result.cycles.length, 3);
  assert.equal(result.enrolled, 4);
  assert.equal(result.created, 3);
  assert.equal(result.reused, 1);
  assert.deepEqual(result.createdSubCourses, ['IELTS']);
  const cycles = await prisma.cycle.findMany({
    where: { parentCourseId: parent.id },
    include: {
      subCourse: true,
      instructors: true,
      enrollments: { include: { student: true, bookPayments: true, payments: true }, orderBy: { amountPaid: 'desc' } },
      payrollEarnings: true
    }
  });
  // Names are "<sub-umbrella> <level> - <start month year>"; keyed here by "<sub-umbrella> <level>".
  assert(
    cycles.every(c => / - [A-Z][a-z]+ \d{4}$/.test(c.name)),
    JSON.stringify(cycles.map(c => c.name))
  );
  const byName = Object.fromEntries(cycles.map(c => [c.name.split(' - ')[0], c]));
  assert.deepEqual(Object.keys(byName).sort(), ['IELTS 1', 'KET 2', 'KET 3']);
  const grouped = byName['KET 2'];
  assert.equal(grouped.subCourseId, ket.id);
  assert.equal(grouped.courseFee, 3500);
  assert.equal(grouped.enrollments.length, 2);
  assert(grouped.enrollments.every(e => e.amountPaid === 3500 && e.customFee === null));
  assert(grouped.enrollments.some(e => e.studentId === existing.id));
  assert.equal(grouped.totalHours, 18.5);
  assert.equal(grouped.instructors.length, 1);
  assert.equal(grouped.instructors[0].hourlyRate, 999);
  // Payroll counts the shared hours once, not once per student.
  assert.equal(grouped.payrollEarnings.length, 1);
  assert.equal(grouped.payrollEarnings[0].amountMinor, 1848150n);
  assert(grouped.isFinished);
  assert.equal(byName['KET 3'].instructors[0].hourlyRate, 150);
  const ielts = byName['IELTS 1'];
  assert.equal(ielts.subCourse.bookPrice, 75);
  assert(!ielts.isFinished);
  assert.equal(ielts.enrollments[0].customFee, 0);
  assert.equal(ielts.enrollments[0].amountPaid, 0);
  assert(cycles.every(c => c.enrollments.every(e => e.bookPayments.length === 0)));
  assert.equal(grouped.enrollments[0].payments[0].paymentMethod, 'UNSPECIFIED');
  assert.equal((await prisma.importBatch.findUnique({ where: { cycleId: grouped.id } })).studentCount, 2);
  assert.equal((await req(path + '/commit', 'POST', payload)).status, 409);
  assert.equal(ok(await upload(path + '/preview', bytes)).groups.filter(g => g.alreadyImported).length, 3);

  // Multiple phone matches are never silently merged.
  const extra = await prisma.student.create({ data: { name: 'نفس الهاتف', mobile: existing.mobile } });
  const freshParent = ok(
    await req('/courses', 'POST', { name: 'Another private umbrella', code: 'PRIVATE-BULK-2', isPrivate: true })
  );
  const other = '/imports/' + freshParent.id + '/private';
  let conflict = ok(await upload(other + '/preview', bytes));
  conflict = ok(await req(other + '/review', 'POST', { previewToken: conflict.previewToken, edits }));
  const conflictPair = conflict.groups.find(g => g.rowIds.length === 2);
  const choicePayload = {
    ...payload,
    previewToken: conflict.previewToken,
    rowIds: conflictPair.rowIds,
    numbers: numbersOf(conflict),
    newSubCourses: { KET: { bookPrice: 60 } }
  };
  assert.equal((await req(other + '/commit', 'POST', choicePayload)).status, 400);
  ok(await req(other + '/commit', 'POST', { ...choicePayload, students: { [conflictPair.rowIds[0]]: extra.id } }));
  assert.equal(
    (await prisma.subCourse.findFirst({ where: { parentCourseId: freshParent.id, name: 'KET' } })).bookPrice,
    60
  );
  // A changed phone creates a fresh profile, even when the name is identical.
  const editRow = conflict.rows.find(r => r.id === conflict.groups.find(g => g.sheetId === '1').rowIds[0]);
  const changed = ok(
    await req(other + '/review', 'POST', {
      previewToken: conflict.previewToken,
      edits: { [editRow.id]: { name: existing.name, mobile: '01033333333', branch: 'MIAMI' } },
      numbers: { [conflict.groups.find(g => g.sheetId === '1').id]: 1 }
    })
  );
  const next = ok(
    await req(other + '/commit', 'POST', {
      ...payload,
      previewToken: changed.previewToken,
      rowIds: [editRow.id],
      numbers: numbersOf(changed),
      newSubCourses: { IELTS: { bookPrice: 0 } },
      employees: { 1: { mode: 'existing', employeeId: 'demo-instructor-2' } }
    })
  );
  const newCycle = await prisma.cycle.findUnique({ where: { id: next.cycles[0].id }, include: { enrollments: true } });
  assert.notEqual(newCycle.enrollments[0].studentId, existing.id);
  assert.equal((await req('/imports/course-ket/private/preview', 'POST', {})).status, 404);
  console.log(
    'PASS: private workbook groups from merged cells, split shared tuition, single payroll per group, sub-umbrella mapping and creation, cycle number conflicts, rate pre-fill, phone identity and atomic replay guards'
  );
} finally {
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
