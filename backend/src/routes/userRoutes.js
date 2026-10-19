import express from 'express';
import { getUsers, updateUserStatus, updateUserRole, updateProfile, unlockUserAccount } from '../controllers/userController.js';
import { protect, modOrAbove, adminOnly } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Personal profile settings (Any logged in user)
router.put('/profile', protect, updateProfile);

// Admin/Mod User Management routes
router.get('/', protect, modOrAbove, getUsers);
router.put('/:id/status', protect, modOrAbove, updateUserStatus);
router.put('/:id/role', protect, adminOnly, updateUserRole);
router.post('/:id/unlock', protect, modOrAbove, unlockUserAccount);

export default router;
