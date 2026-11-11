import express from 'express';
import { getSystemLogs, logOptions, logDetails } from '../controllers/logController.js';
import { protect, mainManager } from '../middlewares/authMiddleware.js';
const router = express.Router();
// The activity log is for admins and the main mod only.
router.use(protect, mainManager);
router.get('/options', logOptions);
router.get('/:id', logDetails);
router.get('/', getSystemLogs);
export default router;
