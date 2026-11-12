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
      ...(auth
        ? {
            Authorization: 'Bearer ' + auth
          }
        : {})
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
  const { cairoToday } = await import('../../src/utils/academyDate.js');
  const today = cairoToday(),
    priorDate = new Date(today + 'T00:00:00Z');
  priorDate.setUTCDate(priorDate.getUTCDate() - 1);
  const yesterday = priorDate.toISOString().slice(0, 10);
  const initialCount = await prisma.payrollEarning.count();

  assert.equal(await prisma.payrollEarning.count(), initialCount);
  const finances = ok(await req('/finances'));
  assert(finances.earnings.some(e => e.status === 'PAID' && !e.batch.actualPaymentDate && e.batch.legacy));
  const cycles = [];
  for (let n = 0; n < 5; n++) {
    const c = ok(
      await req('/cycles', 'POST', {
        parentCourseId: 'course-ket',
        cycleNumber: (n % 4) + 1,
        branch: n % 2 ? 'FOUAD' : 'MIAMI',
        courseFee: 1000,
        totalHours: 10,
        startDate: '2026-12-01'
      })
    );
    ok(await req('/cycles/' + c.id + '/instructors', 'POST', { instructorId: 'demo-instructor-1', hourlyRate: 100 }));
    ok(await req('/cycles/' + c.id + '/finish', 'POST', { totalHours: 10 }));
    cycles.push(c);
  }
  let rows = ok(await req('/finances')).earnings.filter(e => cycles.some(c => c.id === e.courseId));
  assert.equal(rows.length, 5);
  assert(rows.every(e => e.amount === 1000 && e.status === 'UNPAID' && !e.batch));
  assert.equal((await req('/finances', 'GET', undefined, junior)).status, 403);
  assert.equal((await req('/finances/batches', 'POST', {}, junior)).status, 403);
  assert.equal((await req('/cycles/' + cycles[0].id + '/payment', 'PUT', { isPaid: true })).status, 404);
  const chosen = rows.slice(0, 3),
    body = {
      earningIds: chosen.map(e => e.id),
      versions: Object.fromEntries(chosen.map(e => [e.id, e.updatedAt])),
      initiatedDate: yesterday,
      idempotencyKey: 'payroll-lifecycle-batch-001'
    };
  const batch = ok(await req('/finances/batches', 'POST', body));
  assert.equal(ok(await req('/finances/batches', 'POST', body)).id, batch.id);
  rows = ok(await req('/finances')).earnings.filter(e => cycles.some(c => c.id === e.courseId));
  assert.equal(rows.filter(e => e.status === 'PROCESSING').length, 3);
  assert.equal(rows.filter(e => e.status === 'UNPAID').length, 2);
  assert(
    rows
      .filter(e => e.status === 'PROCESSING')
      .every(e => e.batch.initiatedDate.slice(0, 10) === yesterday && e.batch.actualPaymentDate === null)
  );
  assert.equal(
    (await req('/finances/batches', 'POST', { ...body, idempotencyKey: 'payroll-duplicate-earnings' })).status,
    409
  );
  assert.equal(
    (await req('/finances/batches/' + batch.id + '/pay', 'POST', { actualPaymentDate: '2026-02-30' })).status,
    400
  );
  ok(await req('/finances/batches/' + batch.id + '/pay', 'POST', { actualPaymentDate: today }));
  assert.equal((await req('/finances/batches/' + batch.id + '/pay', 'POST', { actualPaymentDate: today })).status, 409);
  const paid = ok(await req('/finances')).batches.find(b => b.id === batch.id);
  assert.equal(paid.amount, 3000);
  assert.equal(paid.initiatedDate.slice(0, 10), yesterday);
  assert.equal(paid.actualPaymentDate.slice(0, 10), today);
  const report = ok(
    await req('/exports', 'POST', {
      sheets: { payroll: ['instructor', 'earned', 'status', 'initiatedDate', 'actualPaymentDate'] },
      filters: { from: today, to: today, payrollStatus: 'PAID', payrollDateBasis: 'actualPaymentDate' }
    })
  );
  assert.equal(report.sheets[0].rows.filter(r => r.actualPaymentDate === today).length, 3);
  const paidCycle = chosen[0].courseId;
  // A cycle whose earnings are paid cannot be reopened; the refusal says where the earnings are.
  const refused = await req('/cycles/' + paidCycle + '/revert', 'POST', {});
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /Payment batch \d+ · .+ \(paid\)/);
  assert(ok(await req('/finances')).earnings.some(e => e.courseId === paidCycle && e.status === 'PAID'));
  assert.equal((await req('/cycles/' + paidCycle + '/finish', 'POST', { totalHours: 11 })).status, 409);
  const plan = ok(await req('/cycles/' + paidCycle + '/deletion-preview'));
  assert.equal(
    (
      await req('/cycles/' + paidCycle + '/permanent', 'DELETE', {
        confirm: true,
        confirmationName: plan.name,
        version: plan.version
      })
    ).status,
    409
  );
  ok(await req('/cycles/' + paidCycle, 'DELETE'));
  assert(ok(await req('/finances')).earnings.some(e => e.courseId === paidCycle));
  const another = await prisma.payrollEarning.findFirst({
    where: { instructorId: 'demo-instructor-2', batchId: null }
  });
  const unpaid = rows.find(e => e.status === 'UNPAID');
  assert.equal(
    (
      await req('/finances/batches', 'POST', {
        earningIds: [unpaid.id, another.id],
        versions: { [unpaid.id]: unpaid.updatedAt, [another.id]: another.updatedAt.toISOString() },
        initiatedDate: today,
        idempotencyKey: 'payroll-mixed-instructor'
      })
    ).status,
    400
  );
  const multi = ok(
    await req('/cycles', 'POST', {
      parentCourseId: 'course-ket',
      cycleNumber: 4,
      branch: 'MIAMI',
      courseFee: 1000,
      totalHours: 10,
      startDate: '2026-12-01'
    })
  );
  for (const instructorId of ['demo-instructor-1', 'demo-instructor-2'])
    ok(await req('/cycles/' + multi.id + '/instructors', 'POST', { instructorId, hourlyRate: 100 }));
  const assignments = await prisma.courseInstructor.findMany({ where: { courseId: multi.id } });
  ok(
    await req('/cycles/' + multi.id + '/finish', 'POST', {
      totalHours: 10,
      instructorHours: assignments.map((a, i) => ({ courseInstructorId: a.id, hoursTaught: i ? 6 : 4 }))
    })
  );
  assert.deepEqual(
    ok(await req('/finances'))
      .earnings.filter(e => e.courseId === multi.id)
      .map(e => e.amount)
      .sort(),
    [400, 600]
  );
  const mixedRows = [unpaid, another];
  const mixedBody = {
    earningIds: mixedRows.map(r => r.id),
    versions: Object.fromEntries(
      mixedRows.map(r => [r.id, typeof r.updatedAt === 'string' ? r.updatedAt : r.updatedAt.toISOString()])
    ),
    initiatedDate: today,
    idempotencyKey: 'mixed-instructor-selection-001'
  };
  const beforeMixed = await prisma.instructorPaymentBatch.count();
  assert.equal((await req('/finances/selected-payments', 'POST', mixedBody, junior)).status, 403);
  assert.equal(
    (
      await req('/finances/selected-payments', 'POST', {
        ...mixedBody,
        versions: { ...mixedBody.versions, [another.id]: 'stale' }
      })
    ).status,
    409
  );
  assert.equal(await prisma.instructorPaymentBatch.count(), beforeMixed);
  const mixedPayment = ok(await req('/finances/selected-payments', 'POST', mixedBody));
  assert.equal(mixedPayment.batchIds.length, 2);
  assert.deepEqual(
    ok(await req('/finances/selected-payments', 'POST', mixedBody)).batchIds.sort(),
    [...mixedPayment.batchIds].sort()
  );
  const mixedBatches = await prisma.instructorPaymentBatch.findMany({
    where: { id: { in: mixedPayment.batchIds } },
    include: { earnings: true }
  });
  assert(mixedBatches.every(b => b.earnings.length === 1));
  // Both employees' payments from one initiation share one numbered batch.
  assert.equal(new Set(mixedBatches.map(b => b.runId)).size, 1);
  const mixedRun = await prisma.paymentRun.findUnique({ where: { id: mixedBatches[0].runId } });
  assert.equal(mixedRun.initiatedDate.toISOString().slice(0, 10), today);
  const sameMonth = await prisma.paymentRun.findMany({ where: { year: mixedRun.year, month: mixedRun.month } });
  assert.deepEqual(
    sameMonth.map(r => r.number).sort((a, b) => a - b),
    sameMonth.map((_, i) => i + 1)
  );
  assert.equal(
    await prisma.payrollEarning.count({ where: { id: { in: mixedBody.earningIds }, batchId: { not: null } } }),
    2
  );
  const courseRows = ok(await req('/finances')).earnings.filter(e => e.courseId === multi.id);
  const courseBody = {
    earningIds: courseRows.map(e => e.id),
    courseIds: [multi.id],
    versions: Object.fromEntries(courseRows.map(e => [e.id, e.updatedAt])),
    initiatedDate: '2020-01-15',
    idempotencyKey: 'course-all-instructors-001'
  };
  assert.equal((await req('/finances/course-payments', 'POST', courseBody, junior)).status, 403);
  assert.equal(
    (await req('/finances/course-payments', 'POST', { ...courseBody, earningIds: [courseRows[0].id] })).status,
    409
  );
  const countBefore = await prisma.instructorPaymentBatch.count();
  assert.equal(
    (
      await req('/finances/course-payments', 'POST', {
        ...courseBody,
        versions: { ...courseBody.versions, [courseRows[1].id]: 'stale' }
      })
    ).status,
    409
  );
  assert.equal(await prisma.instructorPaymentBatch.count(), countBefore);
  assert.equal(await prisma.payrollEarning.count({ where: { courseId: multi.id, batchId: null } }), 2);
  const coursePayment = ok(await req('/finances/course-payments', 'POST', courseBody));
  assert.equal(coursePayment.batchIds.length, 2);
  assert.deepEqual(
    ok(await req('/finances/course-payments', 'POST', courseBody)).batchIds.sort(),
    [...coursePayment.batchIds].sort()
  );
  ok(
    await req('/finances/course-payments/pay', 'POST', {
      batchIds: coursePayment.batchIds,
      courseIds: [multi.id],
      actualPaymentDate: '2020-02-10'
    })
  );
  const january = ok(await req('/finances?month=2020-01')).monthly;
  const february = ok(await req('/finances?month=2020-02')).monthly;
  const monthlySummary = ok(await req('/finances?month=2020-02')).summary;
  assert.deepEqual(monthlySummary, { totalPaid: 1000, instructorsPaid: 2, cyclesPaid: 1, paymentsCompleted: 2 });
  assert.deepEqual(ok(await req('/finances?month=2020-01')).summary, {
    totalPaid: 0,
    instructorsPaid: 0,
    cyclesPaid: 0,
    paymentsCompleted: 0
  });
  const salaryExport = ok(
    await req('/exports', 'POST', {
      sheets: { payroll: ['instructor', 'earned', 'actualPaymentDate'] },
      filters: { salaryMonth: '2020-02', from: '1900-01-01', to: '2099-12-31', payrollDateBasis: 'initiatedDate' }
    })
  );
  assert.equal(
    salaryExport.sheets[0].rows.reduce((sum, r) => sum + r.earned, 0),
    1000
  );
  assert(salaryExport.sheets[0].rows.every(r => r.actualPaymentDate.startsWith('2020-02')));
  assert.equal(
    ok(await req('/exports', 'POST', { sheets: { payroll: ['earned'] }, filters: { salaryMonth: '2020-01' } }))
      .sheets[0].rows.length,
    0
  );
  assert.equal(
    (await req('/exports', 'POST', { sheets: { payroll: ['earned'] }, filters: { salaryMonth: '2020-13' } })).status,
    400
  );
  assert.equal(january.totalPaid, 0);
  assert.equal(february.totalPaid, 1000);
  assert.equal(february.instructors.length, 2);
  assert.equal(
    february.instructors.reduce((sum, i) => sum + i.totalPaid, 0),
    1000
  );
  assert.equal((await req('/finances?month=2020-13')).status, 400);
  // One initiation is one numbered batch; "Confirm all pending" pays every processing payment in it.
  const openRun = (
    await prisma.paymentRun.findMany({ include: { payments: { where: { status: 'PROCESSING' } } } })
  ).sort((a, b) => b.payments.length - a.payments.length)[0];
  assert(openRun.payments.length >= 2);
  const dailyIds = openRun.payments.map(p => p.id);
  const runPay = '/finances/runs/' + openRun.id + '/pay';
  assert.equal((await req(runPay, 'POST', { batchIds: dailyIds, actualPaymentDate: today }, junior)).status, 403);
  ok(await req('/finances/batches/' + dailyIds[0] + '/pay', 'POST', { actualPaymentDate: today }));
  assert.equal((await req(runPay, 'POST', { batchIds: dailyIds, actualPaymentDate: today })).status, 409);
  const remaining = dailyIds.slice(1);
  assert.equal((await req(runPay, 'POST', { batchIds: remaining, actualPaymentDate: 'not-a-date' })).status, 400);
  assert.equal(
    await prisma.instructorPaymentBatch.count({ where: { id: { in: remaining }, status: 'PROCESSING' } }),
    remaining.length
  );
  ok(await req(runPay, 'POST', { batchIds: remaining, actualPaymentDate: today }));
  assert.equal(
    await prisma.instructorPaymentBatch.count({ where: { id: { in: dailyIds }, status: 'PAID' } }),
    dailyIds.length
  );
  // A wrongly confirmed payment can go back to Processing: whole batches, or only some of their items.
  const paidBatch = await prisma.instructorPaymentBatch.findFirst({
    where: { status: 'PAID', earnings: { some: {} } },
    include: { earnings: true },
    orderBy: { createdAt: 'desc' }
  });
  const versionsOf = rows => Object.fromEntries(rows.map(r => [r.id, r.updatedAt.toISOString()]));
  assert.equal(
    (
      await req(
        '/finances/return-to-processing',
        'POST',
        { earningIds: [paidBatch.earnings[0].id], versions: versionsOf(paidBatch.earnings) },
        junior
      )
    ).status,
    403
  );
  assert.equal(
    (await req('/finances/return-to-processing', 'POST', { earningIds: [paidBatch.earnings[0].id], versions: {} }))
      .status,
    409
  );
  const unpaidItem = await prisma.payrollEarning.findFirst({ where: { batchId: null } });
  if (unpaidItem)
    assert.equal(
      (
        await req('/finances/return-to-processing', 'POST', {
          earningIds: [unpaidItem.id],
          versions: versionsOf([unpaidItem])
        })
      ).status,
      409
    );
  // Part of a batch: only the selected item leaves; the rest stay paid with their payment date.
  const partialBatch =
    (await prisma.instructorPaymentBatch.findMany({ where: { status: 'PAID' }, include: { earnings: true } })).find(
      b => b.earnings.length > 1
    ) || paidBatch;
  const [undoItem, ...keptItems] = partialBatch.earnings;
  assert(keptItems.length > 0, 'expected a paid batch with several items');
  ok(
    await req('/finances/return-to-processing', 'POST', { earningIds: [undoItem.id], versions: versionsOf([undoItem]) })
  );
  const movedItem = await prisma.payrollEarning.findUnique({ where: { id: undoItem.id }, include: { batch: true } });
  assert.equal(movedItem.batch.status, 'PROCESSING');
  assert.equal(movedItem.batch.actualPaymentDate, null);
  assert.equal(movedItem.batch.initiatedDate?.toISOString(), partialBatch.initiatedDate?.toISOString());
  assert.equal(movedItem.batch.runId, partialBatch.runId);
  if (keptItems.length) {
    assert.notEqual(movedItem.batchId, partialBatch.id);
    const kept = await prisma.instructorPaymentBatch.findUnique({
      where: { id: partialBatch.id },
      include: { earnings: true }
    });
    assert.equal(kept.status, 'PAID');
    assert(kept.actualPaymentDate);
    assert.deepEqual(kept.earnings.map(e => e.id).sort(), keptItems.map(e => e.id).sort());
  }
  // A whole batch: the batch itself returns to Processing; it can then be confirmed again.
  const whole = await prisma.instructorPaymentBatch.findFirst({
    where: { status: 'PAID', id: { not: partialBatch.id }, earnings: { some: {} } },
    include: { earnings: true }
  });
  ok(
    await req('/finances/return-to-processing', 'POST', {
      earningIds: whole.earnings.map(e => e.id),
      versions: versionsOf(whole.earnings)
    })
  );
  const reopened = await prisma.instructorPaymentBatch.findUnique({ where: { id: whole.id } });
  assert.equal(reopened.status, 'PROCESSING');
  assert.equal(reopened.actualPaymentDate, null);
  assert.equal(reopened.paidBy, null);
  ok(await req('/finances/batches/' + whole.id + '/pay', 'POST', { actualPaymentDate: today }));
  assert.equal((await prisma.instructorPaymentBatch.findUnique({ where: { id: whole.id } })).status, 'PAID');
  // Payments can join a batch that is still processing; they take its initiation date.
  const processingRun = movedItem.batch.runId;
  const extra = await prisma.payrollEarning.findFirst({ where: { batchId: null, amountMinor: { gt: 0n } } });
  assert(extra, 'expected an unpaid salary item');
  const joinBody = {
    earningIds: [extra.id],
    versions: versionsOf([extra]),
    initiatedDate: '2030-01-01',
    runId: processingRun,
    idempotencyKey: 'join-open-run-00001'
  };
  const fullyPaidRun = (await prisma.instructorPaymentBatch.findUnique({ where: { id: whole.id } })).runId;
  if (!(await prisma.instructorPaymentBatch.count({ where: { runId: fullyPaidRun, status: 'PROCESSING' } })))
    assert.equal((await req('/finances/selected-payments', 'POST', { ...joinBody, runId: fullyPaidRun })).status, 409);
  const joined = ok(await req('/finances/selected-payments', 'POST', joinBody));
  const joinedPayment = await prisma.instructorPaymentBatch.findUnique({
    where: { id: joined.batchIds[0] },
    include: { run: true }
  });
  assert.equal(joinedPayment.runId, processingRun);
  assert.equal(joinedPayment.initiatedDate.toISOString(), joinedPayment.run.initiatedDate.toISOString());
  // Returning every processing payment of a batch leaves it cancelled; its number stays reserved.
  const runEarnings = await prisma.payrollEarning.findMany({
    where: { batch: { runId: processingRun, status: 'PROCESSING' } }
  });
  ok(
    await req('/finances/return-to-unpaid', 'POST', {
      earningIds: runEarnings.map(e => e.id),
      versions: versionsOf(runEarnings)
    })
  );
  const runPayments = await prisma.instructorPaymentBatch.findMany({ where: { runId: processingRun } });
  assert(runPayments.every(p => p.status !== 'PROCESSING'));
  assert(await prisma.paymentRun.findUnique({ where: { id: processingRun } }));
  console.log(
    'PASS: per-cycle earnings, selected 3-of-5 batch payment, both dates, unpaid remainder, legacy unknown dates, idempotency, role isolation, immutable paid earnings, paidBatch-instructor hours, exports and archive protection, and undoing paid items back to processing (whole or partial batches), numbered batches, joining an open batch and cancelled batches.'
  );
} finally {
  server.closeAllConnections();
  await new Promise(r => server.close(r));
  await prisma.$disconnect();
}
