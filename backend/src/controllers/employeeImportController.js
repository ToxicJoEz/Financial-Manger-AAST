import {createHmac} from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma,{atomic} from '../db/prisma.js';
import {parseEmployeeWorkbook} from '../utils/employeeWorkbook.js';
import {employeeName,employeeBranches} from '../utils/employees.js';
import {logAction} from '../utils/logger.js';
const key=()=>createHmac('sha256',process.env.JWT_SECRET).update('employee-import-v1').digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
async function inspect(rows,branches){
  const existing=await prisma.instructor.findMany({where:{employeeId:{in:rows.map(r=>r.employeeId).filter(Boolean)}},select:{id:true,name:true,employeeId:true,branches:true,updatedAt:true}});
  const counts=new Map();for(const row of rows)if(row.employeeId)counts.set(row.employeeId,(counts.get(row.employeeId)||0)+1);
  return rows.map(row=>{
    const employee=existing.find(e=>e.employeeId===row.employeeId),issues=[...row.issues];
    if(counts.get(row.employeeId)>1)issues.push('Repeated employee ID inside this file. Keep one row per employee.');
    const currentBranches=(employee?.branches||'').split(',').map(b=>b.trim().toUpperCase()).filter(Boolean);
    const missingBranches=branches.filter(branch=>!currentBranches.includes(branch));
    if(employee){if(employeeName(employee.name)!==row.name)issues.push(`Employee ID belongs to a different name: ${employee.name}.`);else if(!missingBranches.length)issues.push('Duplicate: this employee already belongs to all selected branches.');}
    return {...row,missingBranches,action:issues.length?'ERROR':employee?'ADD_BRANCH':'CREATE',issues,existing:employee?{id:employee.id,name:employee.name,branches:employee.branches,version:employee.updatedAt.toISOString()}:null};
  });
}
export const previewEmployees=async(req,res,next)=>{
 try {
  const branches=employeeBranches(req.query.branches ?? req.query.branch);
  const parsed=await parseEmployeeWorkbook(req.body),rows=await inspect(parsed.rows,branches);
  const previewToken=jwt.sign({purpose:'employee-import',userId:req.user.id,branches,parsed,versions:Object.fromEntries(rows.map(r=>[r.rowNumber,r.existing?{id:r.existing.id,version:r.existing.version}:null]))},key(),{expiresIn:'20m',algorithm:'HS256',audience:'employee-import'});
  res.json({branches,sheetName:parsed.sheetName,rows,previewToken});
 }catch(error){res.status(error.status||400).json({error:error.message||'Employee workbook could not be read.'});}
};
export const commitEmployees=atomic(async(req,res,next)=>{
 try{
  let claim;try{claim=jwt.verify(req.body.previewToken,key(),{algorithms:['HS256'],audience:'employee-import'});}catch{fail('The preview expired or is invalid. Read the file again.');}
  if(claim.purpose!=='employee-import'||claim.userId!==req.user.id)fail('This preview belongs to another user.',403);
  const selected=req.body.rows;
  if(!Array.isArray(selected)||!selected.length||selected.length>2000||selected.some(n=>!Number.isInteger(n))||new Set(selected).size!==selected.length)fail('Select valid employee rows.');
  const branches=employeeBranches(claim.branches ?? claim.branch);
  const rows=await inspect(claim.parsed.rows,branches),chosen=rows.filter(r=>selected.includes(r.rowNumber));
  if(chosen.length!==selected.length)fail('Unknown employee row. Read the file again.');
  for(const row of chosen){if(row.issues.length)fail(`Row ${row.rowNumber}: ${row.issues.join(' ')}`,409);const version=claim.versions[row.rowNumber];if((row.existing?.id || null)!==(version?.id || null)||(row.existing?.version || null)!==(version?.version || null))fail('Employee records changed after preview. Read the file again before importing.',409);}
  const newRows=chosen.filter(row=>!row.existing),branchRows=chosen.filter(row=>row.existing);
  let created=0,updated=0;
  if(newRows.length){const result=await prisma.instructor.createMany({data:newRows.map(row=>({name:row.name,employeeId:row.employeeId,branches:branches.join(',')}))});created=result.count;}
  const groups=new Map();
  for(const row of branchRows){const branches=[...new Set([...row.existing.branches.split(',').map(b=>b.trim().toUpperCase()).filter(Boolean),...row.missingBranches])].join(',');const ids=groups.get(branches)||[];ids.push(row.existing.id);groups.set(branches,ids);}
  for(const [branches,ids]of groups){const result=await prisma.instructor.updateMany({where:{id:{in:ids}},data:{branches}});if(result.count!==ids.length)fail('Employee records changed during import. Refresh and try again.',409);updated+=result.count;}
  await logAction('IMPORT_EMPLOYEES',`${created} employees created; ${updated} employees added to ${branches.join(', ')}; ${rows.length-chosen.length} rows not selected.`,req.user.username);
  const membershipsAdded=branchRows.reduce((sum,row)=>sum+row.missingBranches.length,0);
  res.json({created,updated,membershipsAdded,message:`${created} employees added; ${updated} existing employees updated (${membershipsAdded} new branch memberships).`});
 }catch(error){next(error);}
}, {timeout:45000});
