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
import { protect, modOrAbove, studentsInBranch, confirmedMoneyGuard } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All student routes are protected for authenticated users
router.use(protect);

router.get('/', getStudents);
router.post('/bulk-archive', modOrAbove, studentsInBranch, bulkArchiveStudents);
// Users only view students; adding, editing and removing is for admins and mods.
router.post('/bulk-delete', modOrAbove, studentsInBranch, confirmedMoneyGuard('student'), bulkDeleteStudents);
router.post('/:id/archive', modOrAbove, studentsInBranch, archiveStudent);
router.delete('/:id/permanent', modOrAbove, studentsInBranch, confirmedMoneyGuard('student'), permanentlyDeleteStudent);
router.get('/:id', getStudentDetails);
router.post('/', modOrAbove, createStudent);
router.put('/:id', modOrAbove, updateStudent);
router.delete('/:id', modOrAbove, studentsInBranch, confirmedMoneyGuard('student'), deleteStudent);

export default router;
