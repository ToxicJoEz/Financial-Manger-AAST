import express from 'express';
import {
  getNotifications,
  getNotificationHistory,
  markAsRead,
  markAllAsRead
} from '../controllers/notificationController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Everyone sees their own notifications; branch mods learn whether their cycles and requests were approved.
router.use(protect);

router.get('/', getNotifications);
router.get('/history', getNotificationHistory);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);

export default router;
