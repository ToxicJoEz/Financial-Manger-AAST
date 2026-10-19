import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const version = '20261019_enrollment_and_payroll';
try {
  const prior = await prisma.$queryRawUnsafe('SELECT version FROM ApplicationUpgrade WHERE version = ?', version);
  if (prior.length) console.log('Enrollment/payroll preservation upgrade already applied.');
  else {
    const sql = await readFile(new URL('../../prisma/upgrades/20261019_enrollment_and_payroll.sql', import.meta.url), 'utf8');
    await prisma.$transaction(async tx => {
      for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      const courses = await tx.course.findMany({ where: { OR: [{ isFinished: true }, { isPaid: true }, { payrollMonth: { not: null } }] }, include: { instructors: { include: { instructor: true } } } });
      for (const course of courses) await tx.payrollRecord.create({ data: { courseId: course.id, name: course.name, branch: course.branch, totalHours: course.totalHours || 0, payrollMonth: course.payrollMonth, isPaid: course.isPaid, instructors: JSON.stringify(course.instructors) } });
      await tx.$executeRawUnsafe('INSERT INTO ApplicationUpgrade (version) VALUES (?)', version);
    }, { timeout: 30000 });
    console.log('Enrollment archival, instructor replacement, and persistent payroll records upgraded. Existing balances and payments retained.');
  }
} finally { await prisma.$disconnect(); }
