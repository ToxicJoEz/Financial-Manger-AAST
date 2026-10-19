import prisma from '../db/prisma.js';
export async function savePayrollRecord(courseId) {
  const course = await prisma.cycle.findUnique({ where: { id: courseId }, include: { instructors: { include: { instructor: true } } } });
  const existing = await prisma.payrollRecord.findUnique({ where: { courseId } });
  const instructors = JSON.stringify(course.instructors);
  if (existing?.isPaid) {
    const shape = rows => rows.map(row => ({ id: row.instructorId, rate: row.hourlyRate, hours: row.hoursTaught })).sort((a,b) => a.id.localeCompare(b.id));
    if (JSON.stringify(shape(JSON.parse(existing.instructors))) !== JSON.stringify(shape(course.instructors)) || existing.payrollMonth !== course.payrollMonth) {
      throw Object.assign(new Error('The paid payroll record has been preserved. Explicitly mark it unpaid before changing its allocation or payroll month; the original payment state remains in the audit history.'), { status: 409 });
    }
  }
  const data = { name: course.name, branch: course.branch, totalHours: course.totalHours || 0, payrollMonth: course.payrollMonth, isPaid: course.isPaid, instructors };
  if (existing) await prisma.payrollRecord.update({ where: { id: existing.id }, data });
  else await prisma.payrollRecord.create({ data: { courseId, ...data } });
}
