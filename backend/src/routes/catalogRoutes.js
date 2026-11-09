import { deletionPreview, permanentlyDelete } from '../controllers/permanentDeletionController.js';
import express from 'express';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';
import {
  listCourses,
  getCourse,
  createCourse,
  editCourse,
  archiveCourse,
  restoreCourse
} from '../controllers/catalogController.js';
import { listSubCourses, createSubCourse } from '../controllers/subCourseController.js';
const router = express.Router();
router.use(protect);
router.get('/:id/deletion-preview', modOrAbove, deletionPreview('course'));
router.delete('/:id/permanent', modOrAbove, permanentlyDelete('course'));
router.get('/:id/sub-courses', listSubCourses);
router.post('/:id/sub-courses', modOrAbove, createSubCourse);
router.get('/', listCourses);
router.get('/:id', getCourse);
router.post('/', modOrAbove, createCourse);
router.put('/:id', modOrAbove, editCourse);
router.delete('/:id', modOrAbove, archiveCourse);
router.post('/:id/restore', modOrAbove, restoreCourse);
export default router;
