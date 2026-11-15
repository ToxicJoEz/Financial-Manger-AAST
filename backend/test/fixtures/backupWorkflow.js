import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import express from 'express';
import service from '../../src/vercel.js';
import prisma from '../../src/db/prisma.js';
const app = express();
app.use(service);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
async function req(path, method = 'GET', body, auth, raw) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': raw ? 'application/octet-stream' : 'application/json',
      ...(auth ? { Authorization: 'Bearer ' + auth } : {})
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body))
  });
  const type = response.headers.get('content-type') || '';
  return {
    status: response.status,
    data: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer())
  };
}
const ok = r => {
  assert(r.status < 300, JSON.stringify(r.data));
  return r.data;
};
const login = async username =>
  ok(await req('/auth/login', 'POST', { username, password: 'IsolatedDemoTest!123' })).token;
// Download a backup the way the browser does: start it, fetch each part, join them.
async function download(token) {
  const info = ok(await req('/backups', 'POST', {}, token));
  const parts = [];
  for (let i = 0; i < info.totalChunks; i++)
    parts.push(ok(await req(`/backups/${info.id}/chunks/${i}`, 'GET', undefined, token)));
  ok(await req('/backups/' + info.id, 'DELETE', {}, token));
  return { info, file: Buffer.concat(parts) };
}
// Upload and restore it the same way.
async function upload(token, file, chunkSize = 1000) {
  const started = ok(await req('/backups/uploads', 'POST', { size: file.length, fileName: 'test.json.gz' }, token));
  const size = Math.min(chunkSize, started.chunkSize);
  const total = Math.ceil(file.length / size);
  // The server cuts files into its own part size; send parts of that size.
  const serverParts = Math.ceil(file.length / started.chunkSize);
  assert.equal(started.totalChunks, serverParts);
  for (let i = 0; i < serverParts; i++)
    ok(
      await req(
        `/backups/uploads/${started.id}/chunks/${i}`,
        'PUT',
        undefined,
        token,
        file.subarray(i * started.chunkSize, (i + 1) * started.chunkSize)
      )
    );
  return { id: started.id, total };
}
const snapshot = async () => ({
  users: (await prisma.user.findMany({ orderBy: { id: 'asc' } })).map(u => [u.id, u.username, u.role, u.passwordHash]),
  cycles: (await prisma.cycle.findMany({ orderBy: { id: 'asc' } })).map(c => [
    c.id,
    c.name,
    c.courseFee,
    c.previousCycleId
  ]),
  payments: (await prisma.paymentEntry.findMany({ orderBy: { id: 'asc' } })).map(p => [
    p.id,
    String(p.amountMinor),
    p.reversalOfId
  ]),
  earnings: (await prisma.payrollEarning.findMany({ orderBy: { id: 'asc' } })).map(e => [
    e.id,
    String(e.amountMinor),
    e.batchId
  ]),
  logs: await prisma.systemLog.count(),
  students: await prisma.student.count(),
  enrollments: await prisma.enrollment.count()
});
try {
  const admin = await login('main-admin'),
    main = await login('Youssef Wael'),
    user = await login('Joe');
  // Only admins and the main mod.
  assert.equal((await req('/backups', 'POST', {}, user)).status, 403);
  assert.equal((await req('/backups/uploads', 'POST', { size: 10 }, user)).status, 403);
  // A next level and a reversed payment exercise links inside the same table.
  const next = ok(
    await req(
      '/cycles',
      'POST',
      {
        parentCourseId: 'course-ket',
        cycleNumber: 2,
        branch: 'MIAMI',
        startDate: '2026-11-20',
        courseFee: 1000,
        previousCycleId: 'cycle-ket-12'
      },
      admin
    )
  );
  const before = await snapshot();
  const { info, file } = await download(main);
  assert(file.length > 0 && info.counts.User > 0 && info.counts.SystemLog > 0);
  assert(info.totalChunks > 1, 'the file travelled in several parts');
  const parsed = JSON.parse(gunzipSync(file).toString('utf8'));
  assert.equal(parsed.format, 'aast-finance-backup');
  assert(
    parsed.tables.User.length && parsed.tables.SystemLog.length && parsed.tables.Cycle.some(c => c.id === next.id)
  );
  assert(!parsed.tables.BackupTransfer, 'temporary transfer storage is not backed up');
  // Change things after the backup: a new cycle, a deleted student, a changed account.
  ok(
    await req(
      '/cycles',
      'POST',
      { parentCourseId: 'course-pet', cycleNumber: 9, branch: 'MIAMI', startDate: '2026-11-21', courseFee: 1 },
      admin
    )
  );
  await prisma.enrollment.deleteMany({ where: { studentId: 'demo-student-8' } });
  await prisma.student.delete({ where: { id: 'demo-student-8' } });
  await prisma.user.update({ where: { username: 'Joe' }, data: { role: 'mod' } });
  // Damaged or foreign files are refused before anything changes.
  const damaged = Buffer.from(file);
  damaged[damaged.length - 20] ^= 0xff;
  const bad = await upload(admin, damaged);
  assert.equal((await req(`/backups/uploads/${bad.id}/check`, 'GET', undefined, admin)).status, 400);
  const foreign = await upload(admin, gzipSync(Buffer.from('{"hello":"world"}')));
  assert.equal((await req(`/backups/uploads/${foreign.id}/restore`, 'POST', { confirm: true }, admin)).status, 400);
  const tampered = JSON.parse(gunzipSync(file).toString('utf8'));
  tampered.tables.User[0].username = 'tampered';
  const wrongSum = await upload(admin, gzipSync(Buffer.from(JSON.stringify(tampered))));
  assert.match((await req(`/backups/uploads/${wrongSum.id}/check`, 'GET', undefined, admin)).data.error, /damaged/);
  const oldVersion = JSON.parse(gunzipSync(file).toString('utf8'));
  oldVersion.schema = '20200101000000_old';
  const old = await upload(admin, gzipSync(Buffer.from(JSON.stringify(oldVersion))));
  assert.equal((await req(`/backups/uploads/${old.id}/restore`, 'POST', { confirm: true }, admin)).status, 409);
  // A real restore needs confirmation, then brings back exactly what was backed up.
  const good = await upload(admin, file);
  const checked = ok(await req(`/backups/uploads/${good.id}/check`, 'GET', undefined, admin));
  assert.equal(checked.counts.Cycle, info.counts.Cycle);
  assert.equal((await req(`/backups/uploads/${good.id}/restore`, 'POST', {}, admin)).status, 400);
  ok(await req(`/backups/uploads/${good.id}/restore`, 'POST', { confirm: true }, admin));
  const after = await snapshot();
  assert.deepEqual(after.users, before.users);
  assert.deepEqual(after.cycles, before.cycles);
  assert.deepEqual(after.payments, before.payments);
  assert.deepEqual(after.earnings, before.earnings);
  assert.equal(after.students, before.students);
  assert.equal(after.enrollments, before.enrollments);
  assert.equal((await prisma.cycle.findUnique({ where: { id: next.id } })).previousCycleId, 'cycle-ket-12');
  // The restored log keeps its history, ends with the restore itself, and stays protected from edits.
  const restoreLog = await prisma.systemLog.findFirst({ where: { action: 'RESTORE_BACKUP', outcome: 'SUCCESS' } });
  assert(restoreLog && after.logs >= before.logs);
  await assert.rejects(prisma.systemLog.delete({ where: { id: restoreLog.id } }), /append-only/);
  // Sessions keep working for accounts that exist in the backup.
  ok(await req('/auth/me', 'GET', undefined, main));
  console.log(
    'PASS: full backup in parts, damaged/foreign/other-version files refused, confirmed restore brings back accounts, cycles, links, money and logs'
  );
} finally {
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
