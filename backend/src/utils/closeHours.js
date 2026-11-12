import prisma from '../db/prisma.js';
import { earningData } from './payrollRecord.js';

const fail = (message, status = 409) => {
  throw Object.assign(new Error(message), { status });
};
const round = n => Math.round(n * 100) / 100;

// "Payment batch 2 · October 2026 (paid)": where an earning went, for refusals.
export function batchLabel(batch) {
  if (!batch) return 'a payment batch';
  const month = batch.run
    ? new Date(Date.UTC(batch.run.year, batch.run.month - 1, 1)).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
      })
    : '';
  const name = batch.run ? `Payment batch ${batch.run.number} · ${month}` : 'a payment batch';
  return `${name} (${batch.status === 'PAID' ? 'paid' : 'processing'})`;
}

// Checks a partial close is allowed and returns the cycle and assignment.
export async function closePlan(cycleId, courseInstructorId, value) {
  const cycle = await prisma.cycle.findUnique({
    where: { id: cycleId },
    include: { parentCourse: true, instructors: { include: { instructor: true } } }
  });
  if (!cycle) fail('Cycle not found.', 404);
  if (cycle.archivedAt) fail('Restore the archived cycle first.');
  if (cycle.isFinished) fail('This cycle is completed. Its hours were closed with it.');
  const assignment = cycle.instructors.find(a => a.id === courseInstructorId);
  if (!assignment) fail('Employee assignment not found for this cycle.', 404);
  if (assignment.closedAt) fail(`${assignment.instructor.name}'s hours are already closed.`);
  const total = Number(cycle.totalHours);
  if (!Number.isFinite(total) || total <= 0)
    fail("Set the cycle's total hours first. Closed hours cannot go over it.", 400);
  const hours = Number(value);
  if (value === '' || value === null || !Number.isFinite(hours) || hours <= 0)
    fail('Enter the hours to close, more than 0.', 400);
  const closed = cycle.instructors.filter(a => a.closedAt).reduce((n, a) => n + Number(a.hoursTaught || 0), 0);
  const left = round(total - closed);
  if (hours - left > 0.001)
    fail(`Only ${left} of the cycle's ${total} hours are left to close. Enter ${left} or less.`, 400);
  return { cycle, assignment, hours: round(hours) };
}

// Closes one employee's hours before the cycle ends: the hours are fixed and go to payroll as unpaid earnings.
export async function closeEmployeeHours(cycleId, courseInstructorId, value, actor) {
  const { cycle, assignment, hours } = await closePlan(cycleId, courseInstructorId, value);
  const existing = await prisma.payrollEarning.findUnique({
    where: { courseId_instructorId: { courseId: cycle.id, instructorId: assignment.instructorId } },
    include: { batch: { include: { run: true } } }
  });
  if (existing?.batchId)
    fail(`${assignment.instructor.name} already has earnings for this cycle in ${batchLabel(existing.batch)}.`);
  const updated = await prisma.courseInstructor.update({
    where: { id: assignment.id },
    data: { hoursTaught: hours, closedAt: new Date(), closedBy: actor },
    include: { instructor: true }
  });
  const data = earningData(cycle, updated);
  if (existing) await prisma.payrollEarning.update({ where: { id: existing.id }, data });
  else await prisma.payrollEarning.create({ data });
  return { cycle, assignment: updated, hours };
}

// Undoes a partial close: removes its unpaid earning. Refused once the earning is processing or paid.
export async function reopenEmployeeHours(cycleId, courseInstructorId) {
  const cycle = await prisma.cycle.findUnique({ where: { id: cycleId } });
  if (!cycle) fail('Cycle not found.', 404);
  if (cycle.isFinished) fail('Reopen the completed cycle first, then reopen these hours.');
  const assignment = await prisma.courseInstructor.findUnique({
    where: { id: courseInstructorId },
    include: { instructor: true }
  });
  if (!assignment || assignment.courseId !== cycle.id) fail('Employee assignment not found for this cycle.', 404);
  if (!assignment.closedAt) fail(`${assignment.instructor.name}'s hours are not closed.`);
  const earning = await prisma.payrollEarning.findUnique({
    where: { courseId_instructorId: { courseId: cycle.id, instructorId: assignment.instructorId } },
    include: { batch: { include: { run: true } } }
  });
  if (earning?.batchId)
    fail(
      `${assignment.instructor.name}'s closed hours are already in ${batchLabel(earning.batch)}, so they can't be reopened.`
    );
  if (earning) await prisma.payrollEarning.delete({ where: { id: earning.id } });
  await prisma.courseInstructor.update({
    where: { id: assignment.id },
    data: { hoursTaught: null, closedAt: null, closedBy: null }
  });
  return { cycle, assignment };
}

// Reopening a completed cycle removes the unpaid earnings its completion recorded (hours closed early stay).
// Refused while any of those earnings is processing or paid.
export async function reverseCompletionEarnings(cycleId) {
  const assignments = await prisma.courseInstructor.findMany({
    where: { courseId: cycleId, closedAt: null },
    include: { instructor: true }
  });
  const earnings = await prisma.payrollEarning.findMany({
    where: { courseId: cycleId, instructorId: { in: assignments.map(a => a.instructorId) } },
    include: { batch: { include: { run: true } } }
  });
  const locked = earnings.filter(e => e.batchId);
  if (locked.length)
    fail(
      `This cycle can't be reopened: ${locked.map(e => `${e.instructorName}'s earnings are in ${batchLabel(e.batch)}`).join('; ')}.`
    );
  await prisma.payrollEarning.deleteMany({ where: { id: { in: earnings.map(e => e.id) } } });
  await prisma.courseInstructor.updateMany({
    where: { courseId: cycleId, closedAt: null },
    data: { hoursTaught: null }
  });
  return earnings.length;
}
