// Phone numbers typed in by hand have at most 11 digits (spaces, dashes and a leading + are allowed around them).
export const PHONE_MAX_DIGITS = 11;
export function checkPhone(value, label = 'Phone number') {
  if (value == null || value === '') return;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length > PHONE_MAX_DIGITS)
    throw Object.assign(new Error(`${label} can have at most ${PHONE_MAX_DIGITS} digits.`), { status: 400 });
}

// A person's full name ("Youssef Wael"); the username only when no name was given.
export const fullName = user =>
  [user?.firstName, user?.lastName]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(' ') || user?.username || '';
// Names as typed for an account: trimmed, up to 60 characters each.
export function readNames(body) {
  const clean = v => (typeof v === 'string' ? v.trim().slice(0, 60) : undefined);
  return { firstName: clean(body?.firstName) || null, lastName: clean(body?.lastName) || null };
}
