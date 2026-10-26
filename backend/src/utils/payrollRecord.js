import prisma from '../db/prisma.js';
import { moneyMinor } from './numbers.js';
const fail = message => { throw Object.assign(new Error(message), { status: 409 }); };

export function earningData(course, assignment) {
  const hours = Number(assignment.hoursTaught), rate = Number(assignment.hourlyRate);
  if (assignment.hoursTaught == null || !Number.isFinite(hours) || hours < 0 || !Number.isFinite(rate) || rate < 0) fail('Confirm the teaching hours and rates for every instructor before recording payroll.');
  return { isPrivate:Boolean(course.parentCourse?.isPrivate),courseId: course.id, instructorId: assignment.instructorId, cycleName: course.name, branch: course.branch,
    instructorName: assignment.instructor?.name || 'Unknown instructor', employeeId: assignment.instructor?.employeeId || null,
    hours, rate, amountMinor: moneyMinor(Math.round(hours * rate * 100) / 100, 'Instructor earnings') };
}

// Completion records earnings, never a payment date or a payment month.
export async function savePayrollRecord(courseId) {
  const course = await prisma.cycle.findUnique({ where: { id: courseId }, include: { parentCourse:true,instructors: { include: { instructor: true } } } });
  const existing = await prisma.payrollEarning.findMany({ where: { courseId } });
  const proposed = course.instructors.map(a => earningData(course, a));
  for (const earning of existing.filter(e => e.batchId)) {
    const next = proposed.find(p => p.instructorId === earning.instructorId);
    if (!next || next.hours !== earning.hours || next.rate !== earning.rate || next.amountMinor !== earning.amountMinor) fail('Earnings already included in a processing or paid batch cannot be changed. Their payment history has been preserved.');
  }
  await prisma.payrollEarning.deleteMany({ where: { courseId, batchId: null, instructorId: { notIn: proposed.map(p => p.instructorId) } } });
  for (const data of proposed) {
    const prior = existing.find(e => e.instructorId === data.instructorId);
    if (prior?.batchId) continue;
    if (prior) await prisma.payrollEarning.update({ where: { id: prior.id }, data });
    else await prisma.payrollEarning.create({ data });
  }
}

export const earningView = earning => ({ ...earning, amountMinor: earning.amountMinor.toString(), amount: Number(earning.amountMinor) / 100, status: earning.batch?.status || 'UNPAID' });
