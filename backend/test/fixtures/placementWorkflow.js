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
  // Levels: every umbrella name once.
  const tab = ok(await req('/placements', 'GET', undefined, joe));
  assert.deepEqual(tab.branches, ['MIAMI']);
  assert(tab.levels.includes('KET') && new Set(tab.levels).size === tab.levels.length);
  // Testers see basic student details only.
  const found = ok(await req('/placements/students?search=demo', 'GET', undefined, joe)).students;
  assert(found.every(s => Object.keys(s).sort().join() === 'englishName,id,mobile,name,registrationNumber'));
  // Only their own branches.
  assert.equal((await req('/placements', 'POST', { newStudent: { name: 'Fouad Kid', mobile: '01099900099' }, branch: 'FOUAD', score: 40, level: 'KET' }, joe)).status, 403);
  // A new student, then the same one again: told it already exists.
  const first = ok(await req('/placements', 'POST', { newStudent: { name: 'Placement Kid', mobile: '01099900011' }, branch: 'MIAMI', score: 42, level: 'KET' }, joe));
  const dup = await req('/placements', 'POST', { newStudent: { name: 'placement  kid', mobile: '+20 1099900011' }, branch: 'MIAMI', score: 50, level: 'PET' }, joe);
  assert.equal(dup.status, 409);
  assert.equal(dup.data.existing.id, first.studentId);
  // An existing student (who already took courses) can be tested too.
  const existing = await prisma.student.findUnique({ where: { id: 'demo-student-1' } });
  const second = ok(await req('/placements', 'POST', { studentId: existing.id, branch: 'MIAMI', score: 77, level: 'FCE' }, joe));
  // Both wait to be placed; the score and level can be edited until then.
  let list = ok(await req('/placements?status=unplaced', 'GET', undefined, joe));
  assert.equal(list.counts.unplaced, 2);
  ok(await req(`/placements/${first.id}`, 'PUT', { score: 45, level: 'PET' }, joe));
  assert.equal((await prisma.placementTest.findUnique({ where: { id: first.id } })).level, 'PET');
  assert.equal(ok(await req('/attention', 'GET', undefined, main)).unplacedTests, 2);
  // Enrolling picks from tested students; branch mods see only their branch's.
  const cycle = await prisma.cycle.findFirst({ where: { branch: 'MIAMI', isFinished: false, archivedAt: null } });
  const picker = ok(await req(`/placements/for-cycle/${cycle.id}`, 'GET', undefined, main)).rows;
  assert(picker.some(r => r.studentId === first.studentId));
  assert.equal(ok(await req(`/placements/for-cycle/${cycle.id}`, 'GET', undefined, fouad)).rows.length, 0);
  // Placed the moment they join any cycle: then locked, and out of "Not placed yet".
  ok(await req(`/cycles/${cycle.id}/enrollments`, 'POST', { studentId: first.studentId, tuitionType: 'EXEMPT' }, main));
  list = ok(await req('/placements?status=unplaced', 'GET', undefined, joe));
  assert.equal(list.counts.unplaced, 1);
  const placed = ok(await req('/placements?status=placed', 'GET', undefined, joe)).rows.find(r => r.id === first.id);
  assert.equal(placed.placed.cycle.id, cycle.id);
  assert.equal((await req(`/placements/${first.id}`, 'PUT', { score: 1 }, joe)).status, 409);
  assert.equal((await req(`/placements/${first.id}`, 'DELETE', undefined, joe)).status, 409);
  // Still unplaced: can be deleted.
  ok(await req(`/placements/${second.id}`, 'DELETE', undefined, joe));
  // Turning the toggle off closes the tab again.
  ok(await req(`/users/${joeAccount.id}/permissions`, 'PUT', { canPlacementTest: false }, main));
  assert.equal((await req('/placements', 'GET', undefined, await login('Joe'))).status, 403);
  assert(branchMod.user.id);
  console.log('PASS: placement tests: toggle, own branches, duplicate warning, edit until placed, placed on enrollment, tested picker');
} finally {
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
