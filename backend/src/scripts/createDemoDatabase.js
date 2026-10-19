import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Generate synthetic data from an empty schema. Never read the working database.
const backend = fileURLToPath(new URL('../../', import.meta.url));
const directory = join(backend, 'demo');
mkdirSync(directory, { recursive: true });
const output = join(directory, 'demo.db');
if (existsSync(output) && !process.argv.includes('--replace')) throw new Error('Demo database already exists. Use --replace to regenerate only this synthetic fixture.');
const temporary = join(directory, `fixture-${randomUUID()}.db`);
const client = new PrismaClient({ datasources: { db: { url: 'file:' + temporary.split(sep).join('/') } } });
const sql = execFileSync(process.execPath, [join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', join(backend, 'prisma/schema.prisma'), '--script'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'file:./unused.db' } });
const date = value => new Date(value + 'T12:00:00Z');
try {
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await client.$executeRawUnsafe(statement);
  await client.$transaction(async tx => {
    for (const [username, role] of [['main-admin','admin'], ['demo-mod','mod'], ['demo-user','user']]) await tx.user.create({ data: { id: 'demo-' + role, username, role, password: null, firstName: 'Demo', lastName: role, email: username + '@example.invalid' } });
    const teachers = [];
    for (let n = 1; n <= 3; n++) teachers.push(await tx.instructor.create({ data: { id: 'demo-instructor-' + n, name: 'Demo Instructor ' + n, employeeId: 'DEMO-I' + n, branches: 'MIAMI,FOUAD', mobile: null } }));
    const students = [];
    for (let n = 1; n <= 8; n++) students.push(await tx.student.create({ data: { id: 'demo-student-' + n, name: n % 2 ? 'Demo Student ' + n : 'طالب تجريبي ' + n, registrationNumber: 'DEMO-S' + String(n).padStart(3, '0'), mobile: null } }));
    const specs = [
      { id: 'demo-course-analysis', name: 'Demo · Data Analysis', branch: 'MIAMI', startDate: date('2026-10-01'), endDate: date('2026-10-15'), totalHours: 24, courseFee: 1000, isFinished: true, isPaid: false, payrollMonth: '2026-10', allocations: [[0,12,250],[1,12,300]], enrollments: [[0,1000,null],[1,400,null],[2,0,null],[3,0,0]] },
      { id: 'demo-course-business', name: 'Demo · Business English', branch: 'FOUAD', startDate: date('2026-10-02'), endDate: date('2026-10-16'), totalHours: 10, courseFee: 800, isFinished: true, isPaid: true, payrollMonth: '2026-10', allocations: [[2,10,150]], enrollments: [[4,800,null]] },
      { id: 'demo-course-programming', name: 'Demo · Programming', branch: 'MIAMI', startDate: date('2026-10-05'), endDate: date('2026-11-20'), totalHours: 30, courseFee: 1200, isFinished: false, isPaid: false, payrollMonth: null, allocations: [[0,null,250]], enrollments: [[5,300,null],[6,0,null]] },
      { id: 'demo-course-planning', name: 'Demo · Course Planning', branch: 'FOUAD', startDate: null, endDate: null, totalHours: 12, courseFee: 600, isFinished: false, isPaid: false, payrollMonth: null, allocations: [], enrollments: [[7,0,null]] }
    ];
    for (const spec of specs) {
      const { allocations, enrollments, ...data } = spec;
      const course = await tx.course.create({ data: { ...data, details: 'Synthetic fixture for disposable testing only.', createdAt: date('2026-10-01') } });
      for (const [index, hoursTaught, hourlyRate] of allocations) await tx.courseInstructor.create({ data: { courseId: course.id, instructorId: teachers[index].id, hoursTaught, hourlyRate } });
      if (course.isFinished) {
        const instructors = await tx.courseInstructor.findMany({ where: { courseId: course.id }, include: { instructor: true } });
        await tx.payrollRecord.create({ data: { courseId: course.id, name: course.name, branch: course.branch, totalHours: course.totalHours, payrollMonth: course.payrollMonth, isPaid: course.isPaid, instructors: JSON.stringify(instructors) } });
      }
      for (const [index, amountPaid, customFee] of enrollments) {
        const enrollment = await tx.enrollment.create({ data: { courseId: course.id, studentId: students[index].id, amountPaid, customFee, enrolledAt: date('2026-10-06') } });
        if (amountPaid) await tx.paymentEntry.create({ data: { enrollmentId: enrollment.id, courseId: course.id, studentId: students[index].id, courseName: course.name, studentName: students[index].name, amountMinor: BigInt(amountPaid * 100), kind: 'PAYMENT', note: 'Synthetic demo payment; no real money.', recordedBy: 'main-admin', occurredAt: date('2026-10-06'), idempotencyKey: 'demo-' + enrollment.id } });
      }
    }
    await tx.systemLog.create({ data: { action: 'DEMO_FIXTURE', actorUsername: 'main-admin', description: 'Synthetic demo initialized. Contains no real personal information or login credentials.' } });
  });
  const foreignKeys = await client.$queryRawUnsafe('PRAGMA foreign_key_check');
  if (foreignKeys.length) throw new Error('Demo fixture foreign key validation failed.');
} finally { await client.$disconnect(); }
renameSync(temporary, output);
console.log('Synthetic demo database generated. Account passwords are unset; configure a private bootstrap hash at runtime.');
