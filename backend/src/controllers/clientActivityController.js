import {auditContext} from '../utils/auditContext.js';
const actions={IMPORT_FILE_REJECTED:'imports',CLIENT_ACTION_FAILED:'system',FORM_VALIDATION_FAILED:'system'};
export function clientActivity(req,res){
 const {action,message,fileName,fields}=req.body||{};
 if(!Object.hasOwn(actions,action)||typeof message!=='string'||message.length>500||fileName&&typeof fileName!=='string')return res.status(400).json({error:'Invalid client activity.'});
 const audit=auditContext.getStore();
 if(audit){audit.clientResult='FAILURE';audit.category=actions[action];audit.fileName=fileName?.slice(0,300);audit.notes.push({action,description:'Browser reported: '+message,actorUsername:req.user.username});}
 res.json({message:'Client-reported failure recorded.'});
}
