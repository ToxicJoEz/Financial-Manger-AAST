import { createHash } from 'node:crypto';
import { moneyMinor } from './numbers.js';
import { profileFields } from './studentProfile.js';
export const importError = (message, status = 400) => Object.assign(new Error(message), {
  status
});
export const normalizedName = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const digits = value => value.replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
const text = cell => {
  if (cell.value && typeof cell.value === 'object' && ('formula' in cell.value || 'sharedFormula' in cell.value)) throw importError('Formula cells are not supported in imported data. Export values only.');
  if (cell.value == null) return '';
  return String(cell.text || '').replace(/\u200e|\u200f/g, '').trim();
};
function isoDate(raw, label) {
  const value = digits(String(raw).trim());
  const match = value.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/) || value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!match) throw importError(`${label}: unrecognized date '${value}'.`);
  const parts = match[1].length === 4 ? [match[1], match[2], match[3]] : [match[3], match[2], match[1]];
  const date = parts.map((x, i) => i ? x.padStart(2, '0') : x).join('-');
  if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw importError(`${label}: invalid date.`);
  return date;
}
// Inspect ZIP central-directory sizes before decompression. Never execute workbook content.
export function checkZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) throw importError('Upload a valid .xlsx workbook.');
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50) {
    end = i;
    break;
  }
  if (end < 0) throw importError('Invalid workbook archive.');
  const entries = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (entries > 1000 || offset >= end) throw importError('Workbook archive is too complex.');
  let cursor = offset,
    total = 0;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) throw importError('Invalid workbook archive directory.');
    const size = buffer.readUInt32LE(cursor + 24);
    total += size;
    if (total > 20 * 1024 * 1024 || size > 10 * 1024 * 1024) throw importError('Workbook expands beyond the supported size.');
    cursor += 46 + buffer.readUInt16LE(cursor + 28) + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
  }
  if (cursor !== end) throw importError('Unsupported workbook archive directory.');
}
export async function parseStudentsWorkbook(buffer) {
  checkZip(buffer);
  const [{
    default: ExcelJS
  }, {
    default: unzipper
  }] = await Promise.all([import('exceljs'), import('unzipper')]);
  // Count actual inflated bytes too, so forged ZIP sizes cannot bypass limits.
  try {
    const directory = await unzipper.Open.buffer(buffer);
    let total = 0;
    for (const file of directory.files) {
      let size = 0;
      const stream = file.stream();
      try {
        for await (const chunk of stream) {
          size += chunk.length;
          total += chunk.length;
          if (size > 10 * 1024 * 1024 || total > 20 * 1024 * 1024) throw importError('Workbook expands beyond the supported size.');
        }
      } finally {
        stream.destroy();
      }
    }
  } catch (error) {
    throw importError(error.status ? error.message : 'Invalid workbook archive.');
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw importError('This workbook could not be read. Upload a valid .xlsx file.');
  }
  if (workbook.worksheets.length !== 1) throw importError('Use one student roster worksheet per file.');
  const sheet = workbook.worksheets[0];
  if (sheet.rowCount > 1200 || sheet.columnCount > 100) throw importError('Use a roster with at most 1,000 students and 100 columns.');
  const normalize = value => value.replace(/\s+/g, '').replace(/[أإآ]/g, 'ا');
  const aliases = {
    name: 'اسمالطالب',
    englishName: 'اسمالطالب-Eng.',
    registrationNumber: 'رقمالتسجيل',
    mobile: 'الموبايل',
    dateOfBirth: 'تاريخالميلاد',
    nationality: 'الجنسية',
    placeOfBirth: 'محلالميلاد',
    paymentMethod: 'السداد',
    receiptNumber: 'الحافظة',
    amount: 'القيمة',
    currency: 'العملة'
  };
  let header,
    columns = {},
    courseCode = '',
    startDate = '',
    endDate = '';
  sheet.eachRow(row => {
    row.eachCell(cell => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const value = cell.value == null ? '' : String(cell.text || '');
      if (value.includes('فترة الانعقاد')) {
        const dates = digits(value).match(/\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/g);
        if (dates?.length >= 2) {
          startDate = isoDate(dates[0], 'Start date');
          endDate = isoDate(dates[1], 'End date');
        }
        courseCode = value.match(/(?:الدورة|الدوره)\s*:\s*([A-Za-z0-9]+)/)?.[1]?.toUpperCase() || '';
      }
      for (const [key, label] of Object.entries(aliases)) if (normalize(value) === normalize(label) || key === 'receiptNumber' && normalize(value) === normalize('رقم الحافظة')) {
        columns[key] = cell.col;
        if (key === 'registrationNumber'||key === 'name') header = Math.max(header||0,row.number);
      }
    });
  });
  for (const key of ['name', 'amount']) if (!columns[key]) throw importError(`Missing required column: ${aliases[key]}.`);
  if (!startDate || !endDate || endDate < startDate) throw importError('Valid cycle dates could not be found after فترة الانعقاد.');
  const rows = [];
  for (let index = header + 1; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index),
      read = key => columns[key] ? text(row.getCell(columns[key])) : '';
    const registrationNumber = digits(read('registrationNumber'));
    if (!registrationNumber && !read('name')) continue;
    if (!read('name')) throw importError(`Excel row ${index}: student name is required.`);
    if (columns.currency && !['جنيه مصري', 'EGP'].includes(read('currency'))) throw importError(`Excel row ${index}: only EGP payments are supported.`);
    const method = read('paymentMethod');
    const amount = Number(moneyMinor(digits(read('amount')), `Excel row ${index} amount`)) / 100;
    const birthCell = columns.dateOfBirth ? row.getCell(columns.dateOfBirth) : null;
    const dateOfBirth = birthCell?.value instanceof Date ? birthCell.value.toISOString().slice(0, 10) : read('dateOfBirth') ? isoDate(read('dateOfBirth'), `Excel row ${index} date of birth`) : null;
    const student = {
      name: normalizedName(read('name')),
      registrationNumber: registrationNumber || null,
      mobile: read('mobile') || null,
      englishName: read('englishName') || null,
      dateOfBirth,
      nationality: read('nationality') || null,
      placeOfBirth: read('placeOfBirth') || null
    };
    profileFields(student);
    if (student.name.length > 200 || registrationNumber.length > 100 || (student.mobile?.length || 0) > 50) throw importError(`Excel row ${index}: a student field is too long.`);
    rows.push({
      rowKey: registrationNumber || `row:${index}`,
      row: index,
      ...student,
      amount,
      paymentMethod: method === 'م' ? 'ONLINE' : method === 'غ' ? 'CASH' : 'UNSPECIFIED',
      receiptNumber: read('receiptNumber') || null,
      methodCode: method
    });
  }
  if (!rows.length || rows.length > 1000) throw importError('Upload a roster containing between 1 and 1,000 students.');
  const canonical = {
    courseCode,
    startDate,
    endDate,
    rows: rows.map(({
      row, rowKey,
      ...data
    }) => data).sort((a, b) => (a.registrationNumber||a.name).localeCompare(b.registrationNumber||b.name))
  };
  return {
    courseCode,
    startDate,
    endDate,
    rows,
    fingerprint: createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
  };
}
