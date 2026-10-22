import {randomUUID} from 'node:crypto';
import prisma from '../db/prisma.js';
import {auditContext} from '../utils/auditContext.js';
import {auditData} from '../utils/auditEvent.js';
export function auditMiddleware(req,res,next){
 const audit={id:randomUUID(),started:Date.now(),notes:[],changes:[],actor:null,persisted:false};
 try{const name=req.headers['x-file-name'];if(typeof name==='string')audit.fileName=decodeURIComponent(name).slice(0,300);}catch{}
 auditContext.run(audit,()=>{
  const json=res.json.bind(res);
  res.json=function(body){
   if(audit.responding)return res;
   if(req.method==='OPTIONS'||(req.method==='GET'&&res.statusCode<400)||audit.persisted)return json(body);
   audit.responding=true;
   const status=res.statusCode;
   (async()=>{
    try{const data=await auditData(prisma,audit,req,status,body);await prisma.systemLog.create({data});audit.persisted=true;return json(body);}
    catch{console.error('AUDIT_WRITE_FAILED',{requestId:audit.id,method:req.method,status});res.statusCode=503;return json({error:'The activity record could not be saved. Please try again.',requestId:audit.id});}
   })();
   return res;
  };
  next();
 });
}
