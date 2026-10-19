import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { exportOptions, prepareExport } from '../controllers/exportController.js';
const router = express.Router();
router.use(protect);
router.get('/options', exportOptions);
router.post('/', prepareExport);
export default router;
