import express from 'express';
import { getSystemLogs } from '../controllers/logController.js';
import { protect, adminOnly } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', protect, adminOnly, getSystemLogs);

export default router;
