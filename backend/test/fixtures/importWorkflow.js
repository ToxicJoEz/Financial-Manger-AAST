import { cairoToday, importedCycleFinished } from '../../src/utils/academyDate.js';
import assert from 'node:assert/strict';
import express from 'express';
import ExcelJS from 'exceljs';
import service from '../../src/vercel.js';
import prisma from '../../src/db/prisma.js';
const app = express();
app.use(service);
const server = app.listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/api`;
let token;
async function request(path, method = 'GET', body, auth = token, binary = false) {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': binary ? 'application/octet-stream' : 'application/json',
      ...(auth ? {
        Authorization: 'Bearer ' + auth
      } : {})
    },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body)
  });
  return {
    status: r.status,
    data: await r.json()
  };
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
  })) s.getCell(cell).value = value;
  return Buffer.from(await b.xlsx.writeBuffer());
}
try {
  token = ok(await request('/auth/login', 'POST', {
    username: 'main-admin',
    password: 'IsolatedDemoTest!123'
  })).token;
  const junior = ok(await request('/auth/login', 'POST', {
    username: 'Joe',
    password: 'IsolatedDemoTest!123'
  })).token;
  const userCount = await prisma.user.count(),
    studentCount = await prisma.student.count(),
    cycleCount = await prisma.cycle.count();
  const bytes = await workbook();
  assert.equal((await request('/imports/course-ket/preview', 'POST', bytes, null, true)).status, 401);
  assert.equal((await request('/imports/course-ket/preview', 'POST', bytes, junior, true)).status, 403);
  const p = ok(await request('/imports/course-ket/preview', 'POST', bytes, token, true));
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].dateOfBirth, '2005-01-02');
  assert.equal(p.rows[0].paymentMethod, 'CASH');
  assert.equal(p.startDate, '2026-10-06');
  assert.equal(await prisma.student.count(), studentCount);
  assert.equal(await prisma.cycle.count(), cycleCount);
  const body = {
    previewToken: p.previewToken,
    cycleNumber: 51,
    branch: 'MIAMI',
    courseFee: 1800,
    totalHours: 20,
    choices: {
      'IMPORT-1': {
        profile: 'fill',
        feeMode: 'discount',
        customFee: 1440
      }
    }
  };
  assert.equal((await request('/imports/course-ket/commit', 'POST', {
    ...body,
    choices: {}
  })).status, 400);
  assert.equal(await prisma.cycle.count(), cycleCount);
  assert.equal((await request('/imports/course-ket/commit', 'POST', body, junior)).status, 403);
  const imported = ok(await request('/imports/course-ket/commit', 'POST', body));
  assert.equal(imported.created, 1);
  const student = await prisma.student.findUnique({
    where: {
      registrationNumber: 'IMPORT-1'
    }
  });
  assert.equal(student.englishName, 'Test Student');
  assert.equal(student.nationality, 'مصري');
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      courseId: imported.cycleId
    }
  });
  assert.equal(enrollment.amountPaid, 1440);
  assert.equal(enrollment.customFee, 1440);
  const ledger = await prisma.paymentEntry.findFirst({
    where: {
      enrollmentId: enrollment.id
    }
  });
  assert.equal(ledger.receiptNumber, 'TEST-RECEIPT');
  assert.equal(ledger.paymentDateKnown, false);
  assert.equal(ledger.amountMinor, 144000n);
  assert.equal((await request('/imports/course-ket/commit', 'POST', body)).status, 409);
  assert.equal((await request('/imports/course-ket/preview', 'POST', bytes, token, true)).status, 409);
  const different = ok(await request('/imports/course-ket/preview', 'POST', await workbook({
    name: 'اسم مختلف',
    amount: 1500
  }), token, true));
  assert(different.rows[0].issues.some(i => i.includes('different student name')));
  assert.equal((await request('/imports/course-ket/commit', 'POST', {
    ...body,
    previewToken: different.previewToken,
    cycleNumber: 52
  })).status, 409);
  const reuse = ok(await request('/imports/course-ket/preview', 'POST', await workbook({
    amount: 1000,
    method: 'م'
  }), token, true));
  assert.equal((await request('/imports/course-ket/commit', 'POST', {
    ...body,
    previewToken: reuse.previewToken,
    cycleNumber: 52,
    choices: {
      'IMPORT-1': {
        profile: 'keep',
        feeMode: 'discount',
        customFee: 1000
      }
    }
  }, junior)).status, 403);
  const partial = ok(await request('/imports/course-ket/commit', 'POST', {
    ...body,
    previewToken: reuse.previewToken,
    cycleNumber: 52,
    instructorId: (await prisma.instructor.findFirst()).id,
    hourlyRate: 100,
    choices: {
      'IMPORT-1': {
        profile: 'keep',
        feeMode: 'discount',customFee:1000
      }
    }
  }));
  assert.equal(partial.reused, 1);
  assert.equal(await prisma.student.count(), studentCount + 1);
  assert(await prisma.courseInstructor.findFirst({
    where: {
      courseId: partial.cycleId
    }
  }));
  const pay = ok(await request(`/cycles/${partial.cycleId}/enrollments`));
  const e = pay.enrollments.find(e => e.studentId === student.id);
  // Existing pre-policy partial balances still support the immutable payment ledger.
  await prisma.enrollment.update({where:{id:e.id},data:{customFee:1800}});
  const paymentBody = {
    amount: 100,
    kind: 'PAYMENT',
    note: 'test payment',
    idempotencyKey: 'test-import-manual-payment',
    paymentMethod: 'CARD',
    receiptNumber: 'MANUAL-001'
  };
  const manual = ok(await request(`/cycles/${partial.cycleId}/enrollments/${e.id}/payments`, 'POST', paymentBody));
  assert.equal(manual.paymentMethod, 'CARD');
  const refreshedCycles = ok(await request('/cycles?parentCourseId=course-ket', 'GET', undefined, junior));
  const refreshedEnrollment = refreshedCycles.find(c => c.id === partial.cycleId).enrollments.find(row => row.id === e.id);
  assert(refreshedEnrollment.paymentSummary.some(p => p.paymentMethod === 'CARD' && p.receiptNumber === 'MANUAL-001' && p.amount === 100));
  assert.equal(refreshedEnrollment.payments, undefined);
  assert.equal(refreshedEnrollment.hourlyRate, undefined);

  assert.equal((await request(`/cycles/${partial.cycleId}/enrollments/${e.id}/payments`, 'POST', {
    ...paymentBody,
    paymentMethod: 'CASH'
  })).status, 409);
  const exported = ok(await request('/exports', 'POST', {
    sheets: {
      tuition: ['englishName', 'dateOfBirth', 'nationality', 'paymentMethods', 'receiptNumbers']
    },
    filters: {
      courseId: partial.cycleId
    }
  }));
  assert(JSON.stringify(exported).includes('MANUAL-001'));
  // A failure during payment insertion must roll back cycle, students and import history.
  const beforeRollback = {
    cycles: await prisma.cycle.count(),
    students: await prisma.student.count(),
    batches: await prisma.importBatch.count()
  };
  const late = ok(await request('/imports/course-ket/preview', 'POST', await workbook({
    reg: 'ROLLBACK-1',
    name: 'طالب اختبار التراجع',
    receipt: 'X'.repeat(101),
    amount: 1800
  }), token, true));
  assert.equal((await request('/imports/course-ket/commit', 'POST', {
    ...body,
    cycleNumber: 53,
    previewToken: late.previewToken,
    choices: {
      'ROLLBACK-1': {
        profile: 'fill'
      }
    }
  })).status, 400);
  assert.deepEqual({
    cycles: await prisma.cycle.count(),
    students: await prisma.student.count(),
    batches: await prisma.importBatch.count()
  }, beforeRollback);
  const stale = ok(await request('/imports/course-ket/preview', 'POST', await workbook({
    amount: 900
  }), token, true));
  await prisma.student.update({
    where: {
      id: student.id
    },
    data: {
      mobile: '01111111111'
    }
  });
  assert.equal((await request('/imports/course-ket/commit', 'POST', {
    ...body,
    cycleNumber: 53,
    previewToken: stale.previewToken,
    choices: {
      'IMPORT-1': {
        profile: 'replace',
        feeMode: 'discount',customFee:1000
      }
    }
  })).status, 409);
  const bad = ok(await request('/imports/course-ket/preview', 'POST', await workbook({
    reg: 'BAD-1',
    method: '?'
  }), token, true));
  assert(bad.rows[0].issues.length);
  const mismatch = ok(await request('/imports/course-ket/preview', 'POST', await workbook({
    reg: 'WRONG-1',
    code: 'OTHER'
  }), token, true));
  assert(mismatch.courseMismatch);
  const count = await prisma.cycle.count();
  assert.equal((await request('/imports/course-ket/commit', 'POST', {
    ...body,
    cycleNumber: 53,
    previewToken: mismatch.previewToken
  })).status, 400);
  assert.equal(await prisma.cycle.count(), count);
  assert.equal(await prisma.user.count(), userCount);

  assert.equal(cairoToday(new Date('2026-10-20T21:30:00Z')), '2026-10-21');
  assert.equal(importedCycleFinished('2026-10-21', new Date('2026-10-20T21:30:00Z')), true);
  assert.equal(importedCycleFinished('2026-10-22', new Date('2026-10-20T21:30:00Z')), false);
  const today = cairoToday();
  for (const [offset, finished] of [[-1,true],[0,true],[1,false]]) {
    const day = new Date(today+'T12:00:00Z'); day.setUTCDate(day.getUTCDate()+offset);
    const end = day.toISOString().slice(0,10);
    const raw = await workbook({reg:'DATE-'+offset,name:'طالب التاريخ '+offset,amount:1800});
    const preview = ok(await request('/imports/course-ket/preview','POST',raw,token,true));
    const createdCycle = ok(await request('/imports/course-ket/commit','POST',{...body,previewToken:preview.previewToken,cycleNumber:70+offset,startDate:'2020-01-01',endDate:end,instructorId:'',totalHours:'',choices:{['DATE-'+offset]:{profile:'fill'}}}));
    assert.equal(createdCycle.isFinished,finished);
    const saved = await prisma.cycle.findUnique({where:{id:createdCycle.cycleId}});
    assert.equal(saved.isFinished,finished); assert.equal(saved.isPaid,false);
    assert.equal(await prisma.payrollRecord.count({where:{courseId:saved.id}}),0);
  }

  assert.equal((await request('/finances/income?month=2026-13')).status,400);
  const incomeCycle=await prisma.cycle.create({data:{parentCourseId:'course-ket',cycleNumber:99,name:'October income test',branch:'MIAMI',startDate:new Date('2026-10-31T00:00:00Z'),endDate:new Date('2026-12-31T00:00:00Z'),courseFee:1000,enrollments:{create:{studentId:student.id,amountPaid:500,customFee:500}}}});
  assert.equal((await request('/finances/income?month=2026-10','GET',undefined,junior)).status,403);
  const octoberIncome=ok(await request('/finances/income?month=2026-10'));
  const incomeRow=octoberIncome.cycles.find(c=>c.id===incomeCycle.id);
  assert.equal(incomeRow.income,500);assert.equal(incomeRow.types.discounted,1);
  assert.equal(incomeRow.instructors,undefined);assert.equal(incomeRow.totalRemainingBalance,undefined);
  assert.equal(ok(await request('/finances/income?month=2026-12')).cycles.some(c=>c.id===incomeCycle.id),false);
  assert.equal((await request('/finances?month=2026-10','GET',undefined,junior)).status,403);
  console.log('PASS: Excel parsing, privacy, conflicts, discounts, partial payments, reuse, duplicate prevention, instructor approval, ledger metadata and exports');
} finally {
  server.close();
  server.closeAllConnections();
  await prisma.$disconnect();
}
