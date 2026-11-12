import { deletionPreview, permanentlyDelete } from '../controllers/permanentDeletionController.js';
import express from 'express';
import { protect, mainManager } from '../middlewares/authMiddleware.js';
import {
  listCourses,
  getCourse,
  createCourse,
  editCourse,
  archiveCourse,
  restoreCourse,
  setCourseBranches,
  studentMatches
} from '../controllers/catalogController.js';
const router = express.Router();
router.use(protect);
// Umbrellas are managed by admins and the main mod; everyone else uses them.
router.get('/:id/deletion-preview', mainManager, deletionPreview('course'));
router.delete('/:id/permanent', mainManager, permanentlyDelete('course'));
router.get('/student-matches', studentMatches);
router.get('/', listCourses);
router.get('/:id', getCourse);
router.post('/', mainManager, createCourse);
router.put('/:id', mainManager, editCourse);
router.put('/:id/branches', mainManager, setCourseBranches);
router.delete('/:id', mainManager, archiveCourse);
router.post('/:id/restore', mainManager, restoreCourse);
export default router;
