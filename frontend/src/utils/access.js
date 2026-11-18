// Who can do what with money. Keep in sync with backend/src/utils/access.js.
// Admins and the main mod (a mod with no branch) handle payroll and check branch money.
// Branch mods are mods limited to their own branch's cycles, without payroll; the main mod checks their money.
import { BRANCHES, BRANCH_INFO } from '../Constants';

// Every branch, Miami included, has branch mods and money checked by the main mod.
// The same live list as BRANCHES (filled from the server).
export const CHECKED_BRANCHES = BRANCHES;
export const MOD_BRANCH_SCOPES = CHECKED_BRANCHES;

// A branch's display name: the name admins gave it, or one made from its code.
export const branchName = branch => BRANCH_INFO.get(branch)?.name || String(branch || '').charAt(0) + String(branch || '').slice(1).toLowerCase().replace(/-(.)/g, (_, c) => ' ' + c.toUpperCase());
export const isManager = user => ['admin', 'mod'].includes(user?.role);
export const canSeePayroll = user => user?.role === 'admin' || (user?.role === 'mod' && !user.branchScope);
export const canCheckBranchMoney = canSeePayroll;
export const branchScopeOf = user => (user?.role === 'mod' && user.branchScope ? user.branchScope : null);
export const modTitle = user => (user?.branchScope ? `${branchName(user.branchScope)} mod` : 'Main mod');
// Rebuilt from the live branch list each time it is read.
export const modTitleOptions = () => [{ value: 'MAIN', label: 'Main mod' }, ...MOD_BRANCH_SCOPES.map(b => ({ value: b, label: `${branchName(b)} mod` }))];
// Placement tests (the Tests tab): users with the toggle, admins and the main mod.
export const canUsePlacements = user => canSeePayroll(user) || Boolean(branchScopeOf(user)) || (user?.role === 'user' && Boolean(user.canPlacementTest));
// Creating and editing tests: admins, the main mod and branch mods. Placing students stays with admins and the main mod.
export const canCreateTests = user => canSeePayroll(user) || Boolean(branchScopeOf(user));
