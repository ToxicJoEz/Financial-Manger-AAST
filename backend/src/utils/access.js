// Who can do what with money. Admins and the main mod (a mod with no branch; Miami) handle payroll and
// check branch money. Branch mods (one or more per other branch) are mods limited to their own branch's
// cycles, without any payroll; the money recorded for their branch is checked by the main mod.
// Keep in sync with frontend/src/utils/access.js.
import { EMPLOYEE_BRANCHES } from './employees.js';

// Miami is the main mod's branch; every other branch can have branch mods and has its money checked.
export const MAIN_BRANCH = 'MIAMI';
export const CHECKED_BRANCHES = EMPLOYEE_BRANCHES.filter(branch => branch !== MAIN_BRANCH);
export const MOD_BRANCH_SCOPES = CHECKED_BRANCHES;

export const isManager = user => ['admin', 'mod'].includes(user?.role);
export const canSeePayroll = user => user?.role === 'admin' || (user?.role === 'mod' && !user.branchScope);
export const canCheckBranchMoney = canSeePayroll;
// The branch a user is limited to, or null when they see every branch.
export const branchScopeOf = user => (user?.role === 'mod' && user.branchScope ? user.branchScope : null);
// Prisma filter for cycles the user may see (spread into a Cycle where clause).
export const cycleBranchWhere = user => (branchScopeOf(user) ? { branch: branchScopeOf(user) } : {});
