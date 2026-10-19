export function numberValue(value, label = 'Value', { signed = false, positive = false } = {}) {
  if (!['string', 'number'].includes(typeof value) || (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))) {
    throw Object.assign(new Error(`${label} must be a valid number.`), { status: 400 });
  }
  const result = Number(value);
  if (!Number.isFinite(result) || (!signed && result < 0) || (positive && result <= 0)) {
    throw Object.assign(new Error(`${label} must be a finite ${positive ? 'positive' : signed ? '' : 'non-negative'} number.`), { status: 400 });
  }
  return result;
}
export function moneyMinor(value, label = 'Amount', options) {
  const amount = numberValue(value, label, options);
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(amount * 100 - minor) > 0.00001) throw Object.assign(new Error(`${label} must have at most two decimal places and fit the supported range.`), { status: 400 });
  return BigInt(minor);
}
