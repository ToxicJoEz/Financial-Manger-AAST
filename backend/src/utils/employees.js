export const EMPLOYEE_BRANCHES = ['MIAMI','FOUAD','ABU-QEER','PORT-SAID','ASWAN','SMART','SHERATON','ALAMEEN'];
export const employeeName = value => String(value ?? '').normalize('NFC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();
export const employeeNumber = value => String(value ?? '').normalize('NFC').replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).trim().toUpperCase();
export function employeeBranches(value) {
  const list = (Array.isArray(value)?value:String(value || '').split(',')).map(b=>String(b).trim().toUpperCase()).filter(Boolean);
  if(!list.length || list.some(b=>!EMPLOYEE_BRANCHES.includes(b)))throw Object.assign(new Error('Choose at least one valid branch.'),{status:400});
  return [...new Set(list)];
}
