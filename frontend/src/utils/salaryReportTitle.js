export function salaryReportTitle(month){
 const label=new Date(`${month}-01T12:00:00Z`).toLocaleDateString('ar-EG',{month:'long',year:'numeric',timeZone:'UTC',numberingSystem:'latn'});
 return `تقرير المدفوعات لشهر ${label}`;
}
