import assert from 'node:assert/strict';
import express from 'express';
import service from '../../src/vercel.js';
import prisma from '../../src/db/prisma.js';
const app = express();
app.use(service);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function req(path, method = 'GET', body, auth) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}
const ok = r => {
  assert(r.status < 300, JSON.stringify(r.data));
  return r.data;
};
const login = async (username, password = 'IsolatedDemoTest!123') =>
  ok(await req('/auth/login', 'POST', { username, password })).token;
try {
  const main = await login('Youssef Wael');
  const joeAccount = await prisma.user.findUnique({ where: { username: 'Joe' } });
  let joe = await login('Joe');
  // Without the toggle, users have no Tests tab.
  assert.equal((await req('/placements', 'GET', undefined, joe)).status, 403);
  // The main mod gives Joe (Miami only) the placement tests toggle; branch mods cannot.
  ok(await req(`/users/${joeAccount.id}/branches`, 'PUT', { branches: ['MIAMI'] }, main));
  const branchMod = ok(await req('/auth/register', 'POST', { username: 'tests-fouad-mod', password: 'FouadTests!123', role: 'mod', branchScope: 'FOUAD' }, main));
  const fouad = await login('tests-fouad-mod', 'FouadTests!123');
  assert.equal((await req(`/users/${joeAccount.id}/permissions`, 'PUT', { canPlacementTest: true }, fouad)).status, 403);
  ok(await req(`/users/${joeAccount.id}/permissions`, 'PUT', { canPlacementTest: true }, main));
  joe = await login('Joe');
  assert.equal(ok(await req('/auth/me', 'GET', undefined, joe)).user.canPlacementTest, true);
  // Levels: every umbrella name once; purposes and the score out of 55.
  const tab = ok(await req('/placements', 'GET', undefined, joe));
  assert.deepEqual(tab.branches, ['MIAMI']);
  assert(tab.levels.includes('KET') && new Set(tab.levels).size === tab.levels.length);
  assert.deepEqual(tab.purposes, ['General English', 'IELTS', 'TOEFL', 'PTE']);
  assert.equal(tab.maxScore, 55);
  // Testers do not create tests or pick students; admins and the main mod do.
  assert.equal((await req('/placements/students?search=demo', 'GET', undefined, joe)).status, 403);
  assert.equal((await req('/placements', 'POST', { newStudent: { name: 'Kid', mobile: '01099900099' }, branch: 'MIAMI' }, joe)).status, 403);
  const found = ok(await req('/placements/students?search=demo', 'GET', undefined, main)).students;
  assert(found.every(s => Object.keys(s).sort().join() === 'englishName,id,mobile,name,registrationNumber'));
  // The main mod creates a test for a new student, then the same one again: told it already exists.
  const first = ok(await req('/placements', 'POST', { newStudent: { name: 'Placement Kid', mobile: '01099900011' }, branch: 'MIAMI' }, main));
  assert.equal(first.score, null);
  const dup = await req('/placements', 'POST', { newStudent: { name: 'placement  kid', mobile: '+20 1099900011' }, branch: 'MIAMI' }, main);
  assert.equal(dup.status, 409);
  assert.equal(dup.data.existing.id, first.studentId);
  // A test for an existing student, and one in a branch Joe does not have.
  const existing = await prisma.student.findUnique({ where: { id: 'demo-student-1' } });
  const second = ok(await req('/placements', 'POST', { studentId: existing.id, branch: 'MIAMI' }, main));
  const fouadTest = ok(await req('/placements', 'POST', { studentId: 'demo-student-2', branch: 'FOUAD' }, main));
  // Joe sees the Miami tests waiting for a result (his badge counts them), not Fouad's.
  let list = ok(await req('/placements?status=awaiting', 'GET', undefined, joe));
  assert.equal(list.counts.awaiting, 2);
  assert.equal(ok(await req('/attention', 'GET', undefined, joe)).unplacedTests, 2);
  assert.equal((await req(`/placements/${fouadTest.id}`, 'PUT', { score: 30, level: 'KET', purpose: 'IELTS' }, joe)).status, 403);
  // Results: score out of 55, level and purpose are all required.
  assert.equal((await req(`/placements/${first.id}`, 'PUT', { score: 56, level: 'KET', purpose: 'IELTS' }, joe)).status, 400);
  assert.equal((await req(`/placements/${first.id}`, 'PUT', { score: 40, level: 'KET', purpose: 'Spanish' }, joe)).status, 400);
  ok(await req(`/placements/${first.id}`, 'PUT', { score: 42, level: 'KET', purpose: 'General English' }, joe));
  ok(await req(`/placements/${second.id}`, 'PUT', { score: 50, level: 'FCE', purpose: 'IELTS' }, joe));
  // Both now wait to be placed; the result can be changed until then; testers never change the branch.
  list = ok(await req('/placements?status=unplaced', 'GET', undefined, joe));
  assert.equal(list.counts.unplaced, 2);
  assert.equal(list.counts.awaiting, 0);
  ok(await req(`/placements/${first.id}`, 'PUT', { score: 45, level: 'PET' }, joe));
  const saved = await prisma.placementTest.findUnique({ where: { id: first.id } });
  assert.deepEqual([saved.score, saved.level, saved.purpose, saved.resultBy], [45, 'PET', 'General English', 'Joe']);
  assert.equal((await req(`/placements/${first.id}`, 'PUT', { branch: 'FOUAD' }, joe)).status, 403);
  assert.equal(ok(await req('/attention', 'GET', undefined, main)).unplacedTests, 2);
  // Enrolling picks from tested students with a result; branch mods see only their branch's.
  const cycle = await prisma.cycle.findFirst({ where: { branch: 'MIAMI', isFinished: false, archivedAt: null } });
  const picker = ok(await req(`/placements/for-cycle/${cycle.id}`, 'GET', undefined, main)).rows;
  assert(picker.some(r => r.studentId === first.studentId));
  assert(!picker.some(r => r.id === fouadTest.id), 'tests without a result are not offered');
  assert.equal(ok(await req(`/placements/for-cycle/${cycle.id}`, 'GET', undefined, fouad)).rows.length, 0);
  // Placed the moment they join any cycle: then locked, and out of "Not placed yet".
  ok(await req(`/cycles/${cycle.id}/enrollments`, 'POST', { studentId: first.studentId, tuitionType: 'EXEMPT' }, main));
  list = ok(await req('/placements?status=unplaced', 'GET', undefined, joe));
  assert.equal(list.counts.unplaced, 1);
  const placed = ok(await req('/placements?status=placed', 'GET', undefined, joe)).rows.find(r => r.id === first.id);
  assert.equal(placed.placed.cycle.id, cycle.id);
  // The student's details show their placement tests, and the cycle they joined after it.
  const details = ok(await req(`/students/${first.studentId}`, 'GET', undefined, main));
  assert.equal(details.placementTests.length, 1);
  assert.deepEqual([details.placementTests[0].level, details.placementTests[0].purpose], ['PET', 'General English']);
  assert.equal(details.placementTests[0].placed.cycle.id, cycle.id);
  assert.equal((await req(`/placements/${first.id}`, 'PUT', { score: 1 }, joe)).status, 409);
  // Only admins and the main mod delete tests (while not placed).
  assert.equal((await req(`/placements/${second.id}`, 'DELETE', undefined, joe)).status, 403);
  assert.equal((await req(`/placements/${first.id}`, 'DELETE', undefined, main)).status, 409);
  ok(await req(`/placements/${second.id}`, 'DELETE', undefined, main));
  // Turning the toggle off closes the tab again.
  ok(await req(`/users/${joeAccount.id}/permissions`, 'PUT', { canPlacementTest: false }, main));
  assert.equal((await req('/placements', 'GET', undefined, await login('Joe'))).status, 403);
  assert(branchMod.user.id);
  console.log('PASS: placement tests: managers create, testers enter score/55, level and purpose for their branches, placed on enrollment');
} finally {
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
