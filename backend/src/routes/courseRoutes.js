import { deletionPreview, permanentlyDelete } from '../controllers/permanentDeletionController.js';
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
  togglePaymentStatus,
  getCourseEnrollments,
  enrollStudent,
  updateEnrollment,
  removeEnrollment
} from '../controllers/courseController.js';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);
router.get('/:id/deletion-preview', modOrAbove, deletionPreview('cycle'));
router.delete('/:id/permanent', modOrAbove, permanentlyDelete('cycle'));

router.get('/', getCourses);
router.get('/:id', getCourses);
router.post('/', modOrAbove, createCourse);
router.put('/:id', modOrAbove, updateCourse);
router.put('/:id/payment', modOrAbove, togglePaymentStatus);
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
router.delete('/:id/enrollments/:enrollmentId', removeEnrollment);

router.get('/:id/enrollments/:enrollmentId/payments', getPayments);
router.post('/:id/enrollments/:enrollmentId/payments', modOrAbove, recordPayment);
router.post('/:id/enrollments/:enrollmentId/payments/:paymentId/reverse', modOrAbove, reversePayment);

export default router;
