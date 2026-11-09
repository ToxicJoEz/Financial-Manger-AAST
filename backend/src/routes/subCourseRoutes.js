import express from 'express';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';
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
router.get('/:id/deletion-preview', modOrAbove, deletionPreview('subCourse'));
router.delete('/:id/permanent', modOrAbove, permanentlyDelete('subCourse'));
router.get('/:subId', getSubCourse);
router.put('/:subId', modOrAbove, updateSubCourse);
router.delete('/:subId', modOrAbove, archiveSubCourse);
router.post('/:subId/restore', modOrAbove, restoreSubCourse);
export default router;
