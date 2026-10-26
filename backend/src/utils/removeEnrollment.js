import prisma from '../db/prisma.js';
import {moneyMinor} from './numbers.js';
import {appendPayment} from './paymentLedger.js';
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
export async function permanentlyRemoveEnrollment(enrollment,user,body={}){
 const {course,student}=enrollment;
 const tuition=enrollment.financialArchivedAt?0n:moneyMinor(enrollment.amountPaid);
 const bookRows=await prisma.bookPayment.findMany({where:{enrollmentId:enrollment.id,reversedAt:null,status:'PAID'}});
 const books=enrollment.financialArchivedAt?0n:bookRows.reduce((sum,row)=>sum+row.amountMinor,0n);
 const mode=body.mode||'KEEP';
 if(!['KEEP','REFUND','CORRECTION'].includes(mode))fail('Choose retain income, refund or correction.');
 const tuitionReduction=mode==='KEEP'?0n:moneyMinor(body.tuitionReduction??0,'Tuition amount to remove');
 const bookReduction=mode==='KEEP'?0n:moneyMinor(body.bookReduction??0,'Book amount to remove');
 if(tuitionReduction>tuition||bookReduction>books)fail('The amount removed cannot exceed the tuition or book payments actually collected.');
 const reason={KEEP:'Enrollment removed; collected income retained.',REFUND:'Enrollment removed with a recorded refund.',CORRECTION:'Enrollment removed with an income correction.'}[mode];
 if(tuitionReduction>0n)await appendPayment(enrollment,course,student,user,{amountMinor:-tuitionReduction,kind:mode==='REFUND'?'REFUND':'ADJUSTMENT',note:reason,idempotencyKey:`removal:${enrollment.id}`});
 await prisma.retainedEnrollmentIncome.create({data:{courseId:course.id,sourceEnrollmentId:enrollment.id,tuitionMinor:tuition-tuitionReduction,bookMinor:books-bookReduction,reason,recordedBy:user.username,snapshot:{studentId:student.id,studentName:student.name,registrationNumber:student.registrationNumber,courseName:course.name,mode,tuitionReduction:tuitionReduction.toString(),bookReduction:bookReduction.toString(),originalTuition:tuition.toString(),originalBooks:books.toString(),bookPayments:bookRows.map(row=>({...row,amountMinor:row.amountMinor.toString(),recordedAt:row.recordedAt.toISOString()}))}}});
 // PaymentEntry uses SetNull and retains its original identity snapshots; book snapshots are recorded above and in the audit event.
 await prisma.enrollment.delete({where:{id:enrollment.id}});
 return {tuitionRetained:Number(tuition-tuitionReduction)/100,booksRetained:Number(books-bookReduction)/100};
}
