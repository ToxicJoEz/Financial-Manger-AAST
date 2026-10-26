import {auditContext} from '../utils/auditContext.js';
import {createHmac} from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma,{atomic} from '../db/prisma.js';
import {parseEmployeeWorkbook} from '../utils/employeeWorkbook.js';
import {employeeName,employeeBranches} from '../utils/employees.js';
import {logAction} from '../utils/logger.js';
const key=()=>createHmac('sha256',process.env.JWT_SECRET).update('employee-import-v1').digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function readPreview(token,userId){
 let claim;try{claim=jwt.verify(token,key(),{algorithms:['HS256'],audience:'employee-import'});}catch{fail('The preview expired or is invalid. Read the file again.');}
 if(claim.purpose!=='employee-import'||claim.userId!==userId)fail('This preview belongs to another user.',403);
 return claim;
}
function resolveMappings(parsed,input,fallback){
 if(input!=null && (typeof input!=='object'||Array.isArray(input)))fail('Choose valid branch mappings.');
 const mappings={};
 for(const group of parsed.branchGroups){
  const value=input&&Object.hasOwn(input,group.key)?input[group.key]:(fallback||group.suggestedBranches);
  if(!Array.isArray(value))fail('Choose valid branch mappings.');
  mappings[group.key]=value.length?employeeBranches(value):[];
 }
 if(input&&Object.keys(input).some(k=>!parsed.branchGroups.some(g=>g.key===k)))fail('Unknown branch group. Read the workbook again.');
 return mappings;
}
async function inspect(sourceRows,mappings,duplicateChoices={}){
 if(!duplicateChoices||typeof duplicateChoices!=='object'||Array.isArray(duplicateChoices))fail('Choose valid duplicate resolutions.');
 // The same employee across worksheets represents one import, with a union of chosen branches.
 const merged=new Map(),rows=[];
 for(const source of sourceRows){
  const branches=mappings[source.branchKey]||[],existing=source.employeeId&&merged.get(JSON.stringify([source.employeeId,source.name]));
  const location={sheetName:source.sheetName,rowNumber:source.sourceRow};
  if(existing&&existing.name===source.name){
   existing.branches=[...new Set([...existing.branches,...branches])];existing.sources.push(location);existing.issues.push(...source.issues);
   if(!branches.length)existing.issues.push(`Choose branches for ${source.sheetName}, row ${source.sourceRow}.`);
  }else{
   const row={...source,branches:[...branches],sources:[location],issues:[...source.issues]};
   if(!branches.length)row.issues.push('Choose at least one branch for this file branch group.');
   if(source.employeeId)merged.set(JSON.stringify([source.employeeId,source.name]),row);
   rows.push(row);
  }
 }
 const variants=new Map();
 for(const row of rows)if(row.employeeId){const group=variants.get(row.employeeId)||[];group.push(row);variants.set(row.employeeId,group);}
 for(const [id,choice] of Object.entries(duplicateChoices)){
  const group=variants.get(id);
  if(!group||group.length<2||!Number.isInteger(choice)||!group.some(row=>row.rowNumber===choice))fail('Invalid duplicate choice. Choose one of the displayed employee entries.');
 }
 const existing=await prisma.instructor.findMany({where:{employeeId:{in:rows.map(r=>r.employeeId).filter(Boolean)}},select:{id:true,name:true,employeeId:true,branches:true,updatedAt:true,archivedAt:true}});
 const byId=new Map(existing.map(e=>[e.employeeId,e]));
 return rows.map(row=>{
  const employee=byId.get(row.employeeId),issues=[...new Set(row.issues)];
  const conflict=(variants.get(row.employeeId)?.length||0)>1;
  const choice=Object.hasOwn(duplicateChoices,row.employeeId)?duplicateChoices[row.employeeId]:null;
  const skipped=conflict&&choice!==null&&choice!==row.rowNumber;
  if(conflict&&choice===null)issues.push('This employee ID has different names in the workbook. Choose one entry in Resolve duplicate IDs.');
  const currentBranches=(employee?.branches||'').split(',').map(b=>b.trim().toUpperCase()).filter(Boolean);
  const missingBranches=row.branches.filter(branch=>!currentBranches.includes(branch));
  if(employee?.archivedAt)issues.push('This employee is archived. Restore them before importing new branches.');
  if(employee){if(employeeName(employee.name)!==row.name)issues.push(`Employee ID belongs to a different name: ${employee.name}.`);else if(!missingBranches.length)issues.push('Duplicate: this employee already belongs to all selected branches.');}
  return {...row,conflict,missingBranches,action:skipped?'SKIP':issues.length?'ERROR':employee?'ADD_BRANCH':'CREATE',issues,existing:employee?{id:employee.id,name:employee.name,branches:employee.branches,version:employee.updatedAt.toISOString()}:null};
 });
}
export const previewEmployees=async(req,res,next)=>{
 try {
  const previous=Buffer.isBuffer(req.body)?null:readPreview(req.body.previewToken,req.user.id);
  const parsed=previous?.parsed||await parseEmployeeWorkbook(req.body);
  const fallback=req.query.branches!=null||req.query.branch!=null?employeeBranches(req.query.branches??req.query.branch):null;
  const mappings=resolveMappings(parsed,previous?req.body.branchMappings:null,fallback);
  const duplicateChoices=previous?(req.body.duplicateChoices??previous.duplicateChoices??{}):{};
  const rows=await inspect(parsed.rows,mappings,duplicateChoices);
  const fileName=previous?.fileName||decodeURIComponent(String(req.headers['x-file-name']||'Employees.xlsx')).slice(0,300);
  const previewToken=jwt.sign({purpose:'employee-import',userId:req.user.id,fileName,branchMappings:mappings,duplicateChoices,parsed,versions:Object.fromEntries(rows.map(r=>[r.rowNumber,r.existing?{id:r.existing.id,version:r.existing.version}:null]))},key(),{expiresIn:'20m',algorithm:'HS256',audience:'employee-import'});
  res.json({branches:fallback||[],branchMappings:mappings,duplicateChoices,branchGroups:parsed.branchGroups,sheetName:parsed.sheetName,sheetNames:parsed.sheetNames,skippedSheets:parsed.skippedSheets,sourceRowCount:parsed.rows.length,rows,previewToken});
 }catch(error){res.status(error.status||400).json({error:error.message||'Employee workbook could not be read.'});}
};
export const commitEmployees=atomic(async(req,res,next)=>{
 try{
  const claim=readPreview(req.body.previewToken,req.user.id);
  const selected=req.body.rows;
  if(!Array.isArray(selected)||!selected.length||selected.length>2000||selected.some(n=>!Number.isInteger(n))||new Set(selected).size!==selected.length)fail('Select valid employee rows.');
  req.auditFileName=claim.fileName;
  const mappings=resolveMappings(claim.parsed,claim.branchMappings);
  const rows=await inspect(claim.parsed.rows,mappings,claim.duplicateChoices||{}),chosen=rows.filter(r=>selected.includes(r.rowNumber));
  if(chosen.length!==selected.length)fail('Unknown employee row. Read the file again.');
  for(const row of chosen){if(row.action==='SKIP')fail('Only the chosen entry for a duplicate employee ID can be imported.',409);if(row.issues.length)fail(`Row ${row.rowNumber}: ${row.issues.join(' ')}`,409);const version=claim.versions[row.rowNumber];if((row.existing?.id || null)!==(version?.id || null)||(row.existing?.version || null)!==(version?.version || null))fail('Employee records changed after preview. Read the file again before importing.',409);}
  if(auditContext.getStore())auditContext.getStore().records=chosen.map(row=>({rowNumber:row.rowNumber,sources:row.sources,resolvedDuplicate:row.conflict,name:row.name,employeeId:row.employeeId,branchesAdded:row.missingBranches}));
  const newRows=chosen.filter(row=>!row.existing),branchRows=chosen.filter(row=>row.existing);
  let created=0,updated=0;
  if(newRows.length){const result=await prisma.instructor.createMany({data:newRows.map(row=>({name:row.name,employeeId:row.employeeId,branches:row.branches.join(',')}))});created=result.count;}
  const groups=new Map();
  for(const row of branchRows){const branches=[...new Set([...row.existing.branches.split(',').map(b=>b.trim().toUpperCase()).filter(Boolean),...row.missingBranches])].join(',');const ids=groups.get(branches)||[];ids.push(row.existing.id);groups.set(branches,ids);}
  for(const [branches,ids]of groups){const result=await prisma.instructor.updateMany({where:{id:{in:ids}},data:{branches}});if(result.count!==ids.length)fail('Employee records changed during import. Refresh and try again.',409);updated+=result.count;}
  await logAction('IMPORT_EMPLOYEES',`${created} employees created; ${updated} employees added to ${[...new Set(chosen.flatMap(row=>row.branches))].join(', ')}; ${rows.length-chosen.length} rows not selected.`,req.user.username);
  const membershipsAdded=branchRows.reduce((sum,row)=>sum+row.missingBranches.length,0);
  res.json({created,updated,membershipsAdded,message:`${created} employees added; ${updated} existing employees updated (${membershipsAdded} new branch memberships).`});
 }catch(error){next(error);}
}, {timeout:45000});
