import express from 'express';
import {
  archiveStudent,
  permanentlyDeleteStudent,
  getStudentDetails,
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkArchiveStudents,
  bulkDeleteStudents
} from '../controllers/studentController.js';
import { protect, modOrAbove, studentsInBranch } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All student routes are protected for authenticated users
router.use(protect);

router.get('/', getStudents);
router.post('/bulk-archive', modOrAbove, studentsInBranch, bulkArchiveStudents);
router.post('/bulk-delete', studentsInBranch, bulkDeleteStudents);
router.post('/:id/archive', modOrAbove, studentsInBranch, archiveStudent);
router.delete('/:id/permanent', modOrAbove, studentsInBranch, permanentlyDeleteStudent);
router.get('/:id', getStudentDetails);
router.post('/', createStudent);
router.put('/:id', updateStudent);
router.delete('/:id', studentsInBranch, deleteStudent);

export default router;
