import { previewEmployees, commitEmployees } from '../controllers/employeeImportController.js';
import express from 'express';
import {
  archiveEmployee,
  getEmployeeDirectory,
  getEmployeeDetails,
  getInstructors,
  createInstructor,
  updateInstructor,
  deleteInstructor,
  bulkArchiveInstructors,
  bulkDeleteInstructors,
  bulkEmployeeDeletionPreview
} from '../controllers/instructorController.js';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/bulk-deletion-preview', modOrAbove, bulkEmployeeDeletionPreview);
router.get('/', getInstructors);
router.post('/bulk-archive', modOrAbove, bulkArchiveInstructors);
router.post('/bulk-delete', modOrAbove, bulkDeleteInstructors);
router.get('/directory', modOrAbove, getEmployeeDirectory);
router.get('/:id/details', modOrAbove, getEmployeeDetails);
router.post(
  '/import/preview',
  modOrAbove,
  express.raw({ type: 'application/octet-stream', limit: '2mb' }),
  previewEmployees
);
router.post('/import/commit', modOrAbove, commitEmployees);
router.post('/', modOrAbove, createInstructor);
router.post('/:id/archive', modOrAbove, archiveEmployee);
router.put('/:id', modOrAbove, updateInstructor);
router.delete('/:id', modOrAbove, deleteInstructor);

export default router;
