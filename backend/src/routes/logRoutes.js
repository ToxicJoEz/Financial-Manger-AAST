import express from 'express';
import {getSystemLogs,logOptions,logDetails} from '../controllers/logController.js';
import {protect,modOrAbove} from '../middlewares/authMiddleware.js';
const router=express.Router();router.use(protect,modOrAbove);
router.get('/options',logOptions);router.get('/:id',logDetails);router.get('/',getSystemLogs);
export default router;
