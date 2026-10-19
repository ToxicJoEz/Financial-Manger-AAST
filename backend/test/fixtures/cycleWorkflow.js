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
      ...(auth ? {
        Authorization: 'Bearer ' + auth
      } : {})
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
  token = ok(await req('/auth/login', 'POST', {
    username: 'main-admin',
    password: 'IsolatedDemoTest!123'
  })).token;
  const junior = ok(await req('/auth/login', 'POST', {
    username: 'Joe',
    password: 'IsolatedDemoTest!123'
  })).token;
  const initialUsers = await prisma.user.count();
  assert.equal((await req('/courses', 'POST', {
    name: 'Blocked',
    code: 'NO'
  }, junior)).status, 403);
  assert.equal((await req('/courses', 'POST', {
    name: 'Duplicate',
    code: '1T1036'
  })).status, 409);
  const ket = ok(await req('/courses/course-ket'));
  assert.equal(ket.nextCycleNumber, 15);
  const baseCycle = {
    parentCourseId: 'course-ket',
    cycleNumber: 12932193,
    branch: 'MIAMI',
    totalHours: 10,
    courseFee: 1000
  };
  const manual = ok(await req('/cycles', 'POST', baseCycle));
  assert.equal(manual.name, 'KET 12932193');
  assert.equal((await req('/cycles', 'POST', {
    ...baseCycle,
    branch: 'FOUAD'
  })).status, 409);
  ok(await req('/cycles', 'POST', {
    ...baseCycle,
    parentCourseId: 'course-pet'
  }));
  assert.equal(ok(await req('/courses/course-ket')).nextCycleNumber, 12932194);
  ok(await req('/cycles/' + manual.id, 'PUT', {
    cycleNumber: 12932192
  }));
  assert.equal(ok(await req('/cycles?parentCourseId=course-ket')).every(c => c.parentCourseId === 'course-ket'), true);
  ok(await req('/cycles/' + manual.id, 'DELETE'));
  assert.equal((await req('/cycles', 'POST', {
    ...baseCycle,
    cycleNumber: 12932192
  })).status, 409);
  for (const number of [0, -1, 1.5, true, 'bad']) assert.equal((await req('/cycles', 'POST', {
    ...baseCycle,
    cycleNumber: number
  })).status, 400);
  const race = await Promise.all([req('/cycles', 'POST', {
    ...baseCycle,
    cycleNumber: 25
  }), req('/cycles', 'POST', {
    ...baseCycle,
    cycleNumber: 25,
    branch: 'FOUAD'
  })]);
  assert.deepEqual(race.map(r => r.status).sort(), [201, 409]);
  const cycle = ok(await req('/cycles', 'POST', {
    ...baseCycle,
    cycleNumber: 15
  }));
  const request = ok(await req('/cycles/' + cycle.id + '/instructors', 'POST', {
    instructorId: 'demo-instructor-1'
  }, junior));
  ok(await req('/assignments/' + request.pending.id + '/approve', 'POST', {
    hourlyRate: 100
  }));
  const enrollment = ok(await req('/cycles/' + cycle.id + '/enrollments', 'POST', {
    studentId: 'demo-student-1',
    recordPayment: true,
    amountPaid: 400
  }, junior));
  assert.equal(enrollment.amountPaid, 400);
  const payments = '/cycles/' + cycle.id + '/enrollments/' + enrollment.id + '/payments';
  assert.equal((await req(payments, 'POST', {
    amount: 601,
    note: 'Too much',
    idempotencyKey: 'cycles-overpay-001'
  })).status, 400);
  ok(await req(payments, 'POST', {
    amount: 600,
    note: 'Remaining tuition',
    idempotencyKey: 'cycles-payment-001'
  }));
  const assignment = await prisma.courseInstructor.findFirst({
    where: {
      courseId: cycle.id
    }
  });
  assert.equal((await req('/cycles/' + cycle.id + '/payment', 'PUT', {
    isPaid: true
  })).status, 400);
  assert.equal((await req('/cycles/' + cycle.id + '/finish', 'POST', {
    totalHours: 10,
    payrollMonth: '2026-10',
    instructorHours: [{
      courseInstructorId: 'wrong-id',
      hoursTaught: 10
    }]
  })).status, 400);
  ok(await req('/cycles/' + cycle.id + '/finish', 'POST', {
    totalHours: 10,
    payrollMonth: '2026-10',
    instructorHours: [{
      courseInstructorId: assignment.id,
      hoursTaught: 10
    }]
  }));
  ok(await req('/cycles/' + cycle.id + '/payment', 'PUT', {
    isPaid: true
  }));
  const original = await prisma.payrollRecord.findUnique({
    where: {
      courseId: cycle.id
    }
  });
  ok(await req('/cycles/' + cycle.id + '/revert', 'POST', {}));
  assert(ok(await req('/finances?month=2026-10')).courses.some(c => c.id === cycle.id && c.isPaid));
  ok(await req('/courses/course-ket', 'PUT', {
    name: 'KET UPDATED',
    code: 'KET-UPDATED'
  }));
  const renamed = await prisma.cycle.findUnique({
    where: {
      id: cycle.id
    }
  });
  assert.equal(renamed.name, 'KET UPDATED 15');
  assert.equal((await prisma.payrollRecord.findUnique({
    where: {
      courseId: cycle.id
    }
  })).name, original.name);
  const report = ok(await req('/exports', 'POST', {
    sheets: {
      courses: ['course', 'courseName', 'courseCode', 'cycleNumber'],
      payroll: ['course', 'courseCode', 'earned']
    },
    filters: {
      parentCourseId: 'course-ket'
    }
  }));
  assert(report.sheets[0].rows.every(row => row.courseName === 'KET UPDATED' && row.courseCode === 'KET-UPDATED'));
  assert.equal((await req('/courses/course-ket', 'DELETE')).status, 409);
  const empty = ok(await req('/courses', 'POST', {
    name: 'Archive checks',
    code: 'ARC-001'
  }));
  const child = ok(await req('/cycles', 'POST', {
    ...baseCycle,
    parentCourseId: empty.id,
    cycleNumber: 1
  }));
  ok(await req('/cycles/' + child.id, 'DELETE'));
  ok(await req('/courses/' + empty.id, 'DELETE'));
  assert.equal((await req('/cycles/' + child.id + '/restore', 'POST', {})).status, 409);
  assert.equal((await req('/cycles', 'POST', {
    ...baseCycle,
    parentCourseId: empty.id,
    cycleNumber: 2
  })).status, 400);
  ok(await req('/courses/' + empty.id + '/restore', 'POST', {}));
  ok(await req('/cycles/' + child.id + '/restore', 'POST', {}));
  assert.equal(await prisma.user.count(), initialUsers);
  console.log('PASS: course/cycle hierarchy, role guards, numbering and concurrent conflicts, archived reservations, requests, tuition, completion/payroll, rename history, scoped exports, archive/restore.');
} finally {
  server.closeAllConnections();
  await new Promise(r => server.close(r));
  await prisma.$disconnect();
}
