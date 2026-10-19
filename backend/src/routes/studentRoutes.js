import express from 'express';
import { getStudents, createStudent, updateStudent, deleteStudent } from '../controllers/studentController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All student routes are protected for authenticated users
router.use(protect);

router.get('/', getStudents);
router.post('/', createStudent);
router.put('/:id', updateStudent);
router.delete('/:id', deleteStudent);

export default router;
