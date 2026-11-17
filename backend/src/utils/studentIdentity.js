import { phoneNumbers } from './privateWorkbook.js';

// Siblings often register with one parent's phone number, so a phone number alone never identifies a student.
// An existing student is the same person only when the name matches too (Arabic or English name on the profile).

// Names compared loosely only on spelling noise: spaces, letter case, Arabic diacritics and tatweel, and the usual
// Arabic letter variants (أ/إ/آ → ا, ى → ي, ة → ه).
export const nameKey = value =>
  String(value ?? '')
    .normalize('NFC')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const sameName = (student, name) =>
  Boolean(nameKey(name)) && [student.name, student.englishName].some(n => nameKey(n) === nameKey(name));

export const sharesPhone = (student, mobile) => {
  const incoming = phoneNumbers(mobile);
  return incoming.length > 0 && phoneNumbers(student.mobile).some(n => incoming.includes(n));
};

// The same student: name AND phone both match.
export const sameStudent = (student, { name, mobile }) => sameName(student, name) && sharesPhone(student, mobile);
