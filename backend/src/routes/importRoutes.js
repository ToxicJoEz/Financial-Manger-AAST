import {
  previewPrivateImport,
  reviewPrivateImport,
  commitPrivateImport
} from '../controllers/privateImportController.js';
import express from 'express';
import { protect, modOrAbove, payrollManager } from '../middlewares/authMiddleware.js';
import { previewImport, commitImport } from '../controllers/importController.js';
const router = express.Router();
router.use(protect, modOrAbove);
// Private workbooks set an employee hourly rate per cycle: admins and the main mod only.
router.post(
  '/:parentId/private/preview',
  payrollManager,
  express.raw({ type: 'application/octet-stream', limit: '2mb' }),
  previewPrivateImport
);
router.post('/:parentId/private/review', payrollManager, reviewPrivateImport);
router.post('/:parentId/private/commit', payrollManager, commitPrivateImport);
router.post(
  '/:parentId/preview',
  express.raw({
    type: 'application/octet-stream',
    limit: '2mb'
  }),
  previewImport
);
router.post('/:parentId/commit', commitImport);
export default router;
