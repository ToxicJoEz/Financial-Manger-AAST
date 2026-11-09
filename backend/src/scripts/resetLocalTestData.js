// Clears local business data (courses, students, employees, payments, payroll, notifications) and reseeds
// the sample set. User accounts are never touched; the append-only activity log is kept by design.
// Local PostgreSQL only. A full backup is written outside the project before anything is deleted.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../db/prisma.js';

if (!process.argv.includes('--confirm')) throw new Error('Run with --confirm to reset local test data.');
const address = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(address.hostname) || process.env.VERCEL === '1')
  throw new Error('Resetting is only allowed on a local PostgreSQL database.');

const backend = fileURLToPath(new URL('../../', import.meta.url));
const config = join(backend, '.local-postgres.json');
const binDir = existsSync(config) ? JSON.parse(readFileSync(config, 'utf8')).binDir : '';
const pgDump = binDir ? join(binDir, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump') : 'pg_dump';

// 1. Backup.
const folder = join(homedir(), 'Documents', 'AAST Finance backups');
mkdirSync(folder, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backup = join(folder, `finance-before-reset-${stamp}.dump`);
const plain = new URL(process.env.DATABASE_URL);
plain.search = '';
const dump = spawnSync(pgDump, ['-Fc', '-f', backup, plain.toString()], { stdio: 'inherit', windowsHide: true });
if (dump.status !== 0) throw new Error('Backup failed, so nothing was deleted. Check that PostgreSQL is running.');
console.log(`Backup saved: ${backup}`);

// 2. Clear business tables in one statement. "User" and "SystemLog" are not listed.
const tables = [
  'PaymentEntry',
  'BookPayment',
  'RetainedEnrollmentIncome',
  'PayrollEarning',
  'InstructorPaymentBatch',
  'PaymentRun',
  'PayrollRecord',
  'ImportBatch',
  'Notification',
  'PendingAssignment',
  'CourseInstructor',
  'Enrollment',
  'Student',
  'Cycle',
  'SubCourse',
  'Course',
  'Instructor',
  'BranchColor'
];
const usersBefore = await prisma.user.count();
await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t}"`).join(', ')}`);
if ((await prisma.user.count()) !== usersBefore) throw new Error('User accounts changed unexpectedly.');
await prisma.$disconnect();
console.log(`Business data cleared. ${usersBefore} user accounts kept.`);

// 3. Reseed.
const seed = spawnSync(process.execPath, [join(backend, 'src/scripts/seedLocalTestData.js'), '--add-local-test-data'], {
  cwd: backend,
  stdio: 'inherit'
});
process.exit(seed.status ?? 1);
