import prisma from '../db/prisma.js';
import { PRIVATE_SEAT_LIMIT } from './privateSeat.js';

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
// Cycle levels are entered by the mod: any whole number from 1 up.
export const LEVEL_MAX = 2147483647;
export function parseLevel(value) {
  const level = Number(value);
  if (!['number', 'string'].includes(typeof value) || !Number.isInteger(level) || level < 1 || level > LEVEL_MAX)
    fail('Level must be a whole number from 1 up.');
  return level;
}
export const startMonthLabel = date =>
  new Date(date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
// "KET 1 - November 2026", and "KET 1 - November 2026 (2)" for the second one in the same branch and month.
export const cycleName = (prefix, level, startDate, sequence = 1) =>
  `${prefix} ${level} - ${startMonthLabel(startDate)}${sequence > 1 ? ` (${sequence})` : ''}`;

// The lowest free "(n)" for this umbrella, branch, level and start month.
export async function nextSequence({ numberingKey, branch, level, startDate, exceptId }) {
  const start = new Date(startDate);
  const from = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)),
    to = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const used = new Set(
    (
      await prisma.cycle.findMany({
        where: {
          numberingKey,
          branch,
          cycleNumber: level,
          startDate: { gte: from, lt: to },
          ...(exceptId ? { id: { not: exceptId } } : {})
        },
        select: { sequence: true }
      })
    ).map(c => c.sequence)
  );
  let sequence = 1;
  while (used.has(sequence)) sequence++;
  return sequence;
}
// Name and sequence for a cycle, ready to save.
export async function namedCycle({ prefix, numberingKey, branch, level, startDate, exceptId }) {
  const sequence = await nextSequence({ numberingKey, branch, level, startDate, exceptId });
  return { sequence, name: cycleName(prefix, level, startDate, sequence) };
}

// Umbrellas list the branches allowed to run their cycles.
export const umbrellaBranches = course =>
  String(course?.branches || '')
    .split(',')
    .map(b => b.trim())
    .filter(Boolean);
export function assertUmbrellaBranch(course, branch) {
  if (!umbrellaBranches(course).includes(branch))
    fail(
      `${course.name} is not open for ${branch}. The main mod can open it for that branch on the umbrella card.`,
      409
    );
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

// Linking a new cycle as the next level of an earlier one: same umbrella (or sub-umbrella) and same branch.
// Returns the link fields to save; a cycle without a previous level starts its own chain.
export async function levelLink({ previousCycleId, numberingKey, branch, id, startDate }) {
  if (!previousCycleId) return { previousCycleId: null, chainId: id, chainStart: startDate };
  if (typeof previousCycleId !== 'string') fail('Choose the cycle this level follows.');
  const previous = await prisma.cycle.findUnique({
    where: { id: previousCycleId },
    select: {
      id: true,
      numberingKey: true,
      branch: true,
      chainId: true,
      chainStart: true,
      startDate: true,
      archivedAt: true
    }
  });
  if (!previous) fail('The cycle this level follows no longer exists.', 404);
  if (previous.numberingKey !== numberingKey || previous.branch !== branch)
    fail('A next level must be in the same umbrella and branch as the cycle it follows.', 409);
  if (previous.startDate && startDate && new Date(startDate) < previous.startDate)
    fail('A next level cannot start before the level it follows.');
  return {
    previousCycleId: previous.id,
    chainId: previous.chainId || previous.id,
    chainStart: previous.chainStart || previous.startDate
  };
}
