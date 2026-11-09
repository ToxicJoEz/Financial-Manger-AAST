import assert from 'node:assert/strict';
import express from 'express';
import service from '../../src/vercel.js';
import prisma from '../../src/db/prisma.js';
const app = express();
app.use(service);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
let token;
async function req(path, method = 'GET', body, auth = token) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}
const ok = r => {
  assert(r.status < 300, JSON.stringify(r));
  return r.data;
};
const items = (rows, modes) => rows.map(row => ({ id: row.id, version: row.version, mode: modes[row.id] }));
try {
  token = ok(await req('/auth/login', 'POST', { username: 'main-admin', password: 'IsolatedDemoTest!123' })).token;
  const junior = ok(await req('/auth/login', 'POST', { username: 'Joe', password: 'IsolatedDemoTest!123' })).token;
  const ids = ['cycle-ket-12', 'cycle-ket-13', 'cycle-pet-1'];
  assert.equal((await req('/cycles/bulk-deletion-preview?ids=' + ids.join(','), 'GET', undefined, junior)).status, 403);
  assert.equal((await req('/cycles/bulk-delete', 'POST', { confirm: true, items: [] }, junior)).status, 403);
  let preview = ok(await req('/cycles/bulk-deletion-preview?ids=' + ids.join(','))).cycles;
  const byId = Object.fromEntries(preview.map(row => [row.id, row]));
  assert.equal(byId['cycle-ket-13'].permanentBlocked, true);
  assert.equal(byId['cycle-ket-12'].permanentBlocked, false);
  assert.equal(byId['cycle-pet-1'].permanentBlocked, false);
  // Confirmation is required, and paid payroll blocks permanent deletion with a full rollback.
  assert.equal(
    (
      await req('/cycles/bulk-delete', 'POST', {
        items: items(preview, { 'cycle-ket-12': 'DELETE', 'cycle-ket-13': 'ARCHIVE', 'cycle-pet-1': 'ARCHIVE' })
      })
    ).status,
    400
  );
  assert.equal(
    (
      await req('/cycles/bulk-delete', 'POST', {
        confirm: true,
        items: items(preview, { 'cycle-ket-12': 'DELETE', 'cycle-ket-13': 'DELETE', 'cycle-pet-1': 'ARCHIVE' })
      })
    ).status,
    409
  );
  assert(await prisma.cycle.findUnique({ where: { id: 'cycle-ket-12' } }));
  assert.equal((await prisma.cycle.findUnique({ where: { id: 'cycle-pet-1' } })).archivedAt, null);
  // A change after the preview is rejected.
  ok(await req('/cycles/cycle-pet-1', 'PUT', { details: 'Changed after preview' }));
  assert.equal(
    (
      await req('/cycles/bulk-delete', 'POST', {
        confirm: true,
        items: items(preview, { 'cycle-ket-12': 'ARCHIVE', 'cycle-ket-13': 'ARCHIVE', 'cycle-pet-1': 'DELETE' })
      })
    ).status,
    409
  );
  // Mixed choices apply together.
  preview = ok(await req('/cycles/bulk-deletion-preview?ids=' + ids.join(','))).cycles;
  const paidBefore = await prisma.payrollEarning.count({ where: { courseId: 'cycle-ket-13' } });
  const result = ok(
    await req('/cycles/bulk-delete', 'POST', {
      confirm: true,
      items: items(preview, { 'cycle-ket-12': 'DELETE', 'cycle-ket-13': 'ARCHIVE', 'cycle-pet-1': 'DELETE' })
    })
  );
  assert.equal(result.archived, 1);
  assert.equal(result.deleted, 2);
  assert.equal(await prisma.cycle.findUnique({ where: { id: 'cycle-ket-12' } }), null);
  assert.equal(await prisma.cycle.findUnique({ where: { id: 'cycle-pet-1' } }), null);
  assert.equal(await prisma.paymentEntry.count({ where: { courseId: 'cycle-ket-12' } }), 0);
  assert((await prisma.cycle.findUnique({ where: { id: 'cycle-ket-13' } })).archivedAt);
  assert.equal(await prisma.payrollEarning.count({ where: { courseId: 'cycle-ket-13' } }), paidBefore);

  // Employees follow the single-delete rule: paid or processing payroll can only be archived.
  const people = ['demo-instructor-3', 'demo-instructor-2'];
  assert.equal(
    (await req('/employees/bulk-deletion-preview?ids=' + people.join(','), 'GET', undefined, junior)).status,
    403
  );
  let staff = ok(await req('/employees/bulk-deletion-preview?ids=' + people.join(','))).employees;
  assert.equal(staff.find(row => row.id === 'demo-instructor-3').permanentBlocked, true);
  assert.equal(staff.find(row => row.id === 'demo-instructor-2').permanentBlocked, false);
  assert.equal(
    (
      await req('/employees/bulk-delete', 'POST', {
        confirm: true,
        items: items(staff, { 'demo-instructor-3': 'DELETE', 'demo-instructor-2': 'DELETE' })
      })
    ).status,
    409
  );
  assert(await prisma.instructor.findUnique({ where: { id: 'demo-instructor-2' } }));
  const done = ok(
    await req('/employees/bulk-delete', 'POST', {
      confirm: true,
      items: items(staff, { 'demo-instructor-3': 'ARCHIVE', 'demo-instructor-2': 'DELETE' })
    })
  );
  assert.equal(done.archived, 1);
  assert.equal(done.deleted, 1);
  assert.equal(await prisma.instructor.findUnique({ where: { id: 'demo-instructor-2' } }), null);
  assert((await prisma.instructor.findUnique({ where: { id: 'demo-instructor-3' } })).archivedAt);
  assert(
    await prisma.payrollEarning.count({ where: { instructorId: 'demo-instructor-3', batch: { status: 'PAID' } } })
  );
  console.log(
    'PASS: bulk cycle/employee deletion uses per-record choices, paid payroll protection, stale-preview checks, atomic rollback and manager-only access.'
  );
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
