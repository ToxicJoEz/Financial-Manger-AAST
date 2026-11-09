// Who can do what with money. Keep in sync with backend/src/utils/access.js.
// Admins and the main mod (a mod with no branch) handle payroll and check branch money.
// Branch mods (e.g. the Fouad mod) are mods without payroll; their branch's money is checked by the main mod.
export const CHECKED_BRANCHES = ['FOUAD'];
export const MOD_BRANCH_SCOPES = CHECKED_BRANCHES;

const branchName = branch => branch.charAt(0) + branch.slice(1).toLowerCase().replace(/-(.)/g, (_, c) => ' ' + c.toUpperCase());
export const isManager = user => ['admin', 'mod'].includes(user?.role);
export const canSeePayroll = user => user?.role === 'admin' || (user?.role === 'mod' && !user.branchScope);
export const canCheckBranchMoney = canSeePayroll;
export const modTitle = user => (user?.branchScope ? `${branchName(user.branchScope)} mod` : 'Main mod (Miami)');
export const MOD_TITLE_OPTIONS = [{ value: 'MAIN', label: 'Main mod (Miami)' }, ...MOD_BRANCH_SCOPES.map(b => ({ value: b, label: `${branchName(b)} mod` }))];
