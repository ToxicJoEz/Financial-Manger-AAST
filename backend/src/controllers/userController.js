import prisma, { atomic } from '../db/prisma.js';
import bcrypt from 'bcryptjs';
import { logAction } from '../utils/logger.js';
import { isAccountLocked, unlockUser } from '../utils/loginRateLimiter.js';

// Helper to strictly enforce hierarchical modification rules
const enforceHierarchy = (reqUser, targetUser) => {
  if (reqUser.role === 'admin') return true; 
  if (reqUser.role === 'mod') {
    // Mods can only modify standard users
    if (targetUser.role === 'admin' || targetUser.role === 'mod') {
      return false;
    }
    return true;
  }
  return false;
};

// @desc    Get all users (Admin/Mod only)
export const getUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        isBanned: true,
        avatar: true,
        lastLogin: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const enrichedUsers = users.map(u => ({
      ...u,
      isLocked: isAccountLocked(u.username)
    }));

    res.json(enrichedUsers);
  } catch (error) {
    next(error);
  }
};

// @desc    Update user status (ban/deactivate)
export const updateUserStatus = atomic(async (req, res, next) => {
  try {
    const { isActive, isBanned } = req.body;
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });

    if (!targetUser) {
      res.status(404);
      throw new Error('User not found');
    }

    if (targetUser.username === 'main-admin') {
      res.status(400);
      throw new Error('The permanent root administrator (main-admin) cannot be deactivated or banned.');
    }

    if (!enforceHierarchy(req.user, targetUser)) {
      res.status(403);
      throw new Error('Forbidden: You do not have permission to modify this user.');
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        isActive: isActive !== undefined ? isActive : targetUser.isActive,
        isBanned: isBanned !== undefined ? isBanned : targetUser.isBanned
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        isBanned: true,
        avatar: true,
        lastLogin: true,
        createdAt: true
      }
    });

    let actionMsg = [];
    if (isActive !== undefined && isActive !== targetUser.isActive) {
      actionMsg.push(`Active: ${targetUser.isActive} -> ${isActive}`);
    }
    if (isBanned !== undefined && isBanned !== targetUser.isBanned) {
      actionMsg.push(`Banned: ${targetUser.isBanned} -> ${isBanned}`);
    }

    await logAction(
      'USER_STATUS_UPDATED',
      `Account Status changed for @${targetUser.username}: ${actionMsg.join(', ')}`,
      req.user.username,
      targetUser.username
    );

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    next(error);
  }
});

// @desc    Promote/Demote Role
export const updateUserRole = atomic(async (req, res, next) => {
  try {
    const { role } = req.body;
    const ALLOWED_ROLES = ['admin', 'mod', 'user'];

    if (!role || !ALLOWED_ROLES.includes(role)) {
      res.status(400);
      throw new Error(`Invalid role specified. Allowed roles are: ${ALLOWED_ROLES.join(', ')}`);
    }

    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });

    if (!targetUser) {
      res.status(404);
      throw new Error('User not found');
    }

    if (targetUser.username === 'main-admin') {
      res.status(400);
      throw new Error('The permanent root administrator (main-admin) role cannot be changed.');
    }

    // Strict Check: Only Admins can change roles! Mods cannot promote/demote.
    if (req.user.role !== 'admin') {
      res.status(403);
      throw new Error('Forbidden: Only Admins can change user roles.');
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        isBanned: true,
        avatar: true,
        lastLogin: true,
        createdAt: true
      }
    });

    await logAction(
      'ROLE_UPDATED',
      `Role changed for @${targetUser.username} from '${targetUser.role}' to '${role}'`,
      req.user.username,
      targetUser.username
    );

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    next(error);
  }
});

// @desc    Unlock user rate-limited account (Admin/Mod only)
export const unlockUserAccount = atomic(async (req, res, next) => {
  try {
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });

    if (!targetUser) {
      res.status(404);
      throw new Error('User not found');
    }

    if (!enforceHierarchy(req.user, targetUser)) {
      res.status(403);
      throw new Error('Forbidden: You do not have permission to manage this user.');
    }

    unlockUser(targetUser.username);

    await logAction(
      'USER_ACCOUNT_UNLOCKED',
      `Login rate limit lock removed by ${req.user.username}`,
      req.user.username,
      targetUser.username
    );

    res.json({ success: true, message: `Account for ${targetUser.username} has been unlocked.` });
  } catch (error) {
    next(error);
  }
});

// @desc    Update personal profile (Logged in user)
export const updateProfile = atomic(async (req, res, next) => {
  try {
    const { firstName, lastName, avatar, currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    let updatedData = { firstName, lastName, avatar };

    if (newPassword) {
      // If user has an existing password, they MUST provide the current password
      if (user.password) {
        if (!currentPassword) {
          res.status(400);
          throw new Error('Current password is required to set a new password');
        }
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
          res.status(400);
          throw new Error('Current password is incorrect');
        }
      }
      
      const salt = await bcrypt.genSalt(10);
      updatedData.password = await bcrypt.hash(newPassword, salt);
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updatedData
    });

    await logAction(
      'PROFILE_UPDATED',
      `User updated their personal profile${newPassword ? ' and changed password' : ''}`,
      req.user.username,
      req.user.username
    );

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        avatar: updatedUser.avatar,
        isActive: updatedUser.isActive,
        isBanned: updatedUser.isBanned
      }
    });

  } catch (error) {
    next(error);
  }
});
