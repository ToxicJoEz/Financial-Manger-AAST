// Every amount of money is stored as whole piasters (integers), never as decimals. The rest of the app works in
// EGP: this layer turns EGP into piasters on the way into the database and back into EGP on the way out.
// (The money ledger, payroll earnings and book payments already store piasters in their *Minor columns.)
export const MONEY_FIELDS = new Set(['bookPrice', 'courseFee', 'hourlyRate', 'amountPaid', 'customFee', 'rate']);
// JSON columns are stored as they are (activity details, removal snapshots).
const JSON_FIELDS = new Set(['details', 'snapshot']);
// Operators whose operand is a factor, not an amount.
const FACTORS = new Set(['multiply', 'divide']);

const plain = value =>
  value !== null &&
  typeof value === 'object' &&
  (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);

export const toPiasters = value => {
  const piasters = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(piasters)) throw Object.assign(new Error('Enter a valid amount.'), { status: 400 });
  return piasters;
};
// An amount, or a filter / update on it ({ gt: 10 }, { in: [..] }, { increment: 5 }).
function amount(value, convert) {
  if (typeof value === 'number') return convert(value);
  if (Array.isArray(value)) return value.map(v => amount(v, convert));
  if (plain(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, FACTORS.has(key) ? v : amount(v, convert)])
    );
  return value;
}
function walk(value, convert) {
  if (!plain(value)) return value;
  if (Array.isArray(value)) return value.map(v => walk(v, convert));
  const out = {};
  for (const [key, v] of Object.entries(value))
    out[key] = JSON_FIELDS.has(key) ? v : MONEY_FIELDS.has(key) ? amount(v, convert) : walk(v, convert);
  return out;
}
export const intoStorage = args => walk(args, toPiasters);
export const fromStorage = result => walk(result, piasters => piasters / 100);

// Prisma client extension: applied to every model, so nested reads and writes are covered too.
export const moneyStorage = {
  name: 'money-in-piasters',
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        return fromStorage(await query(intoStorage(args)));
      }
    }
  }
};
