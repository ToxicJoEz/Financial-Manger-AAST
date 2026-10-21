// Calendar comparisons use the academy's timezone, independent of the server host.
export function cairoToday(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function importedCycleFinished(endDate, now = new Date()) {
  return Boolean(endDate && endDate <= cairoToday(now));
}
