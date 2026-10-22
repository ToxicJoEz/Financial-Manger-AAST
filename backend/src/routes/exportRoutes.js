import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { exportOptions, prepareExport } from '../controllers/exportController.js';
const router = express.Router();
router.use(protect);
router.get('/options', exportOptions);
router.post('/', prepareExport);
router.post('/events',async(req,res)=>{
 const {format,status,month,batchId,message}=req.body||{};
 if(!['pdf','docx','xlsx','import'].includes(format)||!['SUCCESS','FAILURE','STARTED'].includes(status))return res.status(400).json({error:'Invalid report activity.'});
 if(['pdf','docx'].includes(format)&&!['admin','mod'].includes(req.user.role))return res.status(403).json({error:'Only managers can generate salary reports.'});
 const audit=(await import('../utils/auditContext.js')).auditContext.getStore();
 if(audit){audit.clientResult=status;audit.notes.push({action:status==='STARTED'?'REPORT_GENERATION_STARTED':status==='FAILURE'?'REPORT_GENERATION_FAILED':'REPORT_GENERATED',description:`${format.toUpperCase()} report ${status.toLowerCase()}${month?' · '+String(month).slice(0,7):''}${batchId?' · batch '+String(batchId).slice(0,100):''}`,actorUsername:req.user.username});}
 res.json({message:'Report activity recorded.'});
});
export default router;
