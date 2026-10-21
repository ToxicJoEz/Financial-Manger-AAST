import express from 'express';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';
import { previewImport, commitImport } from '../controllers/importController.js';
const router = express.Router();
router.use(protect, modOrAbove);
router.post('/:parentId/preview', express.raw({
  type: 'application/octet-stream',
  limit: '2mb'
}), previewImport);
router.post('/:parentId/commit', commitImport);
export default router;
