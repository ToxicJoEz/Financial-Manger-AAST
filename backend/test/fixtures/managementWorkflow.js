import assert from 'node:assert/strict';
import express from 'express';
import ExcelJS from 'exceljs';
import service from '../../src/vercel.js';
import prisma from '../../src/db/prisma.js';
const app=express();app.use(service);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;let token;
async function req(path,method='GET',body,auth=token){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
const ok=r=>{assert(r.status<300,JSON.stringify(r));return r.data;};
try{
 token=ok(await req('/auth/login','POST',{username:'main-admin',password:'IsolatedDemoTest!123'})).token;
 const junior=ok(await req('/auth/login','POST',{username:'Joe',password:'IsolatedDemoTest!123'})).token;
 const a=ok(await req('/students','POST',{name:'طالب بدون رقم'})),b=ok(await req('/students','POST',{name:'طالبة بدون رقم'}));assert.equal(a.registrationNumber,null);assert.equal(b.registrationNumber,null);assert.notEqual(a.id,b.id);
 ok(await req('/students/'+a.id,'PUT',{registrationNumber:'UNIQUE-LIFETIME'}));assert.equal((await req('/students/'+b.id,'PUT',{registrationNumber:'UNIQUE-LIFETIME'})).status,400);ok(await req('/students/'+a.id,'PUT',{registrationNumber:''}));
 const cycle=ok(await req('/cycles','POST',{parentCourseId:'course-ket',cycleNumber:80001,branch:'MIAMI',startDate:'2026-10-01',endDate:'2026-12-01',totalHours:10,courseFee:1000}));
 const enrollPath='/cycles/'+cycle.id+'/enrollments';
 ok(await req(enrollPath,'POST',{newStudent:{name:'طالب جديد في الدورة'},recordPayment:true,amountPaid:1000}));assert(await prisma.student.findFirst({where:{name:'طالب جديد في الدورة'}}));
 const before=await prisma.student.count();assert.equal((await req(enrollPath,'POST',{newStudent:{name:'يجب التراجع'},recordPayment:true,amountPaid:1001})).status,400);assert.equal(await prisma.student.count(),before);
 const pending=ok(await req(enrollPath,'POST',{newStudent:{name:'طالب ينتظر الموافقة'},recordPayment:true,amountPaid:1000},junior));assert(pending.pending);assert.equal(await prisma.student.count({where:{name:'طالب ينتظر الموافقة'}}),0);ok(await req('/student-requests/'+pending.requestId+'/approve','POST',{}));assert(await prisma.enrollment.findFirst({where:{courseId:cycle.id,student:{name:'طالب ينتظر الموافقة'}}}));

 assert.equal((await req(enrollPath,'POST',{studentId:a.id,recordPayment:false})).status,400);
 assert.equal((await req(enrollPath,'POST',{studentId:a.id,recordPayment:true,amountPaid:500})).status,400);
 assert.equal((await req(enrollPath,'POST',{newStudent:{name:'طلب غير مسدد'},recordPayment:false},junior)).status,400);
 assert.equal(await prisma.studentRequest.count({where:{action:'CREATE_AND_ENROLL',status:'PENDING'}}),0);
 const discount=ok(await req('/cycles/cycle-pet-1/enrollments','POST',{studentId:b.id,tuitionType:'DISCOUNTED',amountPaid:300,customFee:300}));assert.equal(discount.status,'PAID');assert.equal(discount.customFee,300);assert.equal(discount.remainingBalance,0);
 const exempt=ok(await req('/cycles/cycle-ielts-1/enrollments','POST',{studentId:a.id,tuitionType:'EXEMPT',amountPaid:0,exempt:true}));assert.equal(exempt.status,'EXEMPT');assert.equal(exempt.amountPaid,0);assert.equal(exempt.remainingBalance,0);
 const discountedRequest=ok(await req('/cycles/cycle-pet-1/enrollments','POST',{studentId:a.id,tuitionType:'DISCOUNTED',amountPaid:250,customFee:250},junior));assert(discountedRequest.pending);ok(await req('/student-requests/'+discountedRequest.requestId+'/approve','POST',{}));assert.equal((await prisma.enrollment.findUnique({where:{courseId_studentId:{courseId:'cycle-pet-1',studentId:a.id}}})).customFee,250);
 const enrollment=ok(await req(enrollPath,'POST',{studentId:a.id,recordPayment:true,amountPaid:1000}));
 await prisma.course.update({where:{id:'course-ket'},data:{bookPrice:200}});ok(await req(enrollPath+'/'+enrollment.id+'/books','POST',{status:'PAID',expectedPrice:200}));
 assert.equal((await req(enrollPath+'/'+enrollment.id,'DELETE',{confirm:true,mode:'KEEP',reason:'not allowed'},junior)).status,403);
 assert.equal((await req(enrollPath+'/'+enrollment.id,'DELETE',{confirm:true,mode:'REFUND',tuitionReduction:1001,reason:'too much'})).status,400);assert(await prisma.enrollment.findUnique({where:{id:enrollment.id}}));
 ok(await req(enrollPath+'/'+enrollment.id,'DELETE',{confirm:true,mode:'REFUND',tuitionReduction:250,bookReduction:50}));assert.equal(await prisma.enrollment.findUnique({where:{id:enrollment.id}}),null);
 const retained=await prisma.retainedEnrollmentIncome.findUnique({where:{sourceEnrollmentId:enrollment.id}});assert.equal(retained.tuitionMinor,75000n);assert.equal(retained.bookMinor,15000n);
 let detail=ok(await req('/cycles/'+cycle.id));assert.equal(detail.totalCollectedRevenue,2750);assert.equal(detail.totalBookRevenue,150);
 const income=ok(await req('/finances/income?month=2026-10'));assert.equal(income.cycles.find(c=>c.id===cycle.id).income,2900);
 const prepared=ok(await req('/exports','POST',{sheets:{courses:['course','collected','books','totalIncome']},filters:{courseId:cycle.id}}));assert(JSON.stringify(prepared).includes('2750'));

 const removedList=ok(await req('/cycles/'+cycle.id+'/removed-enrollments'));assert(removedList.some(row=>row.id===retained.id));assert.equal((await req('/cycles/'+cycle.id+'/removed-enrollments','GET',undefined,junior)).status,403);
 const laterPath='/cycles/'+cycle.id+'/removed-enrollments/'+retained.id+'/adjust';
 const later={mode:'REFUND',confirm:true,tuitionReduction:200,bookReduction:50,expectedTuition:750,expectedBooks:150};
 assert.equal((await req(laterPath,'POST',later,junior)).status,403);
 const adjusted=ok(await req(laterPath,'POST',later));assert.equal(adjusted.record.tuitionRetained,550);assert.equal(adjusted.record.booksRetained,100);assert.equal(adjusted.record.adjustments.length,1);
 assert.equal((await req(laterPath,'POST',later)).status,409);
 assert.equal((await req(laterPath,'POST',{...later,tuitionReduction:551,expectedTuition:550,expectedBooks:100})).status,400);
 ok(await req(laterPath,'POST',{mode:'CORRECTION',confirm:true,tuitionReduction:550,bookReduction:100,expectedTuition:550,expectedBooks:100}));
 assert.equal((await prisma.retainedEnrollmentIncome.findUnique({where:{id:retained.id}})).tuitionMinor,0n);
 const finalIncome=ok(await req('/finances/income?month=2026-10')).cycles.find(row=>row.id===cycle.id);assert.equal(finalIncome.tuition,2000);assert.equal(finalIncome.books,0);
 assert.equal((await prisma.paymentEntry.aggregate({where:{studentId:a.id,courseId:cycle.id},_sum:{amountMinor:true}}))._sum.amountMinor,0n);
 // Fully reversed mistaken payment leaves zero income while retaining immutable history.
 const second=ok(await req(enrollPath,'POST',{studentId:b.id,recordPayment:true,amountPaid:1000}));ok(await req(enrollPath+'/'+second.id,'DELETE',{confirm:true,mode:'CORRECTION',tuitionReduction:1000,bookReduction:0,reason:'Mistaken enrollment'}));assert.equal((await prisma.retainedEnrollmentIncome.findUnique({where:{sourceEnrollmentId:second.id}})).tuitionMinor,0n);
 // Archive/restore has no financial effect; ordinary users cannot see archived records or controls.
 ok(await req('/students/'+a.id+'/archive','POST',{}));assert(!ok(await req('/students','GET',undefined,junior)).some(s=>s.id===a.id));assert.equal((await req('/students/'+a.id+'/archive','POST',{archived:false},junior)).status,403);ok(await req('/students/'+a.id+'/archive','POST',{archived:false}));
 ok(await req('/students/'+b.id+'/permanent','DELETE',{confirm:true}));assert.equal(await prisma.student.findUnique({where:{id:b.id}}),null);
 const employee=ok(await req('/employees','POST',{name:'موظف للتجربة',branches:'MIAMI'}));ok(await req('/employees/'+employee.id+'/archive','POST',{}));assert(!ok(await req('/employees')).some(i=>i.id===employee.id));assert(ok(await req('/employees/directory?status=archived')).rows.some(i=>i.id===employee.id));assert.equal((await req('/employees/'+employee.id+'/archive','POST',{},junior)).status,403);ok(await req('/employees/'+employee.id+'/archive','POST',{archived:false}));
 // A four-item processing group can be partially returned, and then fully cancelled.
 const earnings=await prisma.payrollEarning.findMany({where:{batchId:null},take:4});assert(earnings.length>=2);
 const startBody={earningIds:earnings.map(e=>e.id),versions:Object.fromEntries(earnings.map(e=>[e.id,e.updatedAt.toISOString()])),initiatedDate:'2026-10-20',idempotencyKey:crypto.randomUUID()};
 ok(await req('/finances/selected-payments','POST',startBody));let finance=ok(await req('/finances?month=2026-10'));let processing=finance.earnings.filter(e=>startBody.earningIds.includes(e.id));assert(processing.every(e=>e.status==='PROCESSING'));assert(finance.batches.flatMap(b=>b.earnings).filter(e=>startBody.earningIds.includes(e.id)).every(e=>e.status==='PROCESSING'));
 const rollback={earningIds:[processing[0].id],versions:{[processing[0].id]:processing[0].updatedAt}};assert.equal((await req('/finances/return-to-unpaid','POST',rollback,junior)).status,403);ok(await req('/finances/return-to-unpaid','POST',rollback));assert.equal((await prisma.payrollEarning.findUnique({where:{id:processing[0].id}})).batchId,null);assert.equal((await req('/finances/return-to-unpaid','POST',rollback)).status,409);
 finance=ok(await req('/finances?month=2026-10'));const rest=finance.earnings.filter(e=>startBody.earningIds.includes(e.id)&&e.status==='PROCESSING');ok(await req('/finances/return-to-unpaid','POST',{earningIds:rest.map(e=>e.id),versions:Object.fromEntries(rest.map(e=>[e.id,e.updatedAt])),reason:'Cancel remaining processing items'}));assert.equal((await prisma.payrollEarning.count({where:{id:{in:startBody.earningIds},batchId:null}})),earnings.length);
 const paid=await prisma.payrollEarning.findFirst({where:{batch:{status:'PAID'}}});assert.equal((await req('/finances/return-to-unpaid','POST',{earningIds:[paid.id],versions:{[paid.id]:paid.updatedAt.toISOString()},reason:'Cannot undo paid'})).status,409);const employeeHistory=ok(await req('/employees/'+paid.instructorId+'/details'));assert(employeeHistory.paidPayments.every(e=>e.batch.status==='PAID'));assert.equal((await req('/employees/'+paid.instructorId,'DELETE')).status,409);


 // Deleting an employee with only unpaid earnings removes those costs, while paid history stays protected.
 await prisma.payrollEarning.create({data:{courseId:cycle.id,instructorId:employee.id,instructorName:employee.name,cycleName:cycle.name,branch:'MIAMI',hours:1,rate:100,amountMinor:10000n}});
 ok(await req('/employees/'+employee.id,'DELETE',{confirm:true}));assert.equal(await prisma.instructor.findUnique({where:{id:employee.id}}),null);assert.equal(await prisma.payrollEarning.count({where:{instructorId:employee.id}}),0);

 // Payroll dates may be in the past or future, independent of the initiation date.
 async function dateScenario(initiatedDate,actualPaymentDate){const row=await prisma.payrollEarning.findFirst({where:{batchId:null,amountMinor:{gt:0n}}});const start=ok(await req('/finances/batches','POST',{earningIds:[row.id],versions:{[row.id]:row.updatedAt.toISOString()},initiatedDate,idempotencyKey:crypto.randomUUID()}));ok(await req('/finances/batches/'+start.id+'/pay','POST',{actualPaymentDate}));const saved=await prisma.instructorPaymentBatch.findUnique({where:{id:start.id}});assert.equal(saved.initiatedDate.toISOString().slice(0,10),initiatedDate);assert.equal(saved.actualPaymentDate.toISOString().slice(0,10),actualPaymentDate);}
 await dateScenario('2099-11-10','2100-12-05');await dateScenario('2099-11-10','1899-01-02');
 // Two exempt roster rows without registration IDs remain two independent students.
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Roster');sheet.mergeCells('G15:AB18');sheet.getCell('G15').value='الدورة : 1T1036 _ KET\nفترة الانعقاد : 2026/10/06 - 2026/11/01';
 for(const [cell,value]of Object.entries({A20:'السداد',E21:'العملة',F21:'القيمة',Y20:'اسم الطالب',Y22:'طالب إعفاء أول',Y23:'طالب إعفاء ثان',E22:'جنيه مصري',E23:'جنيه مصري',F22:0,F23:0}))sheet.getCell(cell).value=value;
 const previewResponse=await fetch(base+'/imports/course-ket/preview',{method:'POST',headers:{'Content-Type':'application/octet-stream',Authorization:'Bearer '+token},body:Buffer.from(await workbook.xlsx.writeBuffer())});const preview=await previewResponse.json();assert.equal(previewResponse.status,200,JSON.stringify(preview));assert.equal(preview.rows.length,2);assert(preview.rows.every(row=>row.registrationNumber===null&&!row.issues.length));
 const importResult=ok(await req('/imports/course-ket/commit','POST',{previewToken:preview.previewToken,cycleNumber:80002,branch:'MIAMI',courseFee:1000,totalHours:10,choices:Object.fromEntries(preview.rows.map(row=>[row.rowKey,{profile:'fill',feeMode:'exempt'}]))}));assert.equal(importResult.created,2);assert.equal(await prisma.enrollment.count({where:{courseId:importResult.cycleId,student:{registrationNumber:null}}}),2);
 console.log('PASS: optional IDs and uniqueness, inline create/approve and rollback, permanent removals and partial/full financial reversals, consistent course/income/export totals, archive permissions, partial/full payroll rollback, paid-history protection.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await prisma.$disconnect();}
