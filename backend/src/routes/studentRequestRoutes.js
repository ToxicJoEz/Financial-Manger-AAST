import express from 'express';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';
import { getStudentRequest, decideStudentRequest } from '../controllers/studentRequestController.js';
const router = express.Router();
router.use(protect, modOrAbove);
router.get('/:id', getStudentRequest);
router.post('/:id/:decision', decideStudentRequest);
export default router;
