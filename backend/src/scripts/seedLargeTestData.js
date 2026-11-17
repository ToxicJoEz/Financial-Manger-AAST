// A LARGE local sample set for testing with lots of data: ~1,000 cycles (group and private) across 2026, ~3,000
// students, 120 employees, tuition and book payments, payroll in every state, linked levels, closed hours and
// branch mod cycles waiting for approval. Local PostgreSQL only; user accounts are never touched.
// Run through `npm run db:reset-large-test-data` (backup, clear, then this), or alone on an empty workspace.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import prisma from '../db/prisma.js';
import { EMPLOYEE_BRANCHES as branches } from '../utils/employees.js';
import { cycleName } from '../utils/privateCourses.js';

if (!process.argv.includes('--add-large-test-data')) throw new Error('Use --add-large-test-data to add the large set.');
const address = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(address.hostname) || process.env.VERCEL === '1')
  throw new Error('This sample generator only supports local PostgreSQL.');
for (const model of ['course', 'cycle', 'student', 'instructor', 'enrollment'])
  if (await prisma[model].count()) throw new Error('Business data already exists. Run db:reset-large-test-data instead.');

// Deterministic randomness, so every run builds the same data.
let seed = 20261117;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = list => list[Math.floor(rand() * list.length)];
const chance = p => rand() < p;
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const day = d => new Date(`${d}T12:00:00Z`);
const midnight = d => new Date(`${d}T00:00:00Z`);
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const TODAY = day('2026-11-17');
const users = await prisma.user.findMany();
const actor = (users.find(u => u.username === 'main-admin') || users.find(u => u.role === 'admin'))?.username || 'main-admin';
const branchMods = users.filter(u => u.role === 'mod' && u.branchScope && !u.isBanned);
const usersBefore = users.length;

const firstNames = ['عمر', 'سلمى', 'يوسف', 'مريم', 'علي', 'نور', 'كريم', 'هنا', 'محمد', 'فاطمة', 'أحمد', 'ليلى', 'زياد', 'جنى', 'آدم', 'ملك', 'حمزة', 'رنا', 'مالك', 'سارة', 'إياد', 'تالين', 'سيف', 'روان', 'مازن', 'حبيبة', 'Omar', 'Salma', 'Youssef', 'Mariam', 'Ali', 'Nour', 'Karim', 'Hana', 'Adam', 'Malak', 'Ziad', 'Jana', 'Seif', 'Farida'];
const lastNames = ['أحمد حسن', 'محمود علي', 'محمد إبراهيم', 'خالد عبد الله', 'مصطفى عادل', 'وليد حسين', 'عمرو فتحي', 'طارق سامي', 'هشام كمال', 'شريف نبيل', 'ياسر منير', 'عادل رشدي', 'Ahmed Hassan', 'Mahmoud Ali', 'Ibrahim Kamal', 'Mostafa Adel', 'Tarek Samy', 'Hesham Nabil', 'Khaled Fathy', 'Walid Hussein'];
const teacherFirst = ['أحمد', 'سارة', 'محمود', 'منى', 'محمد', 'هبة', 'كريم', 'نورا', 'مي', 'نرمين', 'مصطفى', 'فاطمة', 'ميرنا', 'دينا', 'رامي', 'شيماء', 'عمرو', 'ياسمين', 'حسام', 'ريهام'];
const teacherLast = ['حسن', 'عادل', 'كشك', 'الششتاوي', 'إبراهيم', 'صلاح', 'عبد الكريم', 'فوزي', 'سمير', 'رجب', 'نبيل', 'منصور'];

const t0 = Date.now();
// 1. Employees: 120, each working in two or three branches.
const employees = Array.from({ length: 120 }, (_, i) => {
  const own = [...new Set([pick(branches), pick(branches), ...(chance(0.4) ? [pick(branches)] : [])])];
  return {
    id: randomUUID(),
    name: `${teacherFirst[i % teacherFirst.length]} ${teacherLast[Math.floor(i / teacherFirst.length) % teacherLast.length]}${i >= 240 ? ' ' + i : ''}`,
    employeeId: 'LG-E' + String(i + 1).padStart(4, '0'),
    mobile: '012' + String(30000000 + i),
    branches: own.join(','),
    rate: pick([120, 140, 150, 180, 200, 220])
  };
});
await prisma.instructor.createMany({ data: employees.map(({ rate, ...e }) => e) });

// 2. Students: 3,000; about one in twelve shares a parent's phone with a sibling.
const students = [];
for (let n = 0; n < 3000; n++) {
  const sibling = n > 0 && chance(0.08) ? students[n - 1] : null;
  students.push({
    id: randomUUID(),
    name: `${pick(firstNames)} ${sibling ? sibling.name.split(' ').slice(1).join(' ') : pick(lastNames)}`,
    registrationNumber: chance(0.7) ? 'LG-S' + String(n + 1).padStart(5, '0') : null,
    mobile: sibling ? sibling.mobile : '01' + pick(['0', '1', '2', '5']) + String(10000000 + n * 7),
    dateOfBirth: day(`${between(1996, 2014)}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`),
    nationality: chance(0.9) ? 'مصري' : pick(['سوداني', 'سوري', 'سعودي']),
    placeOfBirth: pick(['القاهرة', 'الإسكندرية', 'الجيزة', 'المنصورة'])
  });
}
for (let i = 0; i < students.length; i += 1000) await prisma.student.createMany({ data: students.slice(i, i + 1000) });

// 3. Umbrellas: group (with codes) and private (no code), each open for most branches.
const umbrellas = [];
const addUmbrella = async (name, code, isPrivate, bookPrice, fee, open = branches) => {
  const u = await prisma.course.create({ data: { name, code, isPrivate, bookPrice, branches: open.join(',') } });
  umbrellas.push({ ...u, fee });
  return u;
};
for (const [name, code, book, fee] of [
  ['Starters', '1T2001', 900, 1600], ['Movers', '1T2002', 900, 1700], ['Flyers', '1T2003', 1000, 1800],
  ['KET', '1T1036', 1500, 1800], ['PET', '1T1033', 1200, 2000], ['FCE', '1T1037', 1800, 2400], ['CAE', '1T1040', 2000, 2800]
])
  await addUmbrella(name, code, false, book, fee);
for (const [name, book, fee] of [
  ['KET', 900, 5500], ['PET', 1000, 5500], ['FCE', 1200, 6000], ['IELTS', 1200, 6500], ['CEPT', 0, 3500],
  ['TOEFL', 1500, 7000], ['PTE', 0, 6500], ['Speaking', 0, 5500], ['Conversation', 0, 5500]
])
  await addUmbrella(name, null, true, book, fee, name === 'CEPT' ? ['MIAMI', 'ONLINE', 'FOUAD'] : branches);
const exam = name => ['IELTS', 'CEPT', 'TOEFL', 'PTE'].includes(name);

// 4. Cycles across January to December 2026.
const cycles = [], teams = [], enrollments = [], payments = [], books = [], earnings = [];
const sequences = new Map();
let receipt = 900000;
const nameFor = (umbrella, branch, level, start) => {
  const key = [umbrella.id, branch, level, iso(start).slice(0, 7)].join('|');
  const sequence = (sequences.get(key) || 0) + 1;
  sequences.set(key, sequence);
  return { sequence, name: cycleName(umbrella.name, level, start, sequence) };
};
const teacherFor = branch => {
  const local = employees.filter(e => e.branches.split(',').includes(branch));
  return pick(local.length ? local : employees);
};
const used = new Map(); // students already in a cycle (no double enrollment)
function addCycle({ umbrella, branch, level, start, size, previous, createdBy, approvalStatus = 'APPROVED' }) {
  const id = randomUUID();
  const hours = umbrella.isPrivate ? pick([10, 12, 18.5, 20, 20, 20]) : pick([24, 30, 36, 40]);
  const lengthDays = umbrella.isPrivate ? between(14, 35) : between(30, 60);
  const end = addDays(start, lengthDays);
  const finished = end < TODAY && chance(0.92);
  const naming = nameFor(umbrella, branch, level, start);
  const fee = umbrella.isPrivate ? umbrella.fee * (size > 1 && chance(0.5) ? 1 / size : 1) : umbrella.fee;
  cycles.push({
    id,
    parentCourseId: umbrella.id,
    numberingKey: umbrella.id,
    cycleNumber: level,
    ...naming,
    previousCycleId: previous?.id ?? null,
    chainId: previous?.chainId ?? id,
    chainStart: previous?.chainStart ?? start,
    branch,
    startDate: start,
    endDate: chance(0.85) ? end : null,
    isFinished: finished,
    totalHours: hours,
    courseFee: Math.round(fee),
    venue: pick(['Room 501', 'Room A201', 'Room 12', 'Lab 3', 'Online']),
    classStartTime: pick(['10:00', '13:00', '15:00', '18:00']),
    classEndTime: pick(['12:00', '15:00', '17:00', '20:00']),
    details: 'بيانات تجريبية كبيرة لاختبار الأداء.',
    createdById: createdBy ?? null,
    approvalStatus
  });
  // Employee(s): usually one; sometimes a second whose hours were closed early.
  const lead = teacherFor(branch);
  const team = [{ e: lead, hours: hours }];
  if (!umbrella.isPrivate && chance(0.08)) {
    const other = teacherFor(branch);
    if (other.id !== lead.id) {
      const closedAt = Math.round(hours / 3);
      team[0].hours = hours - closedAt;
      team.push({ e: other, hours: closedAt, closed: true });
    }
  }
  const stage = !finished ? 'RUNNING' : end < addDays(TODAY, -45) ? (chance(0.85) ? 'PAID' : 'PROCESSING') : chance(0.25) ? 'PROCESSING' : 'UNPAID';
  for (const member of team) {
    const ciId = randomUUID();
    const rate = member.e.rate + (umbrella.isPrivate ? 20 : 0);
    teams.push({ id: ciId, courseId: id, instructorId: member.e.id, hourlyRate: rate, hoursTaught: finished || member.closed ? member.hours : null, closedAt: member.closed ? start : null, closedBy: member.closed ? actor : null });
    if (finished || member.closed)
      earnings.push({ courseId: id, instructorId: member.e.id, instructorName: member.e.name, employeeId: member.e.employeeId, cycleName: naming.name, branch, isPrivate: umbrella.isPrivate, hours: member.hours, rate, amountMinor: BigInt(Math.round(member.hours * rate * 100)), stage: member.closed && !finished ? 'UNPAID' : stage, end });
  }
  // Students: never the same student twice in one cycle.
  const roster = new Set();
  while (roster.size < size) roster.add(students[Math.floor(rand() * students.length)]);
  for (const student of roster) {
    const enrollmentId = randomUUID();
    const kind = chance(0.08) ? 'EXEMPT' : chance(0.12) ? 'DISCOUNT' : 'FULL';
    const standard = Math.round(fee);
    const due = kind === 'EXEMPT' ? 0 : kind === 'DISCOUNT' ? Math.round(standard * 0.8) : standard;
    // Most pay in full; a few running cycles still have students who owe.
    const paid = !finished && chance(0.06) ? 0 : !finished && chance(0.05) ? Math.round(due / 2) : due;
    enrollments.push({ id: enrollmentId, courseId: id, studentId: student.id, customFee: due === standard ? null : due, amountPaid: paid, enrolledAt: start });
    used.set(student.id, (used.get(student.id) || 0) + 1);
    if (paid > 0)
      payments.push({ enrollmentId, courseId: id, studentId: student.id, courseName: naming.name, studentName: student.name, amountMinor: BigInt(paid * 100), kind: 'PAYMENT', paymentMethod: pick(['CASH', 'CASH', 'ONLINE', 'CARD']), receiptNumber: String(receipt++), recordedBy: createdBy ? (branchMods.find(m => m.id === createdBy)?.username || actor) : actor, occurredAt: addDays(start, between(0, 6)), note: 'دفعة تجريبية', idempotencyKey: 'large-' + enrollmentId });
    if (umbrella.bookPrice > 0 && chance(0.7))
      books.push({ enrollmentId, activeKey: enrollmentId, status: chance(0.85) ? 'PAID' : 'EXEMPT', amountMinor: 0n, recordedAt: addDays(start, 1), recordedBy: actor, price: umbrella.bookPrice });
  }
  return cycles.at(-1);
}

const groupUmbrellas = umbrellas.filter(u => !u.isPrivate), privateUmbrellas = umbrellas.filter(u => u.isPrivate);
// Group: ~380 cycles of 8-22 students, many running as linked levels (level 1 -> 2 -> 3 in one branch).
for (let i = 0; i < 130; i++) {
  const umbrella = pick(groupUmbrellas);
  const open = umbrella.branches.split(',');
  const branch = pick(open);
  let start = day(`2026-${String(between(1, 10)).padStart(2, '0')}-${String(between(1, 25)).padStart(2, '0')}`);
  let previous = null;
  const levels = between(1, 4);
  for (let level = 1; level <= levels && start < addDays(TODAY, 20); level++) {
    previous = addCycle({ umbrella, branch, level, start, size: between(8, 22), previous });
    start = addDays(start, between(40, 70));
  }
}
// Private: ~620 cycles of 1-3 students; exam umbrellas often have no level.
for (let i = 0; i < 620; i++) {
  const umbrella = pick(privateUmbrellas);
  const branch = pick(umbrella.branches.split(','));
  const level = exam(umbrella.name) && chance(0.7) ? null : between(1, 5);
  const start = day(`2026-${String(between(1, 11)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`);
  if (start > addDays(TODAY, 10)) continue;
  addCycle({ umbrella, branch, level, start, size: pick([1, 1, 1, 2, 2, 3]) });
}
// Branch mods: some cycles they created; a handful still waiting for the main mod's approval.
for (const mod of branchMods)
  for (let i = 0; i < 6; i++) {
    const umbrella = pick(umbrellas);
    if (!umbrella.branches.split(',').includes(mod.branchScope)) continue;
    addCycle({ umbrella, branch: mod.branchScope, level: exam(umbrella.name) ? null : between(1, 3), start: addDays(TODAY, -between(0, 12)), size: umbrella.isPrivate ? 1 : between(4, 10), createdBy: mod.id, approvalStatus: i < 3 ? 'PENDING' : 'APPROVED' });
  }

// 5. Write it all, in chunks.
const chunked = async (model, rows, size = 1000) => {
  for (let i = 0; i < rows.length; i += size) await prisma[model].createMany({ data: rows.slice(i, i + size) });
};
await chunked('cycle', cycles);
await chunked('courseInstructor', teams);
await chunked('enrollment', enrollments);
await chunked('paymentEntry', payments);
await chunked('bookPayment', books.map(({ price, ...b }) => ({ ...b, amountMinor: b.status === 'PAID' ? BigInt(price * 100) : 0n })));

// 6. Payroll: one payment batch per month of payment; PAID and PROCESSING earnings go into batches.
const runs = new Map(), batches = new Map();
const batchRows = [];
for (const e of earnings.filter(x => x.stage !== 'UNPAID')) {
  const init = addDays(e.end, between(3, 15));
  const runKey = iso(init).slice(0, 7);
  if (!runs.has(runKey)) runs.set(runKey, { id: randomUUID(), year: init.getUTCFullYear(), month: init.getUTCMonth() + 1, number: 1, initiatedDate: midnight(runKey + '-15'), initiatedBy: actor });
  const run = runs.get(runKey);
  const key = run.id + ':' + e.instructorId + ':' + e.stage;
  if (!batches.has(key)) {
    const b = { id: randomUUID(), runId: run.id, instructorId: e.instructorId, instructorName: e.instructorName, status: e.stage, initiatedDate: run.initiatedDate, actualPaymentDate: e.stage === 'PAID' ? addDays(run.initiatedDate, between(2, 10)) : null, initiatedBy: actor, paidBy: e.stage === 'PAID' ? actor : null };
    batches.set(key, b);
    batchRows.push(b);
  }
  e.batchId = batches.get(key).id;
}
await chunked('paymentRun', [...runs.values()]);
await chunked('instructorPaymentBatch', batchRows);
await chunked('payrollEarning', earnings.map(({ stage, end, ...e }) => e));

await prisma.systemLog.create({
  data: {
    action: 'ADD_LARGE_TEST_DATA',
    actorUsername: actor,
    category: 'system',
    outcome: 'SUCCESS',
    description: `Added large local test data: ${cycles.length} cycles, ${students.length} students, ${employees.length} employees, ${enrollments.length} enrollments. Accounts untouched.`
  }
});
if ((await prisma.user.count()) !== usersBefore) throw new Error('User accounts changed unexpectedly.');
const counts = {};
for (const model of ['course', 'cycle', 'student', 'instructor', 'enrollment', 'paymentEntry', 'bookPayment', 'payrollEarning', 'instructorPaymentBatch'])
  counts[model] = await prisma[model].count();
console.log(JSON.stringify(counts));
console.log(`Done in ${Math.round((Date.now() - t0) / 1000)} s. All user accounts unchanged.`);
await prisma.$disconnect();
