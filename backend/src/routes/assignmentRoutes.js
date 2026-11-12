import express from 'express';
import {
  approveAssignment,
  rejectAssignment,
  undoAssignment,
  getAssignmentReview
} from '../controllers/assignmentController.js';
import { protect, managersOnly } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

// Approving sets an hourly rate, so reviews are for admins and the main mod.
router.get('/:id', managersOnly('review requests'), getAssignmentReview);
router.post('/:id/approve', managersOnly('approve requests'), approveAssignment);
router.post('/:id/reject', managersOnly('reject requests'), rejectAssignment);
router.delete('/:id', undoAssignment);

export default router;
