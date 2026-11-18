import prisma, { atomic } from '../db/prisma.js';
import { checkPhone } from '../utils/people.js';
import { logAction } from '../utils/logger.js';
import { canSeePayroll, branchScopeOf, visibleBranchesOf } from '../utils/access.js';
import { EMPLOYEE_BRANCHES } from '../utils/employees.js';
import { sameStudent, sharesPhone, sameName } from '../utils/studentIdentity.js';

// Placement tests.
// 1. Admins and the main mod create a test: they pick or create the student and choose the branch.
// 2. The testing office (user accounts with the "Placement tests" toggle) fills in the result for tests in their
//    branches: the score out of 55, the level they recommend and the test's purpose.
// 3. Admins and the main mod place the student in a cycle. A student counts as placed the moment they join any cycle
//    after the test, however that happened. Results can be changed until then.

export const MAX_SCORE = 55;
export const PURPOSES = ['General English', 'IELTS', 'TOEFL', 'PTE'];
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export const canUsePlacements = user =>
  Boolean(user && (canSeePayroll(user) || branchScopeOf(user) || (user.role === 'user' && user.canPlacementTest)));
// Creating tests (and picking or creating their student): admins, the main mod and branch mods (their own branch).
// Placing students in a course stays with admins and the main mod.
export const canCreateTests = user => Boolean(user && (canSeePayroll(user) || branchScopeOf(user)));
// Branches this person sees tests for (null: all).
const placementBranches = user => (canSeePayroll(user) ? null : visibleBranchesOf(user) || []);
// Basic student details only: testers never see courses or money.
const studentBasics = { id: true, name: true, englishName: true, mobile: true, registrationNumber: true };
const hasResult = t => t.score != null;

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
// Splits tests into the tabs: waiting for a result, waiting to be placed (each student once, latest test), placed.
function sortTests(rows) {
  const seen = new Set();
  const unplaced = rows.filter(r => !r.placed && hasResult(r) && !seen.has(r.studentId) && seen.add(r.studentId));
  return {
    awaiting: rows.filter(r => !r.placed && !hasResult(r)),
    unplaced,
    placed: rows.filter(r => r.placed)
  };
}

function readBranch(value) {
  const branch = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!EMPLOYEE_BRANCHES.includes(branch)) fail('Choose the branch.');
  return branch;
}
function readResult(body) {
  const score = Number(body.score);
  if (body.score === '' || body.score == null || !Number.isFinite(score) || score < 0 || score > MAX_SCORE)
    fail(`Enter the score: a number from 0 to ${MAX_SCORE}.`);
  const level = typeof body.level === 'string' ? body.level.trim() : '';
  if (!level) fail('Choose the recommended level.');
  const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : '';
  if (!PURPOSES.includes(purpose)) fail(`Choose the purpose: ${PURPOSES.join(', ')}.`);
  return { score, level, purpose };
}

// GET /placements?status=awaiting|unplaced|placed|all&search=&branch=
export const listPlacements = async (req, res, next) => {
  try {
    const status = ['awaiting', 'unplaced', 'placed', 'all'].includes(req.query.status) ? req.query.status : 'unplaced';
    const allowed = placementBranches(req.user);
    const branch = typeof req.query.branch === 'string' && req.query.branch ? req.query.branch : null;
    const search = String(req.query.search || '').trim().slice(0, 100);
    // Filters: recommended level ("KET") and purpose ("IELTS").
    const level = typeof req.query.level === 'string' && req.query.level ? req.query.level : null;
    const purpose = typeof req.query.purpose === 'string' && req.query.purpose ? req.query.purpose : null;
    const tests = await prisma.placementTest.findMany({
      where: {
        ...(level ? { level: { equals: level, mode: 'insensitive' } } : {}),
        ...(purpose ? { purpose } : {}),
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
    const tabs = sortTests(rows);
    res.json({
      rows: status === 'all' ? rows : tabs[status],
      counts: { awaiting: tabs.awaiting.length, unplaced: tabs.unplaced.length, placed: tabs.placed.length, all: rows.length },
      levels: await levelNames(),
      purposes: PURPOSES,
      maxScore: MAX_SCORE,
      branches: allowed || EMPLOYEE_BRANCHES
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
};

// GET /placements/students?search= : basic details only, for picking who takes the test (admins and the main mod).
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

// POST /placements { studentId | newStudent: { name, mobile, registrationNumber }, branch } — admins and the main mod.
// Creates the test; the result is filled in by the testing office.
export const createPlacement = atomic(async (req, res) => {
  try {
    const branch = readBranch(req.body.branch);
    const allowed = placementBranches(req.user);
    if (allowed && !allowed.includes(branch)) fail(`You can only create tests for ${allowed.join(', ') || 'your branch'}.`, 403);
    let studentId = req.body.studentId;
    let siblings = [];
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
      checkPhone(mobile);
      // The same student already exists (same name and phone): say so instead of creating a duplicate.
      const people = await prisma.student.findMany({
        where: { deletedAt: null, OR: [{ mobile: { not: null } }, ...(registrationNumber ? [{ registrationNumber }] : [])] },
        select: { ...studentBasics }
      });
      const existing =
        people.find(s => registrationNumber && s.registrationNumber === registrationNumber) ||
        (mobile ? people.find(s => sameStudent(s, { name, mobile })) : null);
      if (existing && !req.body.createAnyway) return res.status(409).json({ error: `${existing.name} already exists.`, existing });
      if (registrationNumber && people.some(s => s.registrationNumber === registrationNumber))
        fail('That registration number belongs to another student.');
      siblings = mobile ? people.filter(s => sharesPhone(s, mobile) && !sameName(s, name)).map(s => s.name) : [];
      const created = await prisma.student.create({
        data: { name, mobile: mobile || null, registrationNumber: registrationNumber || null }
      });
      studentId = created.id;
    }
    const test = await prisma.placementTest.create({
      data: { studentId, branch, enteredById: req.user.id, enteredBy: req.user.username },
      include: { student: { select: studentBasics } }
    });
    await logAction('ADD_PLACEMENT_TEST', `Created a placement test for ${test.student.name} (${branch}); waiting for the result.`, req.user.username);
    res.status(201).json({ ...test, siblings });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

async function openTest(req) {
  const test = await prisma.placementTest.findUnique({ where: { id: req.params.id }, include: { student: { select: studentBasics } } });
  if (!test) fail('This test no longer exists.', 404);
  const allowed = placementBranches(req.user);
  if (allowed && !allowed.includes(test.branch)) fail('This test is for another branch.', 403);
  // Admins and the main mod can correct a test at any time; for the testing office it locks once the student is placed.
  if (canSeePayroll(req.user)) return test;
  const [checked] = await withPlacement([test]);
  if (checked.placed) fail(`${test.student.name} is already placed in ${checked.placed.cycle.name}, so this test is locked.`, 409);
  return test;
}

// PUT /placements/:id { score, level, purpose, branch? } — the result (testers and managers), until the student is
// placed. Only admins and the main mod change the branch.
export const updatePlacement = atomic(async (req, res) => {
  try {
    const test = await openTest(req);
    // The result (all three fields) is checked whenever one is given, or the test already has one. Admins and the main
    // mod may also change only the branch of a test still waiting for its result.
    const givesResult = ['score', 'level', 'purpose'].some(k => req.body[k] !== undefined && req.body[k] !== '');
    const data = { updatedBy: req.user.username };
    if (givesResult || hasResult(test)) {
      Object.assign(data, readResult({ score: test.score, level: test.level, purpose: test.purpose, ...req.body }));
      if (!hasResult(test)) Object.assign(data, { resultBy: req.user.username, resultAt: new Date() });
    } else if (!canSeePayroll(req.user)) readResult(req.body);
    if (req.body.branch !== undefined && req.body.branch !== test.branch) {
      if (!canSeePayroll(req.user)) fail('Only admins and the main mod can change the branch.', 403);
      data.branch = readBranch(req.body.branch);
    }
    const updated = await prisma.placementTest.update({ where: { id: test.id }, data, include: { student: { select: studentBasics } } });
    await logAction(
      'UPDATE_PLACEMENT_TEST',
      !hasResult(updated)
        ? `Changed ${test.student.name}'s placement test: branch ${test.branch} → ${updated.branch}.`
        : hasResult(test)
        ? `Changed ${test.student.name}'s placement result: ${test.score}/${MAX_SCORE} ${test.level} → ${updated.score}/${MAX_SCORE} ${updated.level} (${updated.purpose}).`
        : `Entered ${test.student.name}'s placement result: ${updated.score}/${MAX_SCORE}, recommended ${updated.level}, purpose ${updated.purpose}.`,
      req.user.username
    );
    res.json(updated);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// DELETE /placements/:id — admins and the main mod, while the student is not placed yet.
export const deletePlacement = atomic(async (req, res) => {
  try {
    if (!canSeePayroll(req.user)) fail('Only admins and the main mod can delete placement tests.', 403);
    const test = await openTest(req);
    // A placed student's test stays (it is their history); it can still be corrected.
    const [checked] = await withPlacement([test]);
    if (checked.placed) fail(`${test.student.name} is already placed in ${checked.placed.cycle.name}. Edit the test instead of deleting it.`, 409);
    await prisma.placementTest.delete({ where: { id: test.id } });
    await logAction('DELETE_PLACEMENT_TEST', `Deleted the placement test of ${test.student.name}${hasResult(test) ? ` (${test.score}/${MAX_SCORE}, ${test.level})` : ''}.`, req.user.username);
    res.json({ message: 'Test deleted.' });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// GET /placements/for-cycle/:cycleId : tested students with a result, not placed yet ("Pick from tested students").
// Anyone who can enroll uses it; branch mods only see their own branch's tests.
export const testedForCycle = async (req, res, next) => {
  try {
    const scope = branchScopeOf(req.user);
    const tests = await prisma.placementTest.findMany({
      where: { ...(scope ? { branch: scope } : {}), score: { not: null }, student: { deletedAt: null } },
      include: { student: { select: studentBasics } },
      orderBy: { testedAt: 'desc' },
      take: 3000
    });
    const already = new Set(
      (await prisma.enrollment.findMany({ where: { courseId: req.params.cycleId }, select: { studentId: true } })).map(e => e.studentId)
    );
    const rows = sortTests(await withPlacement(tests)).unplaced.filter(r => !already.has(r.studentId));
    res.json({ rows, maxScore: MAX_SCORE });
  } catch (error) {
    next(error);
  }
};

// Sidebar badge: testers see tests waiting for their result; admins and the main mod see students waiting to be placed.
export async function unplacedCount(user) {
  if (!canUsePlacements(user)) return 0;
  const allowed = placementBranches(user);
  const tests = await prisma.placementTest.findMany({
    where: allowed ? { branch: { in: allowed } } : {},
    select: { id: true, studentId: true, createdAt: true, score: true },
    orderBy: { testedAt: 'desc' },
    take: 3000
  });
  const tabs = sortTests(await withPlacement(tests));
  return canSeePayroll(user) ? tabs.unplaced.length : tabs.awaiting.length;
}
