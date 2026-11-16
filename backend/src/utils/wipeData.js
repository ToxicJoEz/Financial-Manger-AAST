import { Prisma } from '../db/prisma.js';

// Wipes the whole workspace except user accounts (and the branch list, which is configuration): umbrellas,
// cycles, students, money, payroll, employees, checks, notifications, requests and the activity log. The log is
// left with one entry recording the wipe. Irreversible: take a backup first.
export const KEPT_TABLES = ['User', 'Branch'];
export const wipedTables = () =>
  Prisma.dmmf.datamodel.models
    .map(m => m.dbName || m.name)
    .filter(table => !KEPT_TABLES.includes(table))
    .sort();

export const wipeSql = actor => [
  // The activity log is protected against deletion; that is lifted only inside this transaction.
  'ALTER TABLE "SystemLog" DISABLE TRIGGER USER',
  // No CASCADE: if a table that points at these were missing from the list, the wipe fails instead of spreading.
  `TRUNCATE ${wipedTables()
    .map(t => `"${t}"`)
    .join(', ')}`,
  'ALTER TABLE "SystemLog" ENABLE TRIGGER USER',
  `INSERT INTO "SystemLog" ("id", "action", "description", "actorUsername", "category", "outcome", "createdAt")
   VALUES (gen_random_uuid()::text, 'WIPE_ALL_BUT_ACCOUNTS',
     'Deleted all data except user accounts and branches: umbrellas, cycles, students, payments, payroll, employees, checks, notifications, requests and the activity log.',
     '${String(actor || 'system').replace(/'/g, "''")}', 'system', 'SUCCESS', CURRENT_TIMESTAMP)`
];

export async function wipeAllButAccounts(client, actor) {
  const accounts = await client.user.count();
  await client.$transaction(async tx => {
    for (const statement of wipeSql(actor)) await tx.$executeRawUnsafe(statement);
  });
  if ((await client.user.count()) !== accounts) throw new Error('User accounts changed during the wipe.');
  return { accounts, wiped: wipedTables() };
}
