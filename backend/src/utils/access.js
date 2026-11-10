// Who can do what with money. Admins and the main mod (a mod with no branch) handle payroll and check
// branch money. Branch mods (one or more per branch, Miami included) are mods limited to their own branch's
// cycles, without any payroll; the money recorded for their branch is checked by the main mod.
// Keep in sync with frontend/src/utils/access.js.
import { EMPLOYEE_BRANCHES } from './employees.js';

// Every branch, Miami included, can have branch mods and has its money checked by the main mod.
export const CHECKED_BRANCHES = [...EMPLOYEE_BRANCHES];
export const MOD_BRANCH_SCOPES = CHECKED_BRANCHES;

export const isManager = user => ['admin', 'mod'].includes(user?.role);
export const canSeePayroll = user => user?.role === 'admin' || (user?.role === 'mod' && !user.branchScope);
export const canCheckBranchMoney = canSeePayroll;
// The branch a user is limited to, or null when they see every branch.
export const branchScopeOf = user => (user?.role === 'mod' && user.branchScope ? user.branchScope : null);
// Branches someone may see: null for everything (admins, the main mod), one for a branch mod,
// and the assigned list for a user (an empty list until branches are assigned).
export const parseBranches = value =>
  String(value || '')
    .split(',')
    .map(b => b.trim().toUpperCase())
    .filter(b => EMPLOYEE_BRANCHES.includes(b));
export const visibleBranchesOf = user =>
  user?.role === 'user' ? parseBranches(user.branches) : branchScopeOf(user) ? [branchScopeOf(user)] : null;
export const canSeeBranch = (user, branch) => {
  const list = visibleBranchesOf(user);
  return !list || list.includes(branch);
};
// Prisma filter for cycles the person may see (spread into a Cycle where clause).
export const cycleBranchWhere = user => {
  const list = visibleBranchesOf(user);
  return list ? { branch: { in: list } } : {};
};
