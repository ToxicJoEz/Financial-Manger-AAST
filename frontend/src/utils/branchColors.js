export const getBranchColor = (branchName) => {
  const colors = {
    'MIAMI': '#3b82f6', // blue
    'FOUAD': '#8b5cf6', // purple
    'PORT-SAID': '#f59e0b', // amber
    'ASWAN': '#ef4444', // red
    'SMART': '#06b6d4', // cyan
    'ONLINE': '#10b981', // emerald
  };
  return colors[String(branchName || '').toUpperCase()] || '#6b7280'; // default gray
};
