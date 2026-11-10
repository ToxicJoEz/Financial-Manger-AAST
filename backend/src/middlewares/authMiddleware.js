import { auditActor } from '../utils/auditContext.js';
import jwt from 'jsonwebtoken';
import { canSeePayroll, branchScopeOf } from '../utils/access.js';
import prisma from '../db/prisma.js';
import { assertMoneyUnlocked } from '../utils/moneyLock.js';

export const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      if (!process.env.JWT_SECRET) {
        throw new Error('FATAL: JWT_SECRET environment variable is not defined.');
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          username: true,
          role: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          isBanned: true,
          canManageBooks: true,
          branchScope: true
        }
      });

      if (!user) {
        res.status(401);
        throw new Error('User no longer exists');
      }

      auditActor(user, decoded.authMethod);
      if (user.isBanned || !user.isActive) {
        res.status(403);
        throw new Error('Account disabled or banned');
      }

      req.user = user;
      next();
    } catch (error) {
      res.status(401);
      next(new Error('Not authorized, token failed or expired'));
    }
  } else {
    res.status(401);
    next(new Error('Not authorized, no token provided'));
  }
};

export const modOrAbove = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'mod')) {
    next();
  } else {
    res.status(403);
    next(new Error('Not authorized. This action requires Mod or Admin privileges.'));
  }
};

// Payroll (salaries, rates, payment batches) is for admins and the main mod only, never branch mods.
export const payrollManager = (req, res, next) => {
  if (canSeePayroll(req.user)) next();
  else {
    res.status(403);
    next(new Error('Payroll is handled by admins and the main mod.'));
  }
};

// Branch mods only reach cycles in their own branch: any route with a cycle :id checks it first.
export const cycleInBranch = async (req, res, next, id) => {
  try {
    const scope = branchScopeOf(req.user);
    if (!scope) return next();
    const cycle = await prisma.cycle.findUnique({ where: { id: String(id) }, select: { branch: true } });
    if (cycle && cycle.branch !== scope) return res.status(404).json({ error: 'Cycle not found.' });
    next();
  } catch (error) {
    next(error);
  }
};
// For bulk actions: every selected cycle must be in the branch mod's branch.
export const cyclesInBranch = async (user, ids) => {
  const scope = branchScopeOf(user);
  if (!scope || !Array.isArray(ids) || !ids.length) return;
  const outside = await prisma.cycle.count({ where: { id: { in: ids.map(String) }, branch: { not: scope } } });
  if (outside) throw Object.assign(new Error('Some selected cycles are outside your branch.'), { status: 403 });
};
export const bulkCyclesInBranch = async (req, res, next) => {
  try {
    await cyclesInBranch(
      req.user,
      req.body?.ids ?? (typeof req.query.ids === 'string' ? req.query.ids.split(',') : [])
    );
    next();
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

// Branch mods cannot remove or archive students who also study in another branch.
export const studentsInBranch = async (req, res, next) => {
  try {
    const scope = branchScopeOf(req.user);
    if (!scope) return next();
    const ids = req.params.id ? [req.params.id] : Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) return next();
    const outside = await prisma.enrollment.count({
      where: { studentId: { in: ids }, course: { branch: { not: scope } } }
    });
    if (outside)
      return res
        .status(403)
        .json({ error: 'This student also studies in another branch. Ask the main mod to remove or archive them.' });
    next();
  } catch (error) {
    next(error);
  }
};

// Deleting cycles or students would remove money the main mod already confirmed: branch mods are stopped.
export const confirmedMoneyGuard = kind => async (req, res, next) => {
  try {
    const ids = req.params.id ? [req.params.id] : Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    await assertMoneyUnlocked(req.user, kind === 'cycle' ? { cycleIds: ids } : { studentIds: ids });
    next();
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
};

export const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403);
    next(new Error('Not authorized. This action requires Admin privileges.'));
  }
};
