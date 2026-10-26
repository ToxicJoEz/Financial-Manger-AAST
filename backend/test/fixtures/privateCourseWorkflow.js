import assert from 'node:assert/strict';
import express from 'express';
import ExcelJS from 'exceljs';
import service from '../../src/vercel.js';
import prisma from '../../src/db/prisma.js';
const app=express();app.use(service);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;let token;
async function req(path,method='GET',body,auth=token){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
async function upload(path,bytes){const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/octet-stream',Authorization:'Bearer '+token},body:bytes});return {status:response.status,data:await response.json()};}
const ok=r=>{assert(r.status<300,JSON.stringify(r));return r.data;};
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
try{
 token=ok(await req('/auth/login','POST',{username:'main-admin',password:'IsolatedDemoTest!123'})).token;
 const junior=ok(await req('/auth/login','POST',{username:'Joe',password:'IsolatedDemoTest!123'})).token;
 const parent=ok(await req('/courses','POST',{name:'Private academy',code:'PRIVATE-TEST',isPrivate:true,bookPrice:999}));assert(parent.isPrivate);assert.equal(parent.bookPrice,0);
 const params={parentCourseId:parent.id,name:'Private KET — أحمد',branch:'MIAMI',startDate:'2026-10-01',endDate:'2026-12-01',courseFee:1000,totalHours:10,bookPrice:100};
 assert.equal((await req('/cycles','POST',{...params,name:''})).status,400);
 const cycle=ok(await req('/cycles','POST',params));assert.equal(cycle.name,params.name);assert.equal(cycle.cycleNumber,1);
 assert.equal((await req('/courses/'+parent.id,'PUT',{name:parent.name,code:parent.code,isPrivate:false})).status,409);
 ok(await req('/courses/'+parent.id,'PUT',{name:'Private renamed',code:parent.code,isPrivate:true}));assert.equal((await prisma.cycle.findUnique({where:{id:cycle.id}})).name,params.name);
 const path='/cycles/'+cycle.id+'/enrollments';
 const requests=[];for(const studentId of ['demo-student-1','demo-student-2'])requests.push(ok(await req(path,'POST',{studentId,tuitionType:'FULL',amountPaid:1000},junior)));
 ok(await req('/student-requests/'+requests[0].requestId+'/approve','POST',{}));assert.equal((await req('/student-requests/'+requests[1].requestId+'/approve','POST',{})).status,409);
 const count=await prisma.student.count();assert.equal((await req(path,'POST',{newStudent:{name:'لا تنشئ هذا الطالب'},tuitionType:'FULL',amountPaid:1000})).status,409);assert.equal(await prisma.student.count(),count);
 const entry=await prisma.enrollment.findFirst({where:{courseId:cycle.id}});
 ok(await req(path+'/'+entry.id+'/books','POST',{status:'PAID',expectedPrice:100}));ok(await req('/cycles/'+cycle.id,'PUT',{name:'Private KET updated',bookPrice:150}));assert.equal((await prisma.bookPayment.findFirst({where:{enrollmentId:entry.id}})).amountMinor,10000n);
 const detail=ok(await req('/cycles/'+cycle.id));assert(detail.isPrivate);assert(detail.privateSeatOccupied);assert.equal(detail.effectiveBookPrice,150);
 assert.equal(ok(await req('/students?pickerCourseId='+cycle.id)).seatFull,true);
 const race=ok(await req('/cycles','POST',{...params,name:'Private PET'}));const results=await Promise.all(['demo-student-1','demo-student-2'].map(studentId=>req('/cycles/'+race.id+'/enrollments','POST',{studentId,tuitionType:'EXEMPT',exempt:true,amountPaid:0})));assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);assert.equal(await prisma.enrollment.count({where:{courseId:race.id}}),1);
 for(const instructorId of ['demo-instructor-1','demo-instructor-2'])ok(await req('/cycles/'+cycle.id+'/instructors','POST',{instructorId,hourlyRate:100}));
 const assignments=await prisma.courseInstructor.findMany({where:{courseId:cycle.id}});ok(await req('/cycles/'+cycle.id+'/finish','POST',{totalHours:10,instructorHours:assignments.map(a=>({courseInstructorId:a.id,hoursTaught:5}))}));
 const payroll=ok(await req('/finances?month=2026-10'));assert.equal(payroll.earnings.filter(e=>e.courseId===cycle.id).length,2);assert(payroll.earnings.filter(e=>e.courseId===cycle.id).every(e=>e.isPrivate));
 const income=ok(await req('/finances/income?month=2026-10'));assert(income.cycles.find(c=>c.id===cycle.id).isPrivate);
 const report=ok(await req('/exports','POST',{sheets:{courses:['course','courseName'],payroll:['course','earned']},filters:{parentCourseId:parent.id}}));assert(report);

 const importer=ok(await req('/courses','POST',{name:'Private import',code:'1T9999',isPrivate:true}));
 const bytes=await workbook({reg:'PRIVATE-IMPORT',amount:1000,code:'1T9999'});
 const preview=ok(await upload('/imports/'+importer.id+'/preview',bytes));
 const imported=ok(await req('/imports/'+importer.id+'/commit','POST',{previewToken:preview.previewToken,name:'Private IELTS imported',bookPrice:200,branch:'FOUAD',courseFee:1000,totalHours:10,choices:{'PRIVATE-IMPORT':{profile:'fill',feeMode:'standard'}}}));assert(imported);
 const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);const sheet=book.worksheets[0];sheet.getRow(22).eachCell((cell,col)=>sheet.getRow(23).getCell(col).value=cell.value);sheet.getCell('AB23').value='PRIVATE-SECOND';sheet.getCell('Y23').value='طالب آخر';
 const multi=ok(await upload('/imports/'+importer.id+'/preview',Buffer.from(await book.xlsx.writeBuffer())));assert.equal(multi.rows.length,2);
 const beforeImports=await prisma.cycle.count();assert.equal((await req('/imports/'+importer.id+'/commit','POST',{previewToken:multi.previewToken,name:'Must not import',branch:'MIAMI',courseFee:1000})).status,400);assert.equal(await prisma.cycle.count(),beforeImports);
 assert(report.sheets.find(s=>s.key==='courses').rows.every(row=>row.course.includes('(Private)')));
 assert(report.sheets.find(s=>s.key==='payroll').rows.every(row=>row.course.includes('(Private)')));
 console.log('PASS: private naming, capacity, concurrent/approval guards, book price snapshots and finance metadata');
}finally{await new Promise(resolve=>server.close(resolve));await prisma.$disconnect();}
