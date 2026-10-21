const fail = message => {
  throw Object.assign(new Error(message), {
    status: 400
  });
};
export function profileFields(body) {
  const result = {};
  for (const key of ['englishName', 'nationality', 'placeOfBirth']) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && (typeof body[key] !== 'string' || body[key].length > 200)) fail(`${key} must be text of up to 200 characters.`);
    result[key] = body[key]?.trim() || null;
  }
  if (body.dateOfBirth !== undefined) {
    const value = body.dateOfBirth;
    if (!value) result.dateOfBirth = null;else {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || value > new Date().toISOString().slice(0, 10) || value < '1900-01-01') fail('Enter a valid date of birth, not in the future.');
      result.dateOfBirth = new Date(value + 'T00:00:00Z');
    }
  }
  return result;
}
export function paymentFields(body) {
  const paymentMethod = body.paymentMethod ?? 'UNSPECIFIED';
  if (!['CASH', 'ONLINE', 'CARD', 'UNSPECIFIED'].includes(paymentMethod)) fail('Choose a valid payment method.');
  if (body.receiptNumber != null && (typeof body.receiptNumber !== 'string' || body.receiptNumber.length > 100)) fail('رقم الحافظة must be text of up to 100 characters.');
  return {
    paymentMethod,
    receiptNumber: body.receiptNumber?.trim() || null
  };
}
