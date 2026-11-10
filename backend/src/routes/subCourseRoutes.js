import express from 'express';
import { protect, mainManager } from '../middlewares/authMiddleware.js';
import { deletionPreview, permanentlyDelete } from '../controllers/permanentDeletionController.js';
import {
  getSubCourse,
  updateSubCourse,
  archiveSubCourse,
  restoreSubCourse
} from '../controllers/subCourseController.js';

// Sub-umbrellas of private courses. Creating and listing them lives under /api/courses/:id/sub-courses.
const router = express.Router();
router.use(protect);
router.get('/:id/deletion-preview', mainManager, deletionPreview('subCourse'));
router.delete('/:id/permanent', mainManager, permanentlyDelete('subCourse'));
router.get('/:subId', getSubCourse);
router.put('/:subId', mainManager, updateSubCourse);
router.delete('/:subId', mainManager, archiveSubCourse);
router.post('/:subId/restore', mainManager, restoreSubCourse);
export default router;
