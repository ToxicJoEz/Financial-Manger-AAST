// Arabic report title for a month (YYYY-MM), a year (YYYY) or a range of months (YYYY-MM:YYYY-MM).
const arabicMonth = month =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' });
export function salaryReportTitle(month) {
  if (/^\d{4}$/.test(month)) return `تقرير المدفوعات لعام ${month}`;
  if (month.includes(':')) return `تقرير المدفوعات من ${arabicMonth(month.slice(0, 7))} إلى ${arabicMonth(month.slice(8))}`;
  return `تقرير المدفوعات لشهر ${arabicMonth(month)}`;
}
