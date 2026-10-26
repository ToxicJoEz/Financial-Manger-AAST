import prisma,{atomic} from '../db/prisma.js';
import {moneyMinor} from '../utils/numbers.js';
import {logAction} from '../utils/logger.js';
const view=row=>({id:row.id,studentName:row.snapshot.studentName,registrationNumber:row.snapshot.registrationNumber,removedAt:row.createdAt,tuitionRetained:Number(row.tuitionMinor)/100,booksRetained:Number(row.bookMinor)/100,adjustments:row.snapshot.adjustments||[]});
export const getRemovedEnrollments=async(req,res,next)=>{try{
 const course=await prisma.cycle.findUnique({where:{id:req.params.id},select:{id:true}});if(!course)return res.status(404).json({error:'Cycle not found.'});
 const rows=await prisma.retainedEnrollmentIncome.findMany({where:{courseId:course.id},orderBy:[{createdAt:'desc'},{id:'asc'}]});res.json(rows.map(view));
}catch(error){next(error);}};
export const adjustRemovedEnrollment=atomic(async(req,res,next)=>{try{
 const row=await prisma.retainedEnrollmentIncome.findFirst({where:{id:req.params.removalId,courseId:req.params.id}});if(!row)return res.status(404).json({error:'Removed enrollment not found.'});
 if(!['REFUND','CORRECTION'].includes(req.body.mode)||req.body.confirm!==true)return res.status(400).json({error:'Choose refund or correction and confirm it.'});
 const tuition=moneyMinor(req.body.tuitionReduction??0,'Tuition amount'),books=moneyMinor(req.body.bookReduction??0,'Book amount');
 if(tuition+books<=0n||tuition>row.tuitionMinor||books>row.bookMinor)return res.status(400).json({error:'Enter an amount above zero, no greater than the tuition and book income still retained.'});
 if(moneyMinor(req.body.expectedTuition,'Reviewed tuition balance')!==row.tuitionMinor||moneyMinor(req.body.expectedBooks,'Reviewed book balance')!==row.bookMinor)return res.status(409).json({error:'The retained amounts changed. Refresh and review them before adjusting.'});
 const {mode}=req.body;
 if(tuition>0n)await prisma.paymentEntry.create({data:{enrollmentId:null,courseId:row.courseId,studentId:row.snapshot.studentId,courseName:row.snapshot.courseName,studentName:row.snapshot.studentName,amountMinor:-tuition,kind:mode==='REFUND'?'REFUND':'ADJUSTMENT',note:'Post-removal '+(mode==='REFUND'?'refund':'correction'),recordedBy:req.user.username,idempotencyKey:crypto.randomUUID(),paymentMethod:'UNSPECIFIED'}});
 const entry={mode,tuition:Number(tuition)/100,books:Number(books)/100,recordedAt:new Date().toISOString(),recordedBy:req.user.username};
 const updated=await prisma.retainedEnrollmentIncome.update({where:{id:row.id},data:{tuitionMinor:row.tuitionMinor-tuition,bookMinor:row.bookMinor-books,snapshot:{...row.snapshot,adjustments:[...(row.snapshot.adjustments||[]),entry]}}});
 await logAction('ADJUST_REMOVED_ENROLLMENT',`${mode}: ${row.snapshot.studentName}; tuition ${entry.tuition}, books ${entry.books} EGP.`,req.user.username);
 res.json({message:'Adjustment recorded. Income totals updated.',record:view(updated)});
}catch(error){next(error);}});
