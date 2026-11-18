import prisma, { atomic } from '../db/prisma.js';
import { logAction } from '../utils/logger.js';
import { canSeePayroll, branchScopeOf, visibleBranchesOf } from '../utils/access.js';
import { EMPLOYEE_BRANCHES } from '../utils/employees.js';
import { sameStudent, sharesPhone, sameName } from '../utils/studentIdentity.js';

// Placement tests. The testing office (user accounts with the "Placement tests" toggle) picks or creates a student
// and enters the score and the level they recommend. A student counts as placed the moment they are enrolled in any
// cycle after their test, however that happened. Admins and the main mod see every branch and place students;
// testers see and enter results for their own branches and can edit them until the student is placed.

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export const canUsePlacements = user => Boolean(user && (canSeePayroll(user) || (user.role === 'user' && user.canPlacementTest)));
// Branches this person may record and see tests for (null: all).
const placementBranches = user => (canSeePayroll(user) ? null : visibleBranchesOf(user) || []);
// Basic student details only: testers never see courses or money.
const studentBasics = { id: true, name: true, englishName: true, mobile: true, registrationNumber: true };

// The levels to choose from: every umbrella name in use, once each (KET in Group and Private is one "KET").
const ORDER = ['STARTERS', 'MOVERS', 'FLYERS', 'KET', 'PET', 'FCE', 'CAE', 'CPE', 'IELTS', 'TOEFL', 'PTE', 'CEPT'];
export async function levelNames() {
  const umbrellas = await prisma.course.findMany({ where: { archivedAt: null }, select: { name: true } });
  const byKey = new Map();
  for (const { name } of umbrellas) {
    const key = name.trim().toUpperCase();
    if (!byKey.has(key)) byKey.set(key, name.trim());
  }
  const rank = key => (ORDER.includes(key) ? ORDER.indexOf(key) : ORDER.length);
  return [...byKey.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)).map(([, name]) => name);
}

// Each test with whether the student has been placed since (the first cycle they joined after the test).
async function withPlacement(tests) {
  if (!tests.length) return [];
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: { in: [...new Set(tests.map(t => t.studentId))] }, deletedAt: null },
    select: { studentId: true, enrolledAt: true, course: { select: { id: true, name: true, branch: true } } },
    orderBy: { enrolledAt: 'asc' }
  });
  return tests.map(test => {
    const joined = enrollments.find(e => e.studentId === test.studentId && e.enrolledAt >= test.createdAt);
    return { ...test, placed: joined ? { at: joined.enrolledAt, cycle: joined.course } : null };
  });
}

function readResult(body, user) {
  const score = Number(body.score);
  if (body.score === '' || body.score == null || !Number.isFinite(score) || score < 0 || score > 100000)
    fail('Enter the score as a number.');
  const level = typeof body.level === 'string' ? body.level.trim() : '';
  if (!level) fail('Choose the recommended level.');
  const branch = typeof body.branch === 'string' ? body.branch.trim().toUpperCase() : '';
  if (!EMPLOYEE_BRANCHES.includes(branch)) fail('Choose the branch.');
  const allowed = placementBranches(user);
  if (allowed && !allowed.includes(branch)) fail(`You can only record tests for ${allowed.join(', ') || 'your branches'}.`, 403);
  return { score, level, branch };
}

// GET /placements?status=unplaced|placed|all&search=&branch=
export const listPlacements = async (req, res, next) => {
  try {
    const status = ['unplaced', 'placed', 'all'].includes(req.query.status) ? req.query.status : 'unplaced';
    const allowed = placementBranches(req.user);
    const branch = typeof req.query.branch === 'string' && req.query.branch ? req.query.branch : null;
    const search = String(req.query.search || '').trim().slice(0, 100);
    const tests = await prisma.placementTest.findMany({
      where: {
        ...(allowed ? { branch: { in: branch ? allowed.filter(b => b === branch) : allowed } } : branch ? { branch } : {}),
        ...(search
          ? {
              student: {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { englishName: { contains: search, mode: 'insensitive' } },
                  { mobile: { contains: search } },
                  { registrationNumber: { contains: search, mode: 'insensitive' } }
                ]
              }
            }
          : {})
      },
      include: { student: { select: studentBasics } },
      orderBy: [{ testedAt: 'desc' }, { id: 'asc' }],
      take: 3000
    });
    const rows = await withPlacement(tests);
    // "Not placed yet" shows each student once, by their latest test.
    const latest = new Set();
    const unplaced = rows.filter(r => !r.placed && !latest.has(r.studentId) && latest.add(r.studentId));
    const placed = rows.filter(r => r.placed);
    res.json({
      rows: status === 'unplaced' ? unplaced : status === 'placed' ? placed : rows,
      counts: { unplaced: unplaced.length, placed: placed.length, all: rows.length },
      levels: await levelNames(),
      branches: allowed || EMPLOYEE_BRANCHES
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
};

// GET /placements/students?search= : basic details only, for picking who took the test.
export const searchStudents = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const digits = search.replace(/[^\d]/g, '');
    const students = await prisma.student.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { englishName: { contains: search, mode: 'insensitive' } },
                { registrationNumber: { contains: search, mode: 'insensitive' } },
                ...(digits.length >= 3 ? [{ mobile: { contains: digits } }] : [])
              ]
            }
          : {})
      },
      select: studentBasics,
      orderBy: { name: 'asc' },
      take: 30
    });
    res.json({ students });
  } catch (error) {
    next(error);
  }
};

// POST /placements { studentId | newStudent: { name, mobile, registrationNumber }, branch, score, level }
export const createPlacement = atomic(async (req, res) => {
  try {
    const result = readResult(req.body, req.user);
    let studentId = req.body.studentId;
    if (studentId) {
      const student = await prisma.student.findFirst({ where: { id: String(studentId), deletedAt: null } });
      if (!student) fail('That student no longer exists.', 404);
    } else {
      const input = req.body.newStudent || {};
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      const mobile = typeof input.mobile === 'string' ? input.mobile.trim() : '';
      const registrationNumber = typeof input.registrationNumber === 'string' ? input.registrationNumber.trim() : '';
      if (!name) fail('Enter the student name.');
      if (name.length > 200 || mobile.length > 100 || registrationNumber.length > 100) fail('Some details are too long.');
      // The same student already exists (same name and phone): say so instead of creating a duplicate.
      const people = await prisma.student.findMany({
        where: { deletedAt: null, OR: [{ mobile: { not: null } }, ...(registrationNumber ? [{ registrationNumber }] : [])] },
        select: { ...studentBasics }
      });
      const existing =
        people.find(s => registrationNumber && s.registrationNumber === registrationNumber) ||
        (mobile ? people.find(s => sameStudent(s, { name, mobile })) : null);
      if (existing && !req.body.createAnyway)
        return res.status(409).json({ error: `${existing.name} already exists.`, existing });
      if (registrationNumber && people.some(s => s.registrationNumber === registrationNumber))
        fail('That registration number belongs to another student.');
      const siblings = mobile ? people.filter(s => sharesPhone(s, mobile) && !sameName(s, name)).map(s => s.name) : [];
      const created = await prisma.student.create({
        data: { name, mobile: mobile || null, registrationNumber: registrationNumber || null }
      });
      studentId = created.id;
      if (siblings.length) res.locals.siblings = siblings;
    }
    const test = await prisma.placementTest.create({
      data: { studentId, ...result, enteredById: req.user.id, enteredBy: req.user.username },
      include: { student: { select: studentBasics } }
    });
    await logAction(
      'ADD_PLACEMENT_TEST',
      `Placement test for ${test.student.name} (${test.branch}): score ${test.score}, recommended ${test.level}.`,
      req.user.username
    );
    res.status(201).json({ ...test, siblings: res.locals.siblings || [] });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

async function editableTest(req) {
  const test = await prisma.placementTest.findUnique({
    where: { id: req.params.id },
    include: { student: { select: studentBasics } }
  });
  if (!test) fail('This test result no longer exists.', 404);
  const allowed = placementBranches(req.user);
  if (allowed && !allowed.includes(test.branch)) fail('This test result is for another branch.', 403);
  const [checked] = await withPlacement([test]);
  if (checked.placed) fail(`${test.student.name} is already placed in ${checked.placed.cycle.name}, so this result is locked.`, 409);
  return test;
}

// PUT /placements/:id: change score, level or branch while the student is not placed yet.
export const updatePlacement = atomic(async (req, res) => {
  try {
    const test = await editableTest(req);
    const result = readResult({ score: test.score, level: test.level, branch: test.branch, ...req.body }, req.user);
    const updated = await prisma.placementTest.update({
      where: { id: test.id },
      data: { ...result, updatedBy: req.user.username },
      include: { student: { select: studentBasics } }
    });
    await logAction(
      'UPDATE_PLACEMENT_TEST',
      `Placement test for ${test.student.name}: score ${test.score} → ${updated.score}, level ${test.level} → ${updated.level}, branch ${updated.branch}.`,
      req.user.username
    );
    res.json(updated);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// DELETE /placements/:id: remove a result entered by mistake, while the student is not placed yet.
export const deletePlacement = atomic(async (req, res) => {
  try {
    const test = await editableTest(req);
    await prisma.placementTest.delete({ where: { id: test.id } });
    await logAction('DELETE_PLACEMENT_TEST', `Deleted the placement test of ${test.student.name} (score ${test.score}, ${test.level}).`, req.user.username);
    res.json({ message: 'Test result deleted.' });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// GET /placements/for-cycle/:cycleId : tested students not placed yet, for "Pick from tested students" when enrolling.
// Anyone who can enroll uses it; branch mods only see their own branch's tests.
export const testedForCycle = async (req, res, next) => {
  try {
    const scope = branchScopeOf(req.user);
    const tests = await prisma.placementTest.findMany({
      where: { ...(scope ? { branch: scope } : {}), student: { deletedAt: null } },
      include: { student: { select: studentBasics } },
      orderBy: { testedAt: 'desc' },
      take: 3000
    });
    const already = new Set(
      (await prisma.enrollment.findMany({ where: { courseId: req.params.cycleId }, select: { studentId: true } })).map(e => e.studentId)
    );
    const seen = new Set();
    const rows = (await withPlacement(tests)).filter(r => !r.placed && !already.has(r.studentId) && !seen.has(r.studentId) && seen.add(r.studentId));
    res.json({ rows });
  } catch (error) {
    next(error);
  }
};

// How many tested students wait to be placed (sidebar badge).
export async function unplacedCount(user) {
  if (!canUsePlacements(user)) return 0;
  const allowed = placementBranches(user);
  const tests = await prisma.placementTest.findMany({
    where: allowed ? { branch: { in: allowed } } : {},
    select: { id: true, studentId: true, createdAt: true },
    orderBy: { testedAt: 'desc' },
    take: 3000
  });
  const seen = new Set();
  return (await withPlacement(tests)).filter(r => !r.placed && !seen.has(r.studentId) && seen.add(r.studentId)).length;
}
