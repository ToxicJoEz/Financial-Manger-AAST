import express from 'express';
import { archiveStudent, permanentlyDeleteStudent, getStudentDetails, getStudents, createStudent, updateStudent, deleteStudent } from '../controllers/studentController.js';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All student routes are protected for authenticated users
router.use(protect);

router.get('/', getStudents);
router.post('/:id/archive',modOrAbove,archiveStudent);
router.delete('/:id/permanent',modOrAbove,permanentlyDeleteStudent);
router.get('/:id', getStudentDetails);
router.post('/', createStudent);
router.put('/:id', updateStudent);
router.delete('/:id', modOrAbove, deleteStudent);

export default router;
