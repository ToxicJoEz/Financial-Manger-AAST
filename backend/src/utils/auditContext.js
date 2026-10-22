import {AsyncLocalStorage} from 'node:async_hooks';
export const auditContext=new AsyncLocalStorage();
export function auditActor(user,authMethod){const audit=auditContext.getStore();if(audit){audit.actor={id:user.id,username:user.username,role:user.role};if(authMethod)audit.authMethod=authMethod;}}
