import express from 'express';
import { getInstructors, createInstructor, updateInstructor, deleteInstructor } from '../controllers/instructorController.js';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getInstructors);
router.post('/', modOrAbove, createInstructor);
router.put('/:id', modOrAbove, updateInstructor);
router.delete('/:id', modOrAbove, deleteInstructor);

export default router;
