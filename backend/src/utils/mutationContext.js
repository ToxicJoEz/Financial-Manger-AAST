import { AsyncLocalStorage } from 'node:async_hooks';

// One request owns one database transaction, including its audit records.
export const mutationContext = new AsyncLocalStorage();

const privateKeys = /password|token|secret|authorization/i;
export function auditSnapshot(value) {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(auditSnapshot);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !privateKeys.test(key)).map(([key, entry]) => [key, auditSnapshot(entry)]));
  return value;
}
