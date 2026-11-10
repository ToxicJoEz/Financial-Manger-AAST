// Who can do what with money. Keep in sync with backend/src/utils/access.js.
// Admins and the main mod (a mod with no branch) handle payroll and check branch money.
// Branch mods are mods limited to their own branch's cycles, without payroll; the main mod checks their money.
import { BRANCHES } from '../Constants';

// Every branch, Miami included, has branch mods and money checked by the main mod.
export const CHECKED_BRANCHES = [...BRANCHES];
export const MOD_BRANCH_SCOPES = CHECKED_BRANCHES;

export const branchName = branch => branch.charAt(0) + branch.slice(1).toLowerCase().replace(/-(.)/g, (_, c) => ' ' + c.toUpperCase());
export const isManager = user => ['admin', 'mod'].includes(user?.role);
export const canSeePayroll = user => user?.role === 'admin' || (user?.role === 'mod' && !user.branchScope);
export const canCheckBranchMoney = canSeePayroll;
export const branchScopeOf = user => (user?.role === 'mod' && user.branchScope ? user.branchScope : null);
export const modTitle = user => (user?.branchScope ? `${branchName(user.branchScope)} mod` : 'Main mod');
export const MOD_TITLE_OPTIONS = [{ value: 'MAIN', label: 'Main mod' }, ...MOD_BRANCH_SCOPES.map(b => ({ value: b, label: `${branchName(b)} mod` }))];
