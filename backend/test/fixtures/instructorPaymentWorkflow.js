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
  token = ok(await req('/auth/login', 'POST', { username: 'main-admin', password: 'IsolatedDemoTest!123' })).token;
  const junior = ok(await req('/auth/login', 'POST', { username: 'Joe', password: 'IsolatedDemoTest!123' })).token;
  const { cairoToday } = await import('../../src/utils/academyDate.js');
  const today = cairoToday(), priorDate = new Date(today + 'T00:00:00Z'); priorDate.setUTCDate(priorDate.getUTCDate()-1); const yesterday = priorDate.toISOString().slice(0,10);
  const initialCount = await prisma.payrollEarning.count();

  assert.equal(await prisma.payrollEarning.count(), initialCount);
  const finances = ok(await req('/finances'));
  assert(finances.earnings.some(e=>e.status==='PAID' && !e.batch.actualPaymentDate && e.batch.legacy));
  const cycles = [];
  for (let n=0;n<5;n++) {
    const c=ok(await req('/cycles','POST',{parentCourseId:'course-ket',cycleNumber:800+n,branch:n%2?'FOUAD':'MIAMI',courseFee:1000,totalHours:10}));
    ok(await req('/cycles/'+c.id+'/instructors','POST',{instructorId:'demo-instructor-1',hourlyRate:100}));
    ok(await req('/cycles/'+c.id+'/finish','POST',{totalHours:10})); cycles.push(c);
  }
  let rows=ok(await req('/finances')).earnings.filter(e=>cycles.some(c=>c.id===e.courseId));
  assert.equal(rows.length,5);assert(rows.every(e=>e.amount===1000 && e.status==='UNPAID' && !e.batch));
  assert.equal((await req('/finances','GET',undefined,junior)).status,403);
  assert.equal((await req('/finances/batches','POST',{},junior)).status,403);
  assert.equal((await req('/cycles/'+cycles[0].id+'/payment','PUT',{isPaid:true})).status,410);
  const chosen=rows.slice(0,3), body={earningIds:chosen.map(e=>e.id),versions:Object.fromEntries(chosen.map(e=>[e.id,e.updatedAt])),initiatedDate:yesterday,idempotencyKey:'payroll-lifecycle-batch-001'};
  const batch=ok(await req('/finances/batches','POST',body));
  assert.equal(ok(await req('/finances/batches','POST',body)).id,batch.id);
  rows=ok(await req('/finances')).earnings.filter(e=>cycles.some(c=>c.id===e.courseId));
  assert.equal(rows.filter(e=>e.status==='PROCESSING').length,3); assert.equal(rows.filter(e=>e.status==='UNPAID').length,2);
  assert(rows.filter(e=>e.status==='PROCESSING').every(e=>e.batch.initiatedDate.slice(0,10)===yesterday && e.batch.actualPaymentDate===null));
  assert.equal((await req('/finances/batches','POST',{...body,idempotencyKey:'payroll-duplicate-earnings'})).status,409);
  assert.equal((await req('/finances/batches/'+batch.id+'/pay','POST',{actualPaymentDate:'1900-01-01'})).status,400);
  ok(await req('/finances/batches/'+batch.id+'/pay','POST',{actualPaymentDate:today}));
  assert.equal((await req('/finances/batches/'+batch.id+'/pay','POST',{actualPaymentDate:today})).status,409);
  const paid=ok(await req('/finances')).batches.find(b=>b.id===batch.id);assert.equal(paid.amount,3000);assert.equal(paid.initiatedDate.slice(0,10),yesterday);assert.equal(paid.actualPaymentDate.slice(0,10),today);
  const report=ok(await req('/exports','POST',{sheets:{payroll:['instructor','earned','status','initiatedDate','actualPaymentDate']},filters:{from:today,to:today,payrollStatus:'PAID',payrollDateBasis:'actualPaymentDate'}}));
  assert.equal(report.sheets[0].rows.filter(r=>r.actualPaymentDate===today).length,3);
  const paidCycle=chosen[0].courseId;ok(await req('/cycles/'+paidCycle+'/revert','POST',{}));
  assert(ok(await req('/finances')).earnings.some(e=>e.courseId===paidCycle && e.status==='PAID'));
  assert.equal((await req('/cycles/'+paidCycle+'/finish','POST',{totalHours:11})).status,409);
  const plan=ok(await req('/cycles/'+paidCycle+'/deletion-preview'));assert.equal((await req('/cycles/'+paidCycle+'/permanent','DELETE',{confirm:true,confirmationName:plan.name,version:plan.version})).status,409);
  ok(await req('/cycles/'+paidCycle,'DELETE'));assert(ok(await req('/finances')).earnings.some(e=>e.courseId===paidCycle));
  const another=await prisma.payrollEarning.findFirst({where:{instructorId:'demo-instructor-2',batchId:null}});
  const unpaid=rows.find(e=>e.status==='UNPAID');
  assert.equal((await req('/finances/batches','POST',{earningIds:[unpaid.id,another.id],versions:{[unpaid.id]:unpaid.updatedAt,[another.id]:another.updatedAt.toISOString()},initiatedDate:today,idempotencyKey:'payroll-mixed-instructor'})).status,400);
  const multi=ok(await req('/cycles','POST',{parentCourseId:'course-ket',cycleNumber:900,branch:'MIAMI',courseFee:1000,totalHours:10}));
  for(const instructorId of ['demo-instructor-1','demo-instructor-2'])ok(await req('/cycles/'+multi.id+'/instructors','POST',{instructorId,hourlyRate:100}));
  const assignments=await prisma.courseInstructor.findMany({where:{courseId:multi.id}});
  ok(await req('/cycles/'+multi.id+'/finish','POST',{totalHours:10,instructorHours:assignments.map((a,i)=>({courseInstructorId:a.id,hoursTaught:i?6:4}))}));
  assert.deepEqual(ok(await req('/finances')).earnings.filter(e=>e.courseId===multi.id).map(e=>e.amount).sort(),[400,600]);
  const mixedRows = [unpaid, another];
  const mixedBody = { earningIds: mixedRows.map(r=>r.id), versions: Object.fromEntries(mixedRows.map(r=>[r.id,typeof r.updatedAt==='string'?r.updatedAt:r.updatedAt.toISOString()])), initiatedDate: today, idempotencyKey:'mixed-instructor-selection-001' };
  const beforeMixed = await prisma.instructorPaymentBatch.count();
  assert.equal((await req('/finances/selected-payments','POST',mixedBody,junior)).status,403);
  assert.equal((await req('/finances/selected-payments','POST',{...mixedBody,versions:{...mixedBody.versions,[another.id]:'stale'}})).status,409);
  assert.equal(await prisma.instructorPaymentBatch.count(),beforeMixed);
  const mixedPayment=ok(await req('/finances/selected-payments','POST',mixedBody));assert.equal(mixedPayment.batchIds.length,2);
  assert.deepEqual(ok(await req('/finances/selected-payments','POST',mixedBody)).batchIds.sort(),[...mixedPayment.batchIds].sort());
  const mixedBatches=await prisma.instructorPaymentBatch.findMany({where:{id:{in:mixedPayment.batchIds}},include:{earnings:true}});
  assert(mixedBatches.every(b=>b.earnings.length===1));
  assert.equal(await prisma.payrollEarning.count({where:{id:{in:mixedBody.earningIds},batchId:{not:null}}}),2);
  const courseRows = ok(await req('/finances')).earnings.filter(e=>e.courseId===multi.id);
  const courseBody = { earningIds: courseRows.map(e=>e.id), courseIds: [multi.id], versions: Object.fromEntries(courseRows.map(e=>[e.id,e.updatedAt])), initiatedDate:'2020-01-15', idempotencyKey:'course-all-instructors-001' };
  assert.equal((await req('/finances/course-payments','POST',courseBody,junior)).status,403);
  assert.equal((await req('/finances/course-payments','POST',{...courseBody,earningIds:[courseRows[0].id]})).status,409);
  const countBefore = await prisma.instructorPaymentBatch.count();
  assert.equal((await req('/finances/course-payments','POST',{...courseBody,versions:{...courseBody.versions,[courseRows[1].id]:'stale'}})).status,409);
  assert.equal(await prisma.instructorPaymentBatch.count(),countBefore);
  assert.equal(await prisma.payrollEarning.count({where:{courseId:multi.id,batchId:null}}),2);
  const coursePayment=ok(await req('/finances/course-payments','POST',courseBody));assert.equal(coursePayment.batchIds.length,2);
  assert.deepEqual(ok(await req('/finances/course-payments','POST',courseBody)).batchIds.sort(),[...coursePayment.batchIds].sort());
  ok(await req('/finances/course-payments/pay','POST',{batchIds:coursePayment.batchIds,courseIds:[multi.id],actualPaymentDate:'2020-02-10'}));
  const january=ok(await req('/finances?month=2020-01')).monthly;
  const february=ok(await req('/finances?month=2020-02')).monthly;
  const monthlySummary=ok(await req('/finances?month=2020-02')).summary;
  assert.deepEqual(monthlySummary,{totalPaid:1000,instructorsPaid:2,cyclesPaid:1,paymentsCompleted:2});
  assert.deepEqual(ok(await req('/finances?month=2020-01')).summary,{totalPaid:0,instructorsPaid:0,cyclesPaid:0,paymentsCompleted:0});
  const salaryExport=ok(await req('/exports','POST',{sheets:{payroll:['instructor','earned','actualPaymentDate']},filters:{salaryMonth:'2020-02',from:'1900-01-01',to:'2099-12-31',payrollDateBasis:'initiatedDate'}}));
  assert.equal(salaryExport.sheets[0].rows.reduce((sum,r)=>sum+r.earned,0),1000);
  assert(salaryExport.sheets[0].rows.every(r=>r.actualPaymentDate.startsWith('2020-02')));
  assert.equal(ok(await req('/exports','POST',{sheets:{payroll:['earned']},filters:{salaryMonth:'2020-01'}})).sheets[0].rows.length,0);
  assert.equal((await req('/exports','POST',{sheets:{payroll:['earned']},filters:{salaryMonth:'2020-13'}})).status,400);
  assert.equal(january.totalPaid,0);assert.equal(february.totalPaid,1000);assert.equal(february.instructors.length,2);assert.equal(february.instructors.reduce((sum,i)=>sum+i.totalPaid,0),1000);
  assert.equal((await req('/finances?month=2020-13')).status,400);
  const dailyPending=await prisma.instructorPaymentBatch.findMany({where:{status:'PROCESSING',initiatedDate:new Date(today+'T00:00:00Z')}});
  assert(dailyPending.length>=2);
  const dailyIds=dailyPending.map(p=>p.id);
  assert.equal((await req('/finances/payment-days/'+today+'/pay','POST',{batchIds:dailyIds,actualPaymentDate:today},junior)).status,403);
  ok(await req('/finances/batches/'+dailyIds[0]+'/pay','POST',{actualPaymentDate:today}));
  assert.equal((await req('/finances/payment-days/'+today+'/pay','POST',{batchIds:dailyIds,actualPaymentDate:today})).status,409);
  const remaining=dailyIds.slice(1);
  assert.equal((await req('/finances/payment-days/'+today+'/pay','POST',{batchIds:remaining,actualPaymentDate:yesterday})).status,400);
  assert.equal(await prisma.instructorPaymentBatch.count({where:{id:{in:remaining},status:'PROCESSING'}}),remaining.length);
  ok(await req('/finances/payment-days/'+today+'/pay','POST',{batchIds:remaining,actualPaymentDate:today}));
  assert.equal(await prisma.instructorPaymentBatch.count({where:{id:{in:dailyIds},status:'PAID'}}),dailyIds.length);
  console.log('PASS: per-cycle earnings, selected 3-of-5 batch payment, both dates, unpaid remainder, legacy unknown dates, idempotency, role isolation, immutable paid earnings, multi-instructor hours, exports and archive protection.');
} finally { server.closeAllConnections();await new Promise(r=>server.close(r));await prisma.$disconnect(); }
