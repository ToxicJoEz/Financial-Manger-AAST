import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/client/index.js';
import { seedFixture } from './fixtures/seed.js';

async function fixture(filename) {
  const address = process.env.TEST_DATABASE_URL;
  if (!address) throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test. Tests never use DATABASE_URL.');
  const url = new URL(address);
  if (!decodeURIComponent(url.pathname).endsWith('_test')) throw new Error('Refusing integration tests: test database name must end in _test.');
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  url.searchParams.set('schema', schema);
  const connection = url.toString();
  const client = new PrismaClient({ datasources: { db: { url: connection } } });
  const passwordHash = await bcrypt.hash('IsolatedDemoTest!123',10);
  const env = { ...process.env, DATABASE_URL: connection, DIRECT_URL: connection, VERCEL:'1', JWT_SECRET:'isolated-postgres-jwt-'.repeat(4), SSO_JWT_SECRET:'isolated-postgres-sso-'.repeat(4), MAIN_ADMIN_PASSWORD_HASH:passwordHash, NODE_ENV:'production' };
  try {
    execFileSync(process.execPath,[fileURLToPath(new URL('../node_modules/prisma/build/index.js',import.meta.url)), 'migrate','deploy'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env,stdio:'pipe',timeout:45000});
    await seedFixture(client,passwordHash);
    const phases = filename === 'vercelSmoke.js' ? ['write','read'] : ['workflow'];
    for (const phase of phases) {
      const output = execFileSync(process.execPath,[fileURLToPath(new URL('./fixtures/'+filename,import.meta.url))],{env:{...env,PERSISTENCE_PHASE:phase},encoding:'utf8',timeout:60000});
      assert.match(output,/PASS:/);
    }
  } finally {
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.$disconnect();
  }
}
test('Vercel API uses persistent PostgreSQL with API rewriting and role privacy',()=>fixture('vercelSmoke.js'));
test('Course/cycle workflows preserve financial and access invariants',()=>fixture('cycleWorkflow.js'));
test('Excel import preserves student identity, payment integrity and permissions',()=>fixture('importWorkflow.js'));
test('Student requests require approval and student imports require a manager',()=>fixture('studentApprovalWorkflow.js'));
test('Instructor earnings use selected-cycle batches and separate payment dates',()=>fixture('instructorPaymentWorkflow.js'));

test('Employee Excel imports merge branches and preserve unique identities',()=>fixture('employeeImportWorkflow.js'));

test('Audit history survives failures and deletions with role-scoped access',()=>fixture('auditWorkflow.js'));

test('Management corrections preserve balances, identity and access boundaries',()=>fixture('managementWorkflow.js'));

test('Private cycles preserve naming, capacity, book prices and finance metadata',()=>fixture('privateCourseWorkflow.js'));
