import express from 'express';
import { protect, managersOnly } from '../middlewares/authMiddleware.js';
import {
  startBackup,
  backupChunk,
  finishTransfer,
  startUpload,
  uploadChunk,
  checkUpload,
  restoreUpload
} from '../controllers/backupController.js';

// Full backups and restores: admins and the main mod only. Files move in parts (see backupController).
const router = express.Router();
router.use(protect, managersOnly('back up or restore the data'));
router.post('/', startBackup);
router.get('/:id/chunks/:index', backupChunk);
router.delete('/:id', finishTransfer);
router.post('/uploads', startUpload);
router.put('/uploads/:id/chunks/:index', express.raw({ type: 'application/octet-stream', limit: '4mb' }), uploadChunk);
router.get('/uploads/:id/check', checkUpload);
router.post('/uploads/:id/restore', restoreUpload);
export default router;
