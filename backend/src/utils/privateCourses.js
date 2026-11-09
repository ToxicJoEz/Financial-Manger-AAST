import prisma from '../db/prisma.js';
import { PRIVATE_SEAT_LIMIT } from './privateSeat.js';

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export const CYCLE_NUMBER_MAX = 2147483647;

export function parseCycleNumber(value) {
  const number = Number(value);
  if (
    !['number', 'string'].includes(typeof value) ||
    !Number.isInteger(number) ||
    number < 1 ||
    number > CYCLE_NUMBER_MAX
  )
    fail('Cycle number must be a whole number between 1 and 2,147,483,647.');
  return number;
}

// Sub-umbrella names behave like umbrella names: trimmed, upper-case, 1–120 characters.
export function subCourseName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120)
    fail('Sub-umbrella name must contain 1 to 120 characters.');
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

// Where a cycle's number and name come from: the umbrella for group courses, the sub-umbrella for private ones.
export async function cycleScope(parent, subCourseId) {
  if (!parent.isPrivate) {
    if (subCourseId) fail('Group courses have no sub-umbrellas.');
    return { numberingKey: parent.id, subCourse: null, prefix: parent.name };
  }
  if (typeof subCourseId !== 'string' || !subCourseId) fail('Choose a sub-umbrella for this private cycle.');
  const subCourse = await prisma.subCourse.findFirst({ where: { id: subCourseId, parentCourseId: parent.id } });
  if (!subCourse) fail('Choose a sub-umbrella of this private course.');
  if (subCourse.archivedAt) fail('Restore this sub-umbrella before adding cycles to it.', 409);
  return { numberingKey: subCourse.id, subCourse, prefix: subCourse.name };
}

export async function nextCycleNumber(numberingKey) {
  const { _max } = await prisma.cycle.aggregate({ where: { numberingKey }, _max: { cycleNumber: true } });
  const highest = _max.cycleNumber || 0;
  return highest < CYCLE_NUMBER_MAX ? highest + 1 : null;
}

export async function cycleNumberTaken(numberingKey, cycleNumber, exceptId) {
  const existing = await prisma.cycle.findUnique({
    where: { numberingKey_cycleNumber: { numberingKey, cycleNumber } },
    select: { id: true }
  });
  return Boolean(existing && existing.id !== exceptId);
}

export async function assertPrivateSeat(course) {
  if (
    course.parentCourse?.isPrivate &&
    (await prisma.enrollment.count({ where: { courseId: course.id } })) >= PRIVATE_SEAT_LIMIT
  )
    throw Object.assign(new Error(`This private cycle has reached the maximum of ${PRIVATE_SEAT_LIMIT} students.`), {
      status: 409
    });
}

// Book prices come from the umbrella for group cycles and from the sub-umbrella for private cycles.
export const cycleBookPrice = cycle =>
  (cycle.parentCourse?.isPrivate ? cycle.subCourse?.bookPrice : cycle.parentCourse?.bookPrice) || 0;

export const privateLabel = (name, isPrivate) => (isPrivate ? `${name} (Private)` : name);
