import { EMPLOYEE_BRANCHES } from '../utils/employees.js';
import prisma, { atomic } from '../db/prisma.js';
import bcrypt from 'bcryptjs';
import { logAction } from '../utils/logger.js';
import { MOD_BRANCH_SCOPES } from '../utils/access.js';
import { isAccountLocked, unlockUser } from '../utils/loginRateLimiter.js';

// Helper to strictly enforce hierarchical modification rules
// Who can manage whom: admins manage everyone; the main mod manages users and branch mods (never admins
// or other main mods); branch mods manage users only.
const isBranchMod = user => user?.role === 'mod' && Boolean(user.branchScope);
const isMainMod = user => user?.role === 'mod' && !user.branchScope;
const enforceHierarchy = (reqUser, targetUser) => {
  if (reqUser.role === 'admin') return true;
  if (isMainMod(reqUser)) return targetUser.role === 'user' || isBranchMod(targetUser);
  if (isBranchMod(reqUser)) return targetUser.role === 'user';
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
        canManageBooks: true,
        branchScope: true,
        branches: true,
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
    // Accounts are banned or unbanned; deactivating is no longer used.
    if (isActive === false) {
      res.status(400);
      throw new Error('Accounts are no longer deactivated. Ban the account instead.');
    }
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
        canManageBooks: true,
        branchScope: true,
        branches: true,
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

    // Admins change any role. The main mod only moves people between user and branch mod (a branch is required
    // when making someone a mod), never to or from admin or main mod.
    const branchScope = req.body.branchScope ?? null;
    if (isMainMod(req.user)) {
      if (
        !enforceHierarchy(req.user, targetUser) ||
        !['user', 'mod'].includes(role) ||
        (role === 'mod' && !branchScope)
      ) {
        res.status(403);
        throw new Error('The main mod can only switch people between user and branch mod.');
      }
      if (role === 'mod' && !MOD_BRANCH_SCOPES.includes(branchScope)) {
        res.status(400);
        throw new Error('Choose a valid branch for the branch mod.');
      }
    } else if (req.user.role !== 'admin') {
      res.status(403);
      throw new Error('Forbidden: Only Admins can change user roles.');
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      // Only mods carry a branch title; changing role clears it.
      data: {
        role,
        ...(role !== 'mod' ? { branchScope: null } : isMainMod(req.user) ? { branchScope } : {}),
        ...(role !== 'user' ? { branches: null } : {})
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
        canManageBooks: true,
        branchScope: true,
        branches: true,
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
      newPassword ? 'PASSWORD_CHANGED' : 'PROFILE_UPDATED',
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

// @desc    Update user permissions (e.g. canManageBooks)
export const updateUserPermissions = atomic(async (req, res, next) => {
  try {
    const { canManageBooks } = req.body;
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!enforceHierarchy(req.user, targetUser)) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to modify this user.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        canManageBooks: canManageBooks !== undefined ? Boolean(canManageBooks) : targetUser.canManageBooks
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
        canManageBooks: true,
        branchScope: true,
        branches: true,
        avatar: true,
        lastLogin: true,
        createdAt: true
      }
    });

    await logAction(
      'USER_PERMISSIONS_UPDATED',
      'Permissions updated for @' + targetUser.username + ': canManageBooks=' + Boolean(updatedUser.canManageBooks),
      req.user.username,
      targetUser.username
    );

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    next(error);
  }
});

// @desc    Set the branches a user (role "user") can see; none means nothing until assigned.
//          Admins and the main mod only.
export const updateUserBranches = atomic(async (req, res, next) => {
  try {
    const list = req.body.branches;
    if (!Array.isArray(list) || list.some(b => typeof b !== 'string' || !EMPLOYEE_BRANCHES.includes(b.toUpperCase())))
      return res.status(400).json({ error: 'Choose valid branches.' });
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.role !== 'user') return res.status(400).json({ error: 'Only users have a list of branches.' });
    const chosen = list.map(b => b.toUpperCase());
    const branches = EMPLOYEE_BRANCHES.filter(b => chosen.includes(b)).join(',') || null;
    const updatedUser = await prisma.user.update({
      where: { id: targetUser.id },
      data: { branches },
      select: { id: true, username: true, role: true, branches: true }
    });
    await logAction(
      'USER_BRANCHES_UPDATED',
      `Branches for @${targetUser.username}: ${targetUser.branches || 'none'} -> ${branches || 'none'}`,
      req.user.username,
      targetUser.username
    );
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    next(error);
  }
});

// @desc    Set a mod's title: main mod (all branches, payroll) or a branch mod (e.g. Fouad). Admin only.
export const updateUserBranchScope = atomic(async (req, res, next) => {
  try {
    const { branchScope } = req.body;
    if (branchScope !== null && !MOD_BRANCH_SCOPES.includes(branchScope))
      return res.status(400).json({ error: `Choose main mod or one of: ${MOD_BRANCH_SCOPES.join(', ')}.` });
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.role !== 'mod') return res.status(400).json({ error: 'Only mods can have a branch title.' });
    // The main mod picks a branch mod's branch, but cannot make or change a main mod.
    if (req.user.role !== 'admin' && (!enforceHierarchy(req.user, targetUser) || branchScope === null))
      return res.status(403).json({ error: 'Only admins can make or change a main mod.' });
    const updatedUser = await prisma.user.update({
      where: { id: targetUser.id },
      data: { branchScope },
      select: { id: true, username: true, role: true, branchScope: true }
    });
    await logAction(
      'USER_BRANCH_SCOPE_UPDATED',
      `Mod title for @${targetUser.username}: ${targetUser.branchScope || 'main'} -> ${branchScope || 'main'}`,
      req.user.username,
      targetUser.username
    );
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    next(error);
  }
});
