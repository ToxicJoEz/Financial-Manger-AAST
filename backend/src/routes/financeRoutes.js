import { listMoneyChecks, markMoneyChecked, unmarkMoneyChecked } from '../controllers/moneyCheckController.js';
import { getIncome, getYearlyOverview } from '../controllers/incomeController.js';
import express from 'express';
import {
  returnProcessingToUnpaid,
  returnPaidToProcessing,
  getFinances,
  initiatePayment,
  completePayment,
  initiateCoursePayment,
  completeCoursePayments,
  initiateSalarySelection,
  completeRun
} from '../controllers/financeController.js';
import { protect, modOrAbove, payrollManager } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect, modOrAbove);
router.get('/income', getIncome);
router.get('/overview', getYearlyOverview);

// Branch money checks: every manager can see the status; admins and the main mod mark records.
router.get('/checks', listMoneyChecks);
router.post('/checks', payrollManager, markMoneyChecked);
router.post('/checks/uncheck', payrollManager, unmarkMoneyChecked);

// Everything below is payroll: admins and the main mod only.
router.use(payrollManager);
router.get('/', getFinances);
router.post('/return-to-unpaid', returnProcessingToUnpaid);
router.post('/return-to-processing', returnPaidToProcessing);
router.post('/batches', initiatePayment);
router.post('/selected-payments', initiateSalarySelection);
router.post('/course-payments', initiateCoursePayment);
router.post('/course-payments/pay', completeCoursePayments);
router.post('/batches/:id/pay', completePayment);
router.post('/runs/:id/pay', completeRun);

export default router;
