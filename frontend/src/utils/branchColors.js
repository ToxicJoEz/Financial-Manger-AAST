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
export const getBranchColor = branchName => colors[String(branchName || '').toUpperCase()] || '#6b7280'; // default gray
