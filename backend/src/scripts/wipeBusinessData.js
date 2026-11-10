// Empties a database of all business data (courses, students, employees, payments, payroll, checks,
// notifications) and keeps user accounts and the activity log. Nothing is reseeded: the app starts blank.
//
// Meant for the live (Vercel) database. Run it from your own terminal with the live address, e.g.:
//   set DATABASE_URL=postgresql://...   (PowerShell: $env:DATABASE_URL="postgresql://...")
//   npm --prefix backend run db:wipe-keep-accounts -- --confirm-host=<the database host name>
// The host must be typed exactly, so it cannot run against the wrong database by accident.
// A backup is saved first (needs pg_dump); add --skip-backup only if you have your own backup.
// No .env loading: only the address you set in the terminal is ever used.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '../../generated/client/index.js';
import { BUSINESS_TABLES, truncateBusinessData } from '../utils/businessTables.js';

const address = new URL(process.env.DATABASE_URL || 'postgresql://missing');
const confirm = process.argv.find(arg => arg.startsWith('--confirm-host='))?.slice('--confirm-host='.length);
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the database you want to empty.');
if (confirm !== address.hostname)
  throw new Error(`Refusing to run. Add --confirm-host=${address.hostname} if this is the database you mean to empty.`);

// 1. Backup (outside the project).
if (!process.argv.includes('--skip-backup')) {
  const backend = fileURLToPath(new URL('../../', import.meta.url));
  const config = join(backend, '.local-postgres.json');
  const binDir = existsSync(config) ? JSON.parse(readFileSync(config, 'utf8')).binDir : '';
  const pgDump = binDir ? join(binDir, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump') : 'pg_dump';
  const folder = join(homedir(), 'Documents', 'AAST Finance backups');
  mkdirSync(folder, { recursive: true });
  const backup = join(
    folder,
    `${address.hostname}-before-wipe-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.dump`
  );
  const plain = new URL(process.env.DATABASE_URL);
  const schema = plain.searchParams.get('schema');
  plain.search = plain.searchParams.get('sslmode') ? `?sslmode=${plain.searchParams.get('sslmode')}` : '';
  const dump = spawnSync(pgDump, ['-Fc', ...(schema ? ['-n', schema] : []), '-f', backup, plain.toString()], {
    stdio: 'inherit',
    windowsHide: true
  });
  if (dump.status !== 0)
    throw new Error('Backup failed, so nothing was deleted. Fix pg_dump or add --skip-backup if you have a backup.');
  console.log(`Backup saved: ${backup}`);
}

// 2. Clear business tables in one statement; accounts must be unchanged afterwards.
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
try {
  const usersBefore = await prisma.user.count();
  await truncateBusinessData(prisma);
  if ((await prisma.user.count()) !== usersBefore) throw new Error('User accounts changed unexpectedly.');
  console.log(`Emptied ${BUSINESS_TABLES.length} tables on ${address.hostname}. ${usersBefore} user accounts kept.`);
} finally {
  await prisma.$disconnect();
}
