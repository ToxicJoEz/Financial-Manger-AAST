import assert from 'node:assert/strict';
import express from 'express';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import handler from '../../../api/index.js';
import prisma from '../../src/db/prisma.js';
import { prepareRuntimeDatabase } from '../../src/utils/runtimeDatabase.js';

const source = new URL('../../demo/demo.db', import.meta.url);
const digest = () => createHash('sha256').update(readFileSync(source)).digest('hex');
const before = digest();
const api = express();
api.use((req, res) => handler(req, res));
const server = api.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/index`;
let token;
async function request(route, method = 'GET', body, overrideToken = token) {
  const response = await fetch(base + '?__route=' + route, { method, headers: { 'Content-Type': 'application/json', ...(overrideToken ? { Authorization: 'Bearer ' + overrideToken } : {}), Origin: 'https://arbitrary-test-origin.invalid' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
try {
  const health = await request('health');
  assert.equal(health.status, 200, JSON.stringify(health.data));
  assert.equal(health.headers.get('access-control-allow-origin'), '*');
  assert.equal(health.data.demo, true);
  const firstPath = prepareRuntimeDatabase();
  assert.equal(prepareRuntimeDatabase(), firstPath);
  const login = await request('auth/login', 'POST', { username: 'main-admin', password: 'IsolatedDemoTest!123' });
  assert.equal(login.status, 200, JSON.stringify(login.data)); token = login.data.token;
  const adminAccount = await request('auth/login', 'POST', { username: 'Joe-admin', password: 'IsolatedDemoTest!123' });
  assert.equal(adminAccount.status, 200); assert.equal(adminAccount.data.user.role, 'admin');
  const courses = await request('courses'); assert.equal(courses.status, 200); assert.equal(courses.data.length, 4);
  const roster = await request('students'); assert.equal(roster.status, 200);
  assert.equal(await prisma.student.count(), 8);
  const report = await request('exports', 'POST', { sheets: { courses: ['course', 'collected'], tuition: ['student', 'paid'], payroll: ['instructor', 'earned'] }, filters: { from: '2026-10-01', to: '2026-10-31' } });
  assert.equal(report.status, 200, JSON.stringify(report.data)); assert.equal(report.data.sheets[0].rows.length, 4); assert.equal(report.data.sheets[2].rows.length, 3);
  const junior = await request('auth/login', 'POST', { username: 'Joe', password: 'IsolatedDemoTest!123' }); assert.equal(junior.status, 200);
  const publicCourses = await request('courses', 'GET', undefined, junior.data.token); assert(!JSON.stringify(publicCourses.data).includes('hourlyRate'));
  assert.equal((await request('exports', 'POST', { sheets: { payroll: ['rate'] } }, junior.data.token)).status, 403);
  const jwt = (await import('jsonwebtoken')).default;
  const rootToken = jwt.sign({ username: 'main-admin', role: 'admin', jti: 'isolated-root-rejection' }, process.env.SSO_JWT_SECRET, { expiresIn: 20 });
  assert.equal((await request('auth/sso', 'POST', { token: rootToken })).status, 403);
  if (process.env.DEMO_TEST_MUTATE === '1') {
    const added = await request('students', 'POST', { name: 'Temporary test only', registrationNumber: 'ISOLATED-NEW' }); assert.equal(added.status, 201, JSON.stringify(added.data));
    assert.equal(await prisma.student.count(), 9);
  }
  assert.equal(digest(), before);
  console.log('PASS: demo initialization, same-instance persistence, bundled file unchanged, API rewrite, login, open CORS, privacy, SSO root isolation, October exports.');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
