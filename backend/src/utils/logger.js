import prisma from '../db/prisma.js';
import {auditContext} from './auditContext.js';
export async function logAction(action,description,actorUsername,targetUsername=null){
 const audit=auditContext.getStore();
 if(audit){audit.notes.push({action,description,actorUsername,targetUsername});return;}
 const actor=await prisma.user.findUnique({where:{username:actorUsername},select:{id:true,role:true}});
 return prisma.systemLog.create({data:{action,description,actorUsername,targetUsername,actorId:actor?.id,actorRole:actor?.role}});
}
