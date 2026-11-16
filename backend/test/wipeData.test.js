import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wipeSql, wipedTables } from '../src/utils/wipeData.js';

test('The production wipe keeps only user accounts and branches, and matches wipeAllButAccounts()', () => {
  const tables = wipedTables();
  assert(!tables.includes('User') && !tables.includes('Branch'));
  assert(tables.includes('SystemLog') && tables.includes('Cycle') && tables.includes('Student'));
  const migration = readFileSync(
    new URL('../prisma/migrations/20261123000000_wipe_all_but_accounts/migration.sql', import.meta.url),
    'utf8'
  );
  // The one-time production wipe empties the same tables the function does (today's schema), never User or Branch.
  const truncated = migration
    .match(/TRUNCATE ([^;]+);/)[1]
    .split(',')
    .map(t => t.trim().replace(/"/g, ''));
  assert(!truncated.includes('User') && !truncated.includes('Branch'));
  assert(truncated.every(t => tables.includes(t)));
  assert(migration.includes(wipeSql('system')[0]) && migration.includes('ENABLE TRIGGER USER'));
});
