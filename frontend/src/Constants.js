// The academy's branches: the single frontend list. Must match backend/src/utils/employees.js.
export const BRANCHES = ['MIAMI', 'FOUAD', 'PORT-SAID', 'ASWAN', 'SMART', 'ONLINE'];
export const BRANCH_OPTIONS = BRANCHES.map(b => ({ label: b, value: b }));
// Maximum students in one private cycle. Keep in sync with backend/src/utils/privateSeat.js.
export const PRIVATE_SEAT_LIMIT = 3;
