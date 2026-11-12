import {
  previewPrivateImport,
  reviewPrivateImport,
  commitPrivateImport
} from '../controllers/privateImportController.js';
import express from 'express';
import { protect, modOrAbove, managersOnly } from '../middlewares/authMiddleware.js';
import { previewImport, commitImport } from '../controllers/importController.js';
const router = express.Router();
router.use(protect, modOrAbove);
// Private workbooks go into the Private section (missing umbrellas are created). They set an employee hourly rate per cycle: admins and the main mod only.
router.post(
  '/private/preview',
  managersOnly('import private courses'),
  express.raw({ type: 'application/octet-stream', limit: '2mb' }),
  previewPrivateImport
);
router.post('/private/review', managersOnly('import private courses'), reviewPrivateImport);
router.post('/private/commit', managersOnly('import private courses'), commitPrivateImport);
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
