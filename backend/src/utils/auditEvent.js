import {createHash} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {auditSnapshot} from './mutationContext.js';
const secret=/password|token|secret|authorization|cookie|previewToken|confirmationName/i;
export function safeAudit(value,depth=0){
 if(depth>14)return '[Nested data omitted]';
 if(value==null)return value;
 if(Buffer.isBuffer(value))return {fileBytes:value.length};
 if(typeof value==='bigint')return String(value);
 if(value instanceof Date)return value.toISOString();
 if(typeof value==='string'){
  let text=value;for(const [key,v]of Object.entries(process.env))if(/SECRET|PASSWORD|TOKEN|DATABASE_URL|DIRECT_URL|PGHOST|PGUSER/i.test(key)&&v&&v.length>=5)text=text.split(v).join('[REDACTED]');
  return text.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi,'[REDACTED_DATABASE_URL]') .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g,'[REDACTED_HASH]').replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED_TOKEN]').replace(/((?:current|new)?password|passwordHash|authorization|access[_-]?token|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,'$1: [REDACTED]').slice(0,12000);
 }
 if(Array.isArray(value))return value.map(v=>safeAudit(v,depth+1));
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!secret.test(key)).map(([key,v])=>[key,key==='avatar'&&v?{type:'Profile image',characters:String(v).length,fingerprint:createHash('sha256').update(String(v)).digest('hex').slice(0,16)}:safeAudit(v,depth+1)]));
 return value;
}
export const summarizeAction=(req)=>{
 const path=req.originalUrl.split('?')[0].replace(/^\/api\/?/,'');
 const category=path.startsWith('auth')?'authentication':path.startsWith('users')?'accounts':path.includes('import')?'imports':path.startsWith('exports')?'exports':path.startsWith('finances')?'payroll':path.startsWith('student-requests')||path.startsWith('assignments')?'approvals':path.startsWith('students')?'students':/^(employees|instructors)/.test(path)?'employees':path.startsWith('courses')?'courses':path.startsWith('cycles')?'cycles':path.startsWith('notifications')?'notifications':path.startsWith('branches')?'settings':'system';
 const parts=path.split('/'),tail=parts.at(-1);
 let action=({POST:'CREATE',PUT:'UPDATE',PATCH:'UPDATE',DELETE:'DELETE',GET:'READ'})[req.method]||req.method;
 if(/auth\/login$/.test(path))action='LOGIN_LOCAL';else if(/auth\/sso$/.test(path))action='LOGIN_SSO';else if(/auth\/logout$/.test(path))action='LOGOUT';
 else if(path==='exports/events')action='EXPORT_REPORT';else if(path==='exports')action='PREPARE_EXCEL_EXPORT';
 else if(path.includes('import'))action=['preview','review'].includes(tail)?'PREVIEW_IMPORT':'IMPORT_DATA';
 else if(tail==='permanent')action='PERMANENT_DELETE';else if(tail==='finish')action='COMPLETE_CYCLE';else if(tail==='revert')action='REOPEN_CYCLE';else if(tail==='restore')action='RESTORE';
 else if(tail==='approve')action='APPROVE_REQUEST';else if(tail==='reject')action='REJECT_REQUEST';
 else if(req.method==='DELETE'&&['courses','cycles'].includes(parts[0]))action='ARCHIVE';
 const phrase=({LOGIN_LOCAL:'Password sign-in',LOGIN_SSO:'AAST SSO sign-in',LOGOUT:'Signed out',PREVIEW_IMPORT:'Read Excel workbook',IMPORT_DATA:'Import workbook data',PREPARE_EXCEL_EXPORT:'Prepare Excel report',EXPORT_REPORT:'Generate report',PERMANENT_DELETE:'Permanently delete',COMPLETE_CYCLE:'Complete cycle',REOPEN_CYCLE:'Reopen cycle',APPROVE_REQUEST:'Approve request',REJECT_REQUEST:'Reject request',CREATE:'Create',UPDATE:'Update',DELETE:'Remove',READ:'Access',ARCHIVE:'Archive',RESTORE:'Restore'})[action]||action.toLowerCase().replaceAll('_',' ');
 const noun=({courses:'course',cycles:'cycle',students:'student',employees:'employee',accounts:'account',approvals:'request',payroll:'salary payment',notifications:'notification',system:'activity'})[category]||'';
 const target=typeof req.body?.name==='string'?' '+req.body.name.slice(0,120):'';
 return {category,action,description:phrase+(['CREATE','UPDATE','DELETE','READ','ARCHIVE','RESTORE','PERMANENT_DELETE'].includes(action)?' '+noun+target:'')};
};
export async function auditData(client,audit,req,status,body){
 const route=summarizeAction(req);let actor=audit.actor;
 if(!actor&&!/\/auth\/(login|sso)$/.test(req.originalUrl.split('?')[0])){
  try{const header=req.headers.authorization;if(typeof header==='string'&&header.startsWith('Bearer ')){const decoded=jwt.verify(header.slice(7),process.env.JWT_SECRET);actor=await client.user.findUnique({where:{id:decoded.id},select:{id:true,username:true,role:true}});if(actor){audit.verified=true;audit.authMethod=decoded.authMethod||audit.authMethod;}}}catch{}
 }
 if(!actor&&/\/auth\/(login|sso)$/.test(req.originalUrl.split('?')[0])){
  const username=audit.notes.find(n=>/^LOGIN_/.test(n.action))?.actorUsername||req.body?.username;
  if(typeof username==='string')actor=await client.user.findUnique({where:{username},select:{id:true,username:true,role:true}});
 }
 const previewErrors=Array.isArray(body?.rows)?body.rows.filter(row=>row.action==='ERROR'||row.issues?.length||row.errors?.length):[];
 const failed=status>=400||previewErrors.length>0||audit.clientResult==='FAILURE';
 const notes=audit.notes,primary=notes.at(-1);
 const submitted=Buffer.isBuffer(req.body)?{fileBytes:req.body.length}:safeAudit(req.body||{});
 const fileName=req.auditFileName||audit.fileName;
 const result={};for(const key of ['message','created','updated','enrolled','reused','cycleName','cycleId','importId','membershipsAdded'])if(body?.[key]!==undefined)result[key]=body[key];
 if(previewErrors.length)result.validationErrors=previewErrors.map(r=>({row:r.rowNumber,name:r.name,employeeId:r.employeeId,issues:r.issues||r.errors}));
 const details=safeAudit({identityVerified:Boolean(req.user||audit.verified||audit.notes.some(n=>/^LOGIN_/.test(n.action))),importedRows:audit.records,submitted,query:req.query,fileName,notes,changes:audit.changes,committed:!failed,result,error:status>=400?{status,message:body?.error||body?.message||'The action failed.'}:undefined,method:req.method,path:req.originalUrl.split('?')[0]});
 let description=primary?.description||route.description;
 if(fileName&&!description.includes(fileName))description+=' · '+fileName;
 if(failed)description='Failed: '+description;
 if(status>=400&&!primary&&typeof(body?.error||body?.message)==='string')description+=' · '+(body.error||body.message).slice(0,200);
 return {requestId:audit.id,recordCount:audit.changes.reduce((n,c)=>n+Math.max(c.before?.length||0,Array.isArray(c.after)?c.after.length:1),0),actorId:actor?.id||null,actorUsername:actor?.username||'Unknown account',actorRole:actor?.role||null,authMethod:audit.authMethod||(/auth\/sso/.test(req.originalUrl)?'SSO':/auth\/login/.test(req.originalUrl)?'PASSWORD':null),action:primary?.action||route.action,category:audit.category||route.category,outcome:failed?'FAILURE':'SUCCESS',description:safeAudit(description).slice(0,1500),targetUsername:primary?.targetUsername||null,statusCode:status,durationMs:Date.now()-audit.started,details};
}
export function snapshotChange(entity,operation,before,after){return auditSnapshot({entity,operation,before,after});}
