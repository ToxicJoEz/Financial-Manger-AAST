// Most frequent positive payment, with higher amounts winning ties.
// This is an editable suggestion, not proof that a payment equals the full fee.
export function suggestCourseFee(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (row.amount == null || row.amount === '' || typeof row.amount === 'boolean') continue;
    const amount = Number(row.amount), minor = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(minor) || Math.abs(amount * 100 - minor) > 0.00001) continue;
    counts.set(minor, (counts.get(minor) || 0) + 1);
  }
  let best = null, frequency = 0;
  for (const [minor, count] of counts) if (count > frequency || count === frequency && minor > best) { best = minor; frequency = count; }
  return best === null ? '' : String(best / 100);
}
