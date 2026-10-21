import {previewEmployees,commitEmployees} from '../controllers/employeeImportController.js';
import express from 'express';
import { getEmployeeDirectory, getEmployeeDetails, getInstructors, createInstructor, updateInstructor, deleteInstructor } from '../controllers/instructorController.js';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getInstructors);
router.get('/directory',modOrAbove,getEmployeeDirectory);
router.get('/:id/details',modOrAbove,getEmployeeDetails);
router.post('/import/preview', modOrAbove, express.raw({type:'application/octet-stream',limit:'2mb'}), previewEmployees);
router.post('/import/commit', modOrAbove, commitEmployees);
router.post('/', modOrAbove, createInstructor);
router.put('/:id', modOrAbove, updateInstructor);
router.delete('/:id', modOrAbove, deleteInstructor);

export default router;
