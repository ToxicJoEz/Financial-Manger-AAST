// Who can do what with money. Admins and the main mod (a mod with no branch) handle payroll and check
// branch money. Branch mods (e.g. the Fouad mod) are mods without any payroll access; the money recorded
// for their branch is checked by the main mod. Keep in sync with frontend/src/utils/access.js.

// Branches whose money must be checked, and the branches a mod can currently be limited to.
export const CHECKED_BRANCHES = ['FOUAD'];
export const MOD_BRANCH_SCOPES = CHECKED_BRANCHES;

export const isManager = user => ['admin', 'mod'].includes(user?.role);
export const canSeePayroll = user => user?.role === 'admin' || (user?.role === 'mod' && !user.branchScope);
export const canCheckBranchMoney = canSeePayroll;
