// Restore a full backup from the command line, e.g. onto a fresh database on a new host:
//   npm run db:deploy && npm run db:restore -- <backup-file> --confirm
// Replaces EVERYTHING in the DATABASE_URL database (accounts, cycles, money, logs) with the backup.
import { readFileSync } from 'node:fs';
import { rawPrisma } from '../db/prisma.js';
import { readBackup, restoreBackup } from '../utils/backup.js';

const file = process.argv[2];
if (!file || !process.argv.includes('--confirm')) {
  console.error('Usage: npm run db:restore -- <backup-file> --confirm   (replaces all current data)');
  process.exit(1);
}
try {
  const buffer = readFileSync(file);
  const info = readBackup(buffer);
  console.log(`Restoring backup made ${info.createdAt} by ${info.createdBy}…`);
  await restoreBackup(rawPrisma, buffer);
  console.log('Restored:', JSON.stringify(info.counts));
} catch (error) {
  console.error('Restore failed, nothing was changed:', error.message);
  process.exitCode = 1;
} finally {
  await rawPrisma.$disconnect();
}
