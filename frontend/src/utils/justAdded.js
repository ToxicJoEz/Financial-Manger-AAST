// Cycles the main mod (or an admin) has just added, kept in memory only: the next cycles page shows them with the
// "New" look, then forgets them. A refresh or another page clears it; nothing is saved anywhere.
let pending = [];
export function markJustAdded(ids) {
  pending = [...new Set([...(ids || []).filter(Boolean), ...pending])];
}
// Read once by the next cycles page. Cleared just after, so a second read in the same render (React's development
// double render) still sees them.
export function takeJustAdded() {
  const out = pending;
  if (out.length) setTimeout(() => { pending = pending.filter(id => !out.includes(id)); }, 0);
  return out;
}
