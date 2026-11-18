// Phone numbers typed in by hand: digits (with spaces, dashes or a leading +), at most 14 digits.
export const PHONE_MAX_DIGITS = 14;
export function cleanPhone(value) {
  let digits = 0;
  return String(value || '')
    .replace(/[^\d+\s-]/g, '')
    .split('')
    .filter((c, i) => (/\d/.test(c) ? ++digits <= PHONE_MAX_DIGITS : c !== '+' || i === 0))
    .join('');
}
// A person's full name ("Youssef Wael"); the username only when no name was given.
export const fullName = user => [user?.firstName, user?.lastName].map(v => String(v || '').trim()).filter(Boolean).join(' ') || user?.username || '';
