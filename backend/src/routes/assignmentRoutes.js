import express from 'express';
import {
  approveAssignment,
  rejectAssignment,
  undoAssignment,
  getAssignmentReview
} from '../controllers/assignmentController.js';
import { protect, payrollManager } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

// Approving sets an hourly rate, so reviews are for admins and the main mod.
router.get('/:id', payrollManager, getAssignmentReview);
router.post('/:id/approve', payrollManager, approveAssignment);
router.post('/:id/reject', payrollManager, rejectAssignment);
router.delete('/:id', undoAssignment);

export default router;
