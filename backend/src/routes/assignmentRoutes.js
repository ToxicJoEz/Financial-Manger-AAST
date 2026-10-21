import express from 'express';
import { approveAssignment, rejectAssignment, undoAssignment, getAssignmentReview } from '../controllers/assignmentController.js';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/:id', modOrAbove, getAssignmentReview);
router.post('/:id/approve', modOrAbove, approveAssignment);
router.post('/:id/reject', modOrAbove, rejectAssignment);
router.delete('/:id', undoAssignment);

export default router;