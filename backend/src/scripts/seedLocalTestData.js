import 'dotenv/config';
import assert from 'node:assert/strict';
import prisma from '../db/prisma.js';
import { earningData } from '../utils/payrollRecord.js';
const date = day => new Date(`${day}T12:00:00Z`);
const midnight = day => new Date(`${day}T00:00:00Z`);
const branches = ['MIAMI','FOUAD','ABU-QEER','PORT-SAID','ASWAN','SMART','SHERATON'];
if (!process.argv.includes('--add-local-test-data')) throw new Error('Use --add-local-test-data to add the local sample set.');
const address = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1','localhost'].includes(address.hostname) || process.env.VERCEL === '1') throw new Error('This sample generator only supports local PostgreSQL.');
const usersBefore = await prisma.user.findMany({orderBy:{id:'asc'}});
const root = usersBefore.find(user => user.username === 'main-admin');
if (!root) throw new Error('The existing main-admin account is required.');
const actor = root.username;
try {
  await prisma.$transaction(async tx => {
    for (const model of ['course','cycle','student','instructor','enrollment','payrollEarning','bookPayment']) if (await tx[model].count()) throw new Error('Sample data already exists or business records were added. Nothing was deleted or replaced.');
    const courses = [];
    for (const [name,code,bookPrice,fee] of [['FCE','1T1037',1800,2400],['KET','1T1036',1500,1800],['PET','1T1033',1200,2000],['Cambridge Private Courses','1T1047',900,3200]]) courses.push({...await tx.course.create({data:{name,code,bookPrice}}), fee});
    const teachers=[];
    for (const [index,name] of ['أحمد حسن إبراهيم','سارة محمد علي','محمود عادل مصطفى','منى خالد عبد الله','محمد سامي يوسف','هبة عادل حسن','كريم عمرو محمود','نورا وليد إبراهيم'].entries()) teachers.push(await tx.instructor.create({data:{name,employeeId:'TEST-I'+String(index+1).padStart(3,'0'),mobile:'010'+String(20000000+index),branches:branches.join(',')}}));
    const first=['عمر','سلمى','يوسف','مريم','علي','نور','كريم','هنا'];
    const family=['أحمد حسن','محمود علي','محمد إبراهيم','خالد عبد الله','مصطفى عادل','وليد حسين','عمرو فتحي','طارق سامي'];
    const students=[];
    for(let n=0;n<64;n++) students.push(await tx.student.create({data:{name:`${first[n%8]} ${family[Math.floor(n/8)]}`,registrationNumber:'TEST-S'+String(n+1).padStart(4,'0'),mobile:'010'+String(10000000+n),dateOfBirth:date(`${1995+n%12}-${String(1+n%12).padStart(2,'0')}-${String(1+n%27).padStart(2,'0')}`),nationality:n%11===0?'سوداني':'مصري',placeOfBirth:n%2?'القاهرة':'الإسكندرية'}}));
    const specs = [
      {start:'2026-08-02',end:'2026-08-20',finished:true,state:'PAID',init:'2026-08-22',paid:'2026-08-25'},
      {start:'2026-09-03',end:'2026-09-24',finished:true,state:'PAID',init:'2026-10-05',paid:'2026-10-10'},
      {start:'2026-10-01',end:'2026-10-15',finished:true,state:'UNPAID',multiple:true},
      {start:'2026-10-02',end:'2026-10-16',finished:true,state:'PROCESSING',init:'2026-10-20'},
      {start:'2026-10-05',end:'2026-11-15',finished:false,state:'UNPAID'},
      {start:'2026-09-05',end:'2026-09-21',finished:true,state:'PAID',init:'2026-09-25',paid:'2026-09-28'},
      {start:'2026-10-08',end:'2026-10-18',finished:true,state:'UNPAID',sharedTeacher:true}
    ];
    const batchCache = new Map();
    const activeCycles=[];
    for (const [courseIndex,course] of courses.entries()) for (const [index,spec] of specs.entries()) {
      const cycle=await tx.cycle.create({data:{parentCourseId:course.id,cycleNumber:index+1,name:`${course.name} ${index+1}`,branch:branches[index],details:'بيانات تجريبية لاختبار التسجيل والمصروفات والكتب ورواتب المحاضرين.',startDate:date(spec.start),endDate:date(spec.end),isFinished:spec.finished,totalHours:12,courseFee:course.fee,venue:index%2?'Room A201':'Room 501',classStartTime:index%2?'15:00':'10:00',classEndTime:index%2?'18:00':'13:00'}});
      const chosen=spec.sharedTeacher?[teachers[0]]:spec.multiple?[teachers[(courseIndex+index)%8],teachers[(courseIndex+index+1)%8]]:[teachers[(courseIndex+index)%8]];
      for(const teacher of chosen) {
        const assignment=await tx.courseInstructor.create({data:{courseId:cycle.id,instructorId:teacher.id,hourlyRate:100+teachers.findIndex(t=>t.id===teacher.id)*25,hoursTaught:spec.finished?12/chosen.length:null}});
        if(spec.finished) {
          let batchId;
          if(spec.state!=='UNPAID') {
            const key=teacher.id+':'+spec.init;
            if(!batchCache.has(key)) batchCache.set(key,await tx.instructorPaymentBatch.create({data:{instructorId:teacher.id,instructorName:teacher.name,status:spec.state,initiatedDate:midnight(spec.init),actualPaymentDate:spec.paid?midnight(spec.paid):null,initiatedBy:actor,paidBy:spec.paid?actor:null}}));
            batchId=batchCache.get(key).id;
          }
          await tx.payrollEarning.create({data:{...earningData(cycle,{...assignment,instructor:teacher}),batchId}});
        }
      }
      if(!spec.finished) activeCycles.push(cycle);
      for(let n=0;n<8;n++) {
        const student=students[(courseIndex*13+index*5+n)%students.length];
        const customFee=n===7?0:n===5||n===6?Math.round(course.fee*0.8):null;
        const amountPaid=customFee??course.fee;
        const enrollment=await tx.enrollment.create({data:{courseId:cycle.id,studentId:student.id,customFee,amountPaid,enrolledAt:date(spec.start)}});
        if(amountPaid)await tx.paymentEntry.create({data:{enrollmentId:enrollment.id,courseId:cycle.id,studentId:student.id,courseName:cycle.name,studentName:student.name,amountMinor:BigInt(amountPaid*100),kind:'PAYMENT',paymentMethod:['CASH','ONLINE','CARD'][n%3],receiptNumber:String(620000+courseIndex*1000+index*10+n),recordedBy:actor,occurredAt:date(spec.start),note:'دفعة تجريبية للمصروفات',idempotencyKey:'sample-tuition-'+enrollment.id}});
        if([0,1,2,5].includes(n)) {
          const price=n<2?course.bookPrice-500:course.bookPrice;
          await tx.bookPayment.create({data:{enrollmentId:enrollment.id,activeKey:enrollment.id,status:'PAID',amountMinor:BigInt(price*100),recordedAt:date(spec.start),recordedBy:actor}});
        } else if([3,7].includes(n))await tx.bookPayment.create({data:{enrollmentId:enrollment.id,activeKey:enrollment.id,status:'EXEMPT',amountMinor:0n,recordedAt:date(spec.start),recordedBy:actor}});
      }
    }
    const requester=usersBefore.find(user=>user.role==='user' && user.isActive && !user.isBanned);
    if(requester) {
      for(const [index,type] of ['ASSIGN','REMOVE','REPLACE'].entries()) {
        const cycle=activeCycles[index], assignment=await tx.courseInstructor.findFirst({where:{courseId:cycle.id}});
        const replacement=teachers.find(t=>t.id!==assignment.instructorId);
        const request=await tx.pendingAssignment.create({data:{courseId:cycle.id,type,instructorId:type==='REMOVE'?assignment.instructorId:replacement.id,submittedById:requester.id,...(type!=='ASSIGN'?{replacedAssignmentId:assignment.id,replacedInstructorId:assignment.instructorId}:{})}});
        for(const manager of usersBefore.filter(u=>['admin','mod'].includes(u.role)))await tx.notification.create({data:{userId:manager.id,title:`${type==='REMOVE'?'Remove':type==='REPLACE'?'Replace':'Add'} instructor · ${cycle.name}`,message:`@${requester.username} submitted a sample instructor request.`,type:'ASSIGNMENT_REQUEST',relatedId:request.id}});
      }
      const request=await tx.studentRequest.create({data:{action:'CREATE_STUDENT',submittedById:requester.id,payload:JSON.stringify({name:'ليلى أحمد محمود',registrationNumber:'TEST-PENDING-001',mobile:'01099999999'}),snapshot:JSON.stringify({student:null,course:null,enrollments:[]}),pendingKey:'create:TEST-PENDING-001'}});
      for(const manager of usersBefore.filter(u=>['admin','mod'].includes(u.role)))await tx.notification.create({data:{userId:manager.id,title:'Add student · ليلى أحمد محمود',message:`@${requester.username} submitted a sample student request.`,type:'STUDENT_REQUEST',relatedId:request.id}});
    }
    await tx.systemLog.create({data:{action:'ADD_LOCAL_TEST_DATA',actorUsername:actor,description:'Added 4 original course umbrellas, 28 cycles, 64 Arabic students, 8 Arabic instructors, tuition/book records and salary batches. Existing users untouched.'}});
    assert.deepEqual(await tx.user.findMany({orderBy:{id:'asc'}}),usersBefore);
  },{timeout:60000,isolationLevel:'Serializable'});
  const result={};for(const model of ['course','cycle','student','instructor','enrollment','bookPayment','payrollEarning','instructorPaymentBatch'])result[model]=await prisma[model].count();
  console.log(JSON.stringify(result));console.log('All user accounts unchanged. Sample data committed atomically.');
} finally {await prisma.$disconnect();}
