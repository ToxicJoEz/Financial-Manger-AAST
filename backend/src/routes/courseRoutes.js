import { getRemovedEnrollments, adjustRemovedEnrollment } from '../controllers/removedEnrollmentController.js';
import {
  deletionPreview,
  permanentlyDelete,
  bulkCycleDeletionPreview,
  bulkDeleteCycles
} from '../controllers/permanentDeletionController.js';
import { getPayments, recordPayment, reversePayment } from '../controllers/paymentController.js';
import { updateBookStatus } from '../controllers/bookController.js';
import express from 'express';
import {
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  assignInstructor,
  replaceInstructor,
  restoreCourse,
  removeInstructor,
  markFinished,
  revertFinish,
  getCourseEnrollments,
  enrollStudent,
  updateEnrollment,
  removeEnrollment,
  bulkArchiveCourses,
  getCyclesOverview
} from '../controllers/courseController.js';
import {
  protect,
  modOrAbove,
  cycleInBranch,
  bulkCyclesInBranch,
  confirmedMoneyGuard
} from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);
router.param('id', cycleInBranch);
router.get('/:id/removed-enrollments', modOrAbove, getRemovedEnrollments);
router.post('/:id/removed-enrollments/:removalId/adjust', modOrAbove, adjustRemovedEnrollment);
router.get('/:id/deletion-preview', modOrAbove, deletionPreview('cycle'));
router.delete('/:id/permanent', modOrAbove, confirmedMoneyGuard('cycle'), permanentlyDelete('cycle'));

router.get('/bulk-deletion-preview', modOrAbove, bulkCyclesInBranch, bulkCycleDeletionPreview);
router.get('/overview', getCyclesOverview);
router.get('/', getCourses);
router.get('/:id', getCourses);
router.post('/bulk-archive', modOrAbove, bulkCyclesInBranch, bulkArchiveCourses);
router.post('/bulk-delete', modOrAbove, bulkCyclesInBranch, confirmedMoneyGuard('cycle'), bulkDeleteCycles);
router.post('/', modOrAbove, createCourse);
router.put('/:id', modOrAbove, updateCourse);
router.delete('/:id', modOrAbove, deleteCourse);
router.post('/:id/instructors', assignInstructor);
router.delete('/:id/instructors/:courseInstructorId', removeInstructor);
router.post('/:id/instructors/:courseInstructorId/replace', replaceInstructor);
router.post('/:id/restore', modOrAbove, restoreCourse);
router.post('/:id/finish', modOrAbove, markFinished);
router.post('/:id/revert', modOrAbove, revertFinish);

// Enrollment routes (accessible to all authenticated users)
router.post('/:id/enrollments/:enrollmentId/books', updateBookStatus);
router.get('/:id/enrollments', getCourseEnrollments);
router.post('/:id/enrollments', enrollStudent);
router.put('/:id/enrollments/:enrollmentId', updateEnrollment);
router.delete('/:id/enrollments/:enrollmentId', modOrAbove, removeEnrollment);

router.get('/:id/enrollments/:enrollmentId/payments', getPayments);
router.post('/:id/enrollments/:enrollmentId/payments', modOrAbove, recordPayment);
router.post('/:id/enrollments/:enrollmentId/payments/:paymentId/reverse', modOrAbove, reversePayment);

export default router;
