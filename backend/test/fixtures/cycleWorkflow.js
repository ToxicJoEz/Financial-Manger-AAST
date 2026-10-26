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
  const enrollmentRequest = ok(await req('/cycles/' + cycle.id + '/enrollments', 'POST', {
    studentId: 'demo-student-1',
    recordPayment: true,
    amountPaid: 400,tuitionType:'DISCOUNTED',customFee:400
  }, junior));
  assert(enrollmentRequest.pending);
  ok(await req('/student-requests/' + enrollmentRequest.requestId + '/approve', 'POST'));
  const enrollment = await prisma.enrollment.findUnique({ where: { courseId_studentId: { courseId: cycle.id, studentId: 'demo-student-1' } } });
  assert.equal(enrollment.amountPaid, 400);
  // Preserve coverage of a pre-policy outstanding balance without creating one through the enrollment API.
  await prisma.enrollment.update({where:{id:enrollment.id},data:{customFee:1000}});
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
  })).status, 410);
  assert.equal((await req('/cycles/' + cycle.id + '/finish', 'POST', {
    totalHours: 10,
    instructorHours: [{
      courseInstructorId: 'wrong-id',
      hoursTaught: 10
    }]
  })).status, 400);
  ok(await req('/cycles/' + cycle.id + '/finish', 'POST', {
    totalHours: 10,
    instructorHours: [{
      courseInstructorId: assignment.id,
      hoursTaught: 10
    }]
  }));
  const original = await prisma.payrollEarning.findFirst({ where: { courseId: cycle.id } });
  ok(await req('/cycles/' + cycle.id + '/revert', 'POST', {}));
  assert(ok(await req('/finances')).earnings.some(e => e.courseId === cycle.id && e.status === 'UNPAID'));
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
  assert.equal((await prisma.payrollEarning.findFirst({ where: { courseId: cycle.id } })).cycleName, original.cycleName);
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

  // Permanent deletion is separate from archive and removes the complete accounting graph.
  assert.equal((await req('/cycles/'+cycle.id+'/deletion-preview','GET',undefined,junior)).status,403);
  assert.equal((await req('/courses/course-ket/permanent','DELETE',{},junior)).status,403);
  const profileCounts={students:await prisma.student.count(),instructors:await prisma.instructor.count(),users:await prisma.user.count()};
  const existingPayment=await prisma.paymentEntry.findFirst({where:{courseId:cycle.id,kind:'PAYMENT'}});
  if(existingPayment)ok(await req(`/cycles/${cycle.id}/enrollments/${existingPayment.enrollmentId}/payments/${existingPayment.id}/reverse`,'POST',{note:'Test deletion of a reversal graph'}));
  await prisma.importBatch.create({data:{fingerprint:'permanent-delete-fixture',fileName:'test.xlsx',parentCourseId:'course-ket',cycleId:cycle.id,recordedBy:'main-admin',studentCount:1}});
  const plan=ok(await req('/cycles/'+cycle.id+'/deletion-preview'));
  assert(plan.counts.payments>0);assert(plan.counts.payroll>0);assert.equal(plan.counts.imports,1);
  const confirmation={confirm:true,confirmationName:plan.name,version:plan.version};
  assert.equal((await req('/cycles/'+cycle.id+'/permanent','DELETE',{...confirmation,confirmationName:'wrong'})).status,400);
  await prisma.cycle.update({where:{id:cycle.id},data:{details:'changed after deletion preview'}});
  assert.equal((await req('/cycles/'+cycle.id+'/permanent','DELETE',confirmation)).status,409);
  const fresh=ok(await req('/cycles/'+cycle.id+'/deletion-preview'));
  ok(await req('/cycles/'+cycle.id+'/permanent','DELETE',{confirm:true,confirmationName:fresh.name,version:fresh.version}));
  assert.equal(await prisma.cycle.count({where:{id:cycle.id}}),0);
  for(const model of ['paymentEntry','enrollment','payrollRecord','courseInstructor','pendingAssignment'])assert.equal(await prisma[model].count({where:{courseId:cycle.id}}),0,model);
  assert.equal(await prisma.importBatch.count({where:{cycleId:cycle.id}}),0);
  assert(await prisma.course.findUnique({where:{id:'course-ket'}}));
  const allChildren=await prisma.cycle.findMany({where:{parentCourseId:'course-ket'},select:{id:true}});
  const pendingIds=await prisma.pendingAssignment.findMany({where:{courseId:{in:allChildren.map(c=>c.id)}},select:{id:true}});
  const parentPlan=ok(await req('/courses/course-ket/deletion-preview'));
  assert.equal((await req('/courses/course-ket/permanent','DELETE',{confirm:true,confirmationName:parentPlan.name,version:parentPlan.version})).status,409);
  assert(await prisma.course.findUnique({where:{id:'course-ket'}}));
  assert.deepEqual({students:await prisma.student.count(),instructors:await prisma.instructor.count(),users:await prisma.user.count()},profileCounts);

  // Purchase prices freeze at payment time, including within one cycle.
  ok(await req('/courses/course-ket','PUT',{bookPrice:1000}));
  const bookCycle=ok(await req('/cycles','POST',{parentCourseId:'course-ket',cycleNumber:990,branch:'MIAMI',startDate:'1901-01-01',courseFee:1000}));
  const bookStudents=await prisma.student.findMany({take:2}); assert.equal(bookStudents.length,2);
  const bookRows=[];
  for(const student of bookStudents)bookRows.push(await prisma.enrollment.create({data:{courseId:bookCycle.id,studentId:student.id,amountPaid:1000}}));
  const bookPath=e=>`/cycles/${bookCycle.id}/enrollments/${e.id}/books`;
  ok(await req(bookPath(bookRows[0]),'POST',{status:'PAID',expectedPrice:1000}));
  ok(await req('/courses/course-ket','PUT',{bookPrice:1500}));
  assert.equal((await req(bookPath(bookRows[1]),'POST',{status:'PAID',expectedPrice:1000})).status,409);
  ok(await req(bookPath(bookRows[1]),'POST',{status:'PAID',expectedPrice:1500}));
  assert.equal((await req(bookPath(bookRows[0]),'POST',{status:'PAID',expectedPrice:1500})).status,409);
  assert.equal(ok(await req('/finances/income?month=1901-01')).summary.books,2500);
  const originalBook=await prisma.bookPayment.findUnique({where:{activeKey:bookRows[0].id}});
  ok(await req(bookPath(bookRows[0]),'POST',{status:'UNPAID',paymentId:originalBook.id}));
  assert((await prisma.bookPayment.findUnique({where:{id:originalBook.id}})).reversedAt);
  assert.equal(ok(await req('/finances/income?month=1901-01')).summary.books,1500);
  ok(await req(bookPath(bookRows[0]),'POST',{status:'EXEMPT'}));
  const exemptBook=await prisma.bookPayment.findUnique({where:{activeKey:bookRows[0].id}});
  ok(await req(bookPath(bookRows[0]),'POST',{status:'UNPAID',paymentId:exemptBook.id}));
  ok(await req(bookPath(bookRows[0]),'POST',{status:'PAID',expectedPrice:1500}));
  assert.equal(ok(await req('/finances/income?month=1901-01')).summary.books,3000);
  console.log('PASS: course/cycle hierarchy, role guards, numbering and concurrent conflicts, archived reservations, requests, tuition, completion/payroll, rename history, scoped exports, archive/restore.');
} finally {
  server.closeAllConnections();
  await new Promise(r => server.close(r));
  await prisma.$disconnect();
}
