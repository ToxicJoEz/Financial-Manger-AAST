import { getIncome, getYearlyOverview } from '../controllers/incomeController.js';
import express from 'express';
import { getFinances, initiatePayment, completePayment, initiateCoursePayment, completeCoursePayments, initiateSalarySelection, completeDailyBatch } from '../controllers/financeController.js';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect, modOrAbove);
router.get('/income', getIncome);
router.get('/overview', getYearlyOverview);

router.get('/', getFinances);
router.post('/batches', initiatePayment);
router.post('/selected-payments', initiateSalarySelection);
router.post('/course-payments', initiateCoursePayment);
router.post('/course-payments/pay', completeCoursePayments);
router.post('/batches/:id/pay', completePayment);
router.post('/payment-days/:day/pay', completeDailyBatch);

export default router;
