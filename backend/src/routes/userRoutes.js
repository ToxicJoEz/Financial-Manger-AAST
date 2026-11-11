import express from 'express';
import {
  getUsers,
  updateUserStatus,
  updateUserRole,
  updateProfile,
  unlockUserAccount,
  updateUserPermissions,
  updateUserBranchScope,
  updateUserBranches
} from '../controllers/userController.js';
import { protect, modOrAbove, adminOnly, mainManager } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Personal profile settings (Any logged in user)
router.put('/profile', protect, updateProfile);

// Admin/Mod User Management routes
router.get('/', protect, modOrAbove, getUsers);
router.put('/:id/status', protect, modOrAbove, updateUserStatus);
router.put('/:id/role', protect, mainManager, updateUserRole);
router.put('/:id/permissions', protect, modOrAbove, updateUserPermissions);
router.put('/:id/branch-scope', protect, mainManager, updateUserBranchScope);
router.put('/:id/branches', protect, mainManager, updateUserBranches);
router.post('/:id/unlock', protect, modOrAbove, unlockUserAccount);

export default router;
