import express from 'express';
import {
  getUsers,
  updateUserStatus,
  updateUserRole,
  updateProfile,
  unlockUserAccount,
  updateUserPermissions,
  updateUserBranchScope,
  updateUserBranches,
  deleteUserPermanently,
  getDirectory,
  updateUserName
} from '../controllers/userController.js';
import { protect, modOrAbove, adminOnly, mainManager } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Personal profile settings (Any logged in user)
router.put('/profile', protect, updateProfile);
// Full names for display, for everyone signed in.
router.get('/directory', protect, getDirectory);

// Admin/Mod User Management routes
router.get('/', protect, modOrAbove, getUsers);
router.put('/:id/status', protect, modOrAbove, updateUserStatus);
router.put('/:id/role', protect, mainManager, updateUserRole);
router.put('/:id/name', protect, mainManager, updateUserName);
router.put('/:id/permissions', protect, modOrAbove, updateUserPermissions);
router.put('/:id/branch-scope', protect, mainManager, updateUserBranchScope);
router.put('/:id/branches', protect, mainManager, updateUserBranches);
router.post('/:id/unlock', protect, modOrAbove, unlockUserAccount);
// Permanent deletion: admins only, not even the main mod.
router.delete('/:id', protect, adminOnly, deleteUserPermanently);

export default router;
