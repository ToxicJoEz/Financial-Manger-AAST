import assert from 'node:assert/strict';
import prisma, { rawPrisma } from '../../src/db/prisma.js';
import { wipeAllButAccounts } from '../../src/utils/wipeData.js';
try {
  const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
  const branches = await prisma.branch.findMany({ orderBy: { code: 'asc' } });
  assert(
    (await prisma.cycle.count()) > 0 && (await prisma.student.count()) > 0 && (await prisma.systemLog.count()) > 0
  );
  const result = await wipeAllButAccounts(rawPrisma, 'test');
  assert.equal(result.accounts, users.length);
  // Accounts (with their passwords and roles) and branches are exactly as they were.
  assert.deepEqual(await prisma.user.findMany({ orderBy: { id: 'asc' } }), users);
  assert.deepEqual(await prisma.branch.findMany({ orderBy: { code: 'asc' } }), branches);
  for (const model of [
    'course',
    'cycle',
    'student',
    'enrollment',
    'paymentEntry',
    'payrollEarning',
    'instructor',
    'notification',
    'pendingAssignment',
    'moneyCheck',
    'bookPayment'
  ])
    assert.equal(await prisma[model].count(), 0, model);
  // The log keeps one entry recording the wipe, and is protected again afterwards.
  const logs = await prisma.systemLog.findMany();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'WIPE_ALL_BUT_ACCOUNTS');
  await assert.rejects(prisma.systemLog.delete({ where: { id: logs[0].id } }), /append-only/);
  console.log('PASS: wipe keeps accounts and branches, empties everything else, log protected again');
} finally {
  await prisma.$disconnect();
}
