import prisma from '../db/prisma.js';
import {safeAudit} from '../utils/auditEvent.js';
const visibility=user=>user.role==='mod'?{actorRole:'user',AND:[{OR:[{actorId:null},{actorId:{not:user.id}}]},{actorUsername:{not:user.username}}]}:{};
const summary={id:true,action:true,description:true,actorUsername:true,actorRole:true,category:true,outcome:true,createdAt:true,authMethod:true,statusCode:true,recordCount:true};
function readable(row){
 if(row.requestId)return row;
 try{const data=JSON.parse(row.description);if(data&&typeof data==='object'&&data.entity){const change=data.changes||{},target=change.name?.after||change.name?.before||change.after?.[0]?.name||change.before?.[0]?.name||data.ids?.[0];return {...row,description:row.action.toLowerCase().replaceAll('_',' ')+(target?' · '+target:'')+' (historical record)'};}}catch{}
 return row;
}
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
function dayStart(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)fail('Choose a valid date.');
 const target=Date.parse(day+'T00:00:00Z');let time=target;
 for(let i=0;i<3;i++){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(time).map(p=>[p.type,p.value]));const local=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);time+=target-local;}
 return new Date(time);
}
function filters(req){
 const where=visibility(req.user),q=req.query;
 if(q.outcome){if(!['SUCCESS','FAILURE'].includes(q.outcome))fail('Invalid result filter.');where.outcome=q.outcome;}
 for(const key of ['actorUsername','action','category'])if(q[key]){if(typeof q[key]!=='string'||q[key].length>160)fail('Invalid activity filter.');where[key]=q[key];}
 if(q.search){const contains=String(q.search).trim().slice(0,160);where.OR=[{description:{contains,mode:'insensitive'}},{actorUsername:{contains,mode:'insensitive'}},{action:{contains,mode:'insensitive'}}];}
 if(q.from||q.to){where.createdAt={};if(q.from)where.createdAt.gte=dayStart(q.from);if(q.to){dayStart(q.to);const next=new Date(Date.parse(q.to+'T12:00:00Z')+86400000).toISOString().slice(0,10);where.createdAt.lt=dayStart(next);}if(q.from&&q.to&&q.from>q.to)fail('The end date must follow the start date.');}
 return where;
}
export const getSystemLogs=async(req,res,next)=>{
 try{
  const page=Number(req.query.page||1),pageSize=25;if(!Number.isInteger(page)||page<1||page>100000)fail('Invalid activity page.');
  const where=filters(req),[items,total,groups]=await prisma.$transaction([prisma.systemLog.findMany({where,select:summary,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*pageSize,take:pageSize}),prisma.systemLog.count({where}),prisma.systemLog.groupBy({by:['outcome'],where,_count:true})]);
  res.json({items:items.map(readable),total,page,pageSize,success:groups.find(g=>g.outcome==='SUCCESS')?._count||0,failure:groups.find(g=>g.outcome==='FAILURE')?._count||0});
 }catch(e){next(e);}
};
export const logOptions=async(req,res,next)=>{
 try{const rows=await prisma.systemLog.groupBy({by:['actorUsername','action','category'],where:visibility(req.user)});res.json({users:[...new Set(rows.map(r=>r.actorUsername))].sort(),actions:[...new Set(rows.map(r=>r.action))].sort(),categories:[...new Set(rows.map(r=>r.category))].sort()});}catch(e){next(e);}
};
function modSafe(value){
 if(Array.isArray(value))return value.map(modSafe);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/^hourlyRate$|^rate$|salary|payroll|password|token|secret/i.test(key)).map(([key,v])=>[key,modSafe(v)]));
 return value;
}
export const logDetails=async(req,res,next)=>{
 try{
  const page=Number(req.query.page||1);if(!Number.isInteger(page)||page<1)fail('Invalid detail page.');
  const row=await prisma.systemLog.findFirst({where:{id:req.params.id,...visibility(req.user)}});if(!row)return res.status(404).json({error:'Activity entry not found.'});
  let details=row.details||{};if(!row.details){try{details=JSON.parse(row.description);}catch{details={notes:[{description:row.description}]};}}
  if(!details||typeof details!=='object'||Array.isArray(details))details={notes:[{description:row.description}]};
  if(details.changes&&!Array.isArray(details.changes)){
   const change=details.changes;
   const pairs=Object.entries(change).filter(([,v])=>v&&typeof v==='object'&&!Array.isArray(v)&&('before'in v||'after'in v));
   const before=Array.isArray(change.before)?change.before:pairs.length?[Object.fromEntries(pairs.map(([k,v])=>[k,v.before]))]:[];
   const after=Array.isArray(change.after)?change.after:pairs.length?[Object.fromEntries(pairs.map(([k,v])=>[k,v.after]))]:[];
   details={...details,changes:[{entity:details.entity||'record',operation:row.action,before,after}],legacy:true};
  }
  details=safeAudit(details);if(req.user.role==='mod')details=modSafe(details);
  const {changes=[],...metadata}=details,entries=[];
  for(const change of changes){const before=Array.isArray(change.before)?change.before:[],after=Array.isArray(change.after)?change.after:[];const records=after.length?after:before;
   for(let i=0;i<records.length;i++){const current=records[i],old=after.length?(before.find(b=>b.id&&b.id===current.id)||before[i]):current,newValue=after.length?current:null;const fields=[...new Set([...Object.keys(old||{}),...Object.keys(newValue||{})])].filter(k=>!['updatedAt','createdAt'].includes(k)&&JSON.stringify(old?.[k]??null)!==JSON.stringify(newValue?.[k]??null)).map(field=>({field,before:old?.[field]??null,after:newValue?.[field]??null}));entries.push({entity:change.entity,operation:change.operation,id:current.id,label:current.name||current.studentName||current.instructorName||current.username||current.id||'Record',fields});}
  }
  const display=readable(row);
  res.json({...Object.fromEntries(Object.keys(summary).map(key=>[key,display[key]])),requestId:row.requestId,durationMs:row.durationMs,details:metadata,entries:entries.slice((page-1)*20,page*20),totalEntries:entries.length,page,pageSize:20});
 }catch(e){next(e);}
};
