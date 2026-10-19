export const getBranchColor = (branchName) => {
  const colors = {
    'MIAMI': '#3b82f6', // blue
    'FOUAD': '#8b5cf6', // purple
    'ABU-QEER': '#10b981', // emerald
    'PORT-SAID': '#f59e0b', // amber
    'ASWAN': '#ef4444', // red
    'SMART': '#06b6d4', // cyan
    'SHERATON': '#ec4899', // pink
  };
  return colors[branchName.toUpperCase()] || '#6b7280'; // default gray
};
