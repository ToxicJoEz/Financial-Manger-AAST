// The academy's branches. These start as the original seven and are replaced, in place, by the branches
// admins and the main mod manage (loaded from the server by context/BranchContext.jsx).
// BRANCHES: active branch codes. BRANCH_OPTIONS: active branches for choosing.
// ALL_BRANCH_OPTIONS: also deleted branches whose data was kept (e.g. DOKKI-DELETED), for filters.
export const BRANCHES = ['MIAMI', 'FOUAD', 'PORT-SAID', 'ASWAN', 'SMART', 'ONLINE', 'DOKKI'];
export const BRANCH_OPTIONS = BRANCHES.map(b => ({ label: b, value: b }));
export const ALL_BRANCH_OPTIONS = [...BRANCH_OPTIONS];
// Every branch with its name, colour and whether it is active, by code.
export const BRANCH_INFO = new Map();
// Maximum students in one private cycle. Keep in sync with backend/src/utils/privateSeat.js.
export const PRIVATE_SEAT_LIMIT = 3;

// Replaces the lists above with the branches from the server, keeping the same arrays so every screen sees them.
export function setBranches(rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  const active = rows.filter(r => r.active);
  BRANCHES.splice(0, BRANCHES.length, ...active.map(r => r.code));
  BRANCH_OPTIONS.splice(0, BRANCH_OPTIONS.length, ...active.map(r => ({ label: r.code, value: r.code })));
  ALL_BRANCH_OPTIONS.splice(0, ALL_BRANCH_OPTIONS.length, ...rows.map(r => ({ label: r.active ? r.code : `${r.code} (deleted)`, value: r.code })));
  BRANCH_INFO.clear();
  for (const r of rows) BRANCH_INFO.set(r.code, r);
}
