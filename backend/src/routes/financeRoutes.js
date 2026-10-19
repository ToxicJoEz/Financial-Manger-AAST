import express from 'express';
import { getFinances } from '../controllers/financeController.js';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(modOrAbove);

router.get('/', getFinances);

export default router;
