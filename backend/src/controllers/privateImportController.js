import {createHmac,createHash} from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma,{atomic} from '../db/prisma.js';
import {parsePrivateWorkbook,phoneNumbers,privateDate} from '../utils/privateWorkbook.js';
import {importError} from '../utils/importWorkbook.js';
import {moneyMinor,numberValue} from '../utils/numbers.js';
import {employeeName,employeeNumber,employeeBranches} from '../utils/employees.js';
import {cycleNumberFor,privateName} from '../utils/privateCourses.js';
import {importedCycleFinished} from '../utils/academyDate.js';
import {appendPayment} from '../utils/paymentLedger.js';
import {savePayrollRecord} from '../utils/payrollRecord.js';
import {auditContext} from '../utils/auditContext.js';
const key=()=>createHmac('sha256',process.env.JWT_SECRET).update('private-course-import-v1').digest('hex');
const fingerprint=(parentId,row)=>createHash('sha256').update(`${parentId}:${row.fingerprint}`).digest('hex');
async function parentFor(id){const parent=await prisma.course.findUnique({where:{id}});if(!parent?.isPrivate||parent.archivedAt)throw importError('Choose an available private umbrella.',404);return parent;}
function claimFor(req){try{const claim=jwt.verify(req.body.previewToken,key(),{algorithms:['HS256'],audience:'private-course-import'});if(claim.userId!==req.user.id||claim.parentId!==req.params.parentId)throw new Error();return claim;}catch{throw importError('This preview expired or belongs to another user or umbrella. Upload again.',403);}}
const snapshot=matches=>matches.map(s=>({id:s.id,updatedAt:s.updatedAt,archived:Boolean(s.deletedAt)})).sort((a,b)=>a.id.localeCompare(b.id));
const match=(row,students)=>students.filter(s=>phoneNumbers(s.mobile).some(n=>phoneNumbers(row.mobile).includes(n)));
const studentFields={id:true,name:true,englishName:true,mobile:true,registrationNumber:true,deletedAt:true,updatedAt:true};
function errorsFor(row){
 const errors=[];if(typeof row.name!=='string'||!row.name.trim()||row.name.length>160)errors.push('Student name is required (up to 160 characters).');
 if(typeof row.mobile!=='string'||row.mobile.length>100||!phoneNumbers(row.mobile).length)errors.push('A valid student phone number is required.');
 if(typeof row.cycleName!=='string'||!row.cycleName.trim()||row.cycleName.length>200)errors.push('Cycle name is required (up to 200 characters).');
 if(row.dateIssues?.endDate&&!row.endDate&&!row.clearEndDate)errors.push('Correct the invalid source end date, or confirm it is unknown.');
 const start=privateDate(row.startDate),end=privateDate(row.endDate);if(!start.value)errors.push('Correct the start date.');if(row.endDate&&!end.value)errors.push('Correct the end date.');if(start.value&&end.value&&end.value<start.value)errors.push('End date must be on or after start date.');
 if(row.currency&&!/^EGP$/i.test(row.currency))errors.push('Only EGP tuition is supported.');
 try{if(row.hours===''||numberValue(row.hours,'Teaching hours')<=0)throw new Error();}catch{errors.push('Enter positive teaching hours.');}
 try{if(row.amount==='')throw new Error();moneyMinor(row.amount,'Tuition');}catch{errors.push('Enter nonnegative tuition, or 0 for exemption.');}
 try{employeeBranches([row.branch]);}catch{errors.push('Choose a branch.');}
 try{moneyMinor(row.hourlyRate,'Cycle employee hourly rate');}catch{errors.push('Enter the employee hourly rate for this cycle.');}
 try{moneyMinor(row.bookPrice??0,'Book price');}catch{errors.push('Enter a nonnegative book price.');}
 return errors;
}
async function preview(req,res,claim){
 const students=await prisma.student.findMany({select:studentFields});
 const imports=await prisma.importBatch.findMany({where:{fingerprint:{in:claim.parsed.rows.map(r=>fingerprint(claim.parentId,r))}},select:{fingerprint:true}});
 const rows=claim.parsed.rows.map(row=>{const matches=match(row,students);return {...row,matches,errors:errorsFor(row),alreadyImported:imports.some(b=>b.fingerprint===fingerprint(claim.parentId,row))};});
 const {exp,iat,...payload}=claim;
 const previewToken=jwt.sign({...payload,studentVersions:Object.fromEntries(rows.map(r=>[r.id,snapshot(r.matches)]))},key(),{algorithm:'HS256',expiresIn:'30m'});
 res.json({sheets:claim.parsed.sheets,rows,warnings:claim.parsed.warnings,previewToken});
}
export const previewPrivateImport=async(req,res,next)=>{try{const parent=await parentFor(req.params.parentId),parsed=await parsePrivateWorkbook(req.body);let fileName='Private courses.xlsx';try{fileName=decodeURIComponent(req.headers['x-file-name']||fileName).slice(0,200);}catch{}await preview(req,res,{userId:req.user.id,parentId:parent.id,parsed,fileName,aud:'private-course-import'});}catch(error){next(error);}};
export const reviewPrivateImport=async(req,res,next)=>{try{const claim=claimFor(req);await parentFor(claim.parentId);if(!req.body.edits||typeof req.body.edits!=='object'||Array.isArray(req.body.edits))throw importError('Review the edited rows first.');const allowed=['name','mobile','cycleName','startDate','endDate','hours','amount','branch','bookPrice','hourlyRate','clearEndDate'];claim.parsed.rows=claim.parsed.rows.map(row=>{const edit=req.body.edits[row.id]||{};return {...row,...Object.fromEntries(allowed.filter(k=>Object.hasOwn(edit,k)).map(k=>[k,edit[k]]))};});await preview(req,res,claim);}catch(error){next(error);}};
export const commitPrivateImport=atomic(async(req,res,next)=>{try{
 const claim=claimFor(req),parent=await parentFor(claim.parentId);req.auditFileName=claim.fileName;
 const ids=req.body.rowIds;if(!Array.isArray(ids)||!ids.length||ids.length>500||new Set(ids).size!==ids.length||ids.some(id=>!claim.parsed.rows.some(r=>r.id===id)))throw importError('Select valid private-cycle rows.');
 const rows=claim.parsed.rows.filter(r=>ids.includes(r.id));for(const row of rows){const errors=errorsFor(row);if(errors.length)throw importError(`${row.sheet}, row ${row.sourceRow}: ${errors.join(' ')}`);}
 if(await prisma.importBatch.count({where:{fingerprint:{in:rows.map(r=>fingerprint(parent.id,r))}}}))throw importError('One or more selected entries were already imported. Review the file again.',409);
 const students=await prisma.student.findMany({select:studentFields}),choices=req.body.students||{},sheetChoices=req.body.employees||{},assigned=new Map();
 for(const row of rows){if(JSON.stringify(snapshot(match(row,students)))!==JSON.stringify(claim.studentVersions[row.id]))throw importError(`Student matches changed for ${row.name}. Review the workbook again.`,409);}
 // Resolve each sheet once. Its selected employee owns all of that sheet's assignments.
 for(const sheet of claim.parsed.sheets.filter(s=>rows.some(r=>r.sheetId===s.id))){
  const choice=sheetChoices[sheet.id];if(!choice||!['existing','new'].includes(choice.mode))throw importError(`Choose an existing or new employee for ${sheet.name}.`);
  let employee;
  if(choice.mode==='existing'){employee=await prisma.instructor.findUnique({where:{id:choice.employeeId||''}});if(!employee||employee.archivedAt)throw importError(`Choose an active employee for ${sheet.name}.`,409);}
  else{const name=employeeName(choice.name),employeeId=employeeNumber(choice.employeeId);if(!name||name.length>160||employeeId.length>80)throw importError('Enter a valid new employee name and ID.');const branches=employeeBranches(rows.filter(r=>r.sheetId===sheet.id).map(r=>r.branch));employee=await prisma.instructor.create({data:{name,employeeId:employeeId||null,branches:branches.join(',')}});}
  assigned.set(sheet.id,{employee});
 }
 let number=await cycleNumberFor(parent),created=0,reused=0;const cycles=[];
 if(number+rows.length-1>2147483647)throw importError('This umbrella has reached its cycle numbering limit.');
 const selectedByPhone=new Map();
 for(const row of rows){
  const candidates=match(row,students);let student;
  const selected=choices[row.id];if(selected){student=candidates.find(s=>s.id===selected);if(!student||student.deletedAt)throw importError(`Select an active matching student for ${row.name}.`,409);}
  else if(candidates.length===1&&!candidates[0].deletedAt)student=candidates[0];
  else if(candidates.length)throw importError(`Choose a matching student for ${row.name}; archived profiles must be restored first.`);
  else{student=await prisma.student.create({data:{name:row.name.trim(),englishName:row.name.trim(),mobile:row.mobile.trim(),registrationNumber:null}});students.push(student);created++;}
  const phones=phoneNumbers(row.mobile),previous=phones.map(p=>selectedByPhone.get(p)).filter(Boolean);if(previous.some(id=>id!==student.id))throw importError(`The same phone was assigned to different students in this import. Review ${row.name}.`);phones.forEach(p=>selectedByPhone.set(p,student.id));
  if(candidates.length)reused++;
  const {employee}=assigned.get(row.sheetId),hourlyRate=Number(moneyMinor(row.hourlyRate,'Cycle employee hourly rate'))/100,isFinished=importedCycleFinished(row.endDate);
  const cycle=await prisma.cycle.create({data:{parentCourseId:parent.id,cycleNumber:number++,name:privateName(row.cycleName),branch:row.branch,startDate:new Date(row.startDate+'T00:00:00Z'),endDate:row.endDate?new Date(row.endDate+'T00:00:00Z'):null,isFinished,totalHours:numberValue(row.hours),courseFee:Number(moneyMinor(row.amount))/100,bookPrice:Number(moneyMinor(row.bookPrice??0))/100}});
  const batch=await prisma.importBatch.create({data:{fingerprint:fingerprint(parent.id,row),fileName:claim.fileName,parentCourseId:parent.id,cycleId:cycle.id,recordedBy:req.user.username,studentCount:1}});
  const enrollment=await prisma.enrollment.create({data:{courseId:cycle.id,studentId:student.id,customFee:Number(row.amount)===0?0:null}});
  if(Number(row.amount)>0)await appendPayment(enrollment,cycle,student,req.user,{amountMinor:moneyMinor(row.amount),kind:'PAYMENT',note:'Paid tuition imported from private course workbook.',paymentMethod:'UNSPECIFIED',paymentDateKnown:false,idempotencyKey:`private-import:${batch.id}`,importBatchId:batch.id});
  await prisma.courseInstructor.create({data:{courseId:cycle.id,instructorId:employee.id,hourlyRate,hoursTaught:isFinished?Number(row.hours):null}});if(isFinished)await savePayrollRecord(cycle.id);
  cycles.push({id:cycle.id,name:cycle.name});
 }
 const audit=auditContext.getStore();if(audit)audit.records=rows.map(row=>({...row,selectedStudent:choices[row.id]||null,employee:assigned.get(row.sheetId).employee.id}));
 res.status(201).json({cycles,created,reused,enrolled:rows.length,message:`Imported ${rows.length} private cycles.`});
}catch(error){next(error);}},{timeout:120000});
