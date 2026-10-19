import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

test('Vercel API uses an isolated writable copy; a new instance restores the fixture', async () => {
  const hash = await bcrypt.hash('IsolatedDemoTest!123', 10);
  const accounts = JSON.parse(readFileSync(new URL('../demo/accounts.json', import.meta.url), 'utf8'));
  const passwordMap = JSON.stringify(Object.fromEntries(accounts.filter(account => account.username !== 'main-admin').map(account => [account.username, hash])));
  for (const mutate of ['1', '0']) {
    const output = execFileSync(process.execPath, [fileURLToPath(new URL('./fixtures/vercelSmoke.js', import.meta.url))], {
      encoding: 'utf8', timeout: 45000,
      env: { ...process.env, VERCEL: '1', VERCEL_SQLITE_DEMO: '1', JWT_SECRET: 'isolated-jwt-test-'.repeat(4), SSO_JWT_SECRET: 'isolated-sso-test-'.repeat(4), MAIN_ADMIN_PASSWORD_HASH: hash, DEMO_USER_PASSWORD_HASHES: passwordMap, DEMO_TEST_MUTATE: mutate, NODE_ENV: 'production' }
    });
    assert.match(output, /PASS:/);
  }
});
