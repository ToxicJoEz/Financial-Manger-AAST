import { BRANCH_INFO } from '../Constants';
// One colour per branch. Deep enough to carry white text on a filled button.
const colors = {
  MIAMI: '#2563eb', // blue
  FOUAD: '#7c3aed', // purple
  'PORT-SAID': '#c2620a', // amber
  ASWAN: '#dc2626', // red
  SMART: '#0e7f99', // teal
  ONLINE: '#05875f', // green
  DOKKI: '#be185d' // pink
};
// The colour admins chose for the branch (from the server), else the original colour, else grey.
export const getBranchColor = branchName => {
  const code = String(branchName || '').toUpperCase();
  return BRANCH_INFO.get(code)?.color || colors[code] || '#6b7280';
};
