import prisma, { atomic } from '../db/prisma.js';
import { EMPLOYEE_BRANCHES } from '../utils/employees.js';
import { canSeePayroll } from '../utils/access.js';
import { logAction } from '../utils/logger.js';
import { deletionPlan, executePlan } from './permanentDeletionController.js';

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const COLOR = /^#[0-9a-f]{6}$/i;
const list = value =>
  String(value || '')
    .split(',')
    .map(b => b.trim())
    .filter(Boolean);

// The live list of active branch codes used by every check (EMPLOYEE_BRANCHES), refreshed from the table.
let loadedAt = 0;
export async function loadBranches(force = false) {
  if (!force && Date.now() - loadedAt < 15000) return;
  const rows = await prisma.branch.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }]
  });
  if (rows.length) EMPLOYEE_BRANCHES.splice(0, EMPLOYEE_BRANCHES.length, ...rows.map(r => r.code));
  loadedAt = Date.now();
}
export const branchesReady = async (req, res, next) => {
  try {
    await loadBranches();
  } catch {
    // Keep the last known list if the table can't be read.
  }
  next();
};

const codeFrom = name =>
  String(name || '')
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
function cleanName(value) {
  const name = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!name || name.length > 60) fail('Branch name must contain 1 to 60 characters.');
  return name;
}

// Everyone signed in reads the branches (active and deleted), for names, colours and filters.
export const listBranches = async (req, res, next) => {
  try {
    const rows = await prisma.branch.findMany({
      orderBy: [{ deletedAt: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }, { code: 'asc' }]
    });
    res.json(
      rows.map(({ deletedBy, ...b }) => ({
        ...b,
        active: !b.deletedAt,
        ...(canSeePayroll(req.user) ? { deletedBy } : {})
      }))
    );
  } catch (error) {
    next(error);
  }
};

export const createBranch = atomic(async (req, res, next) => {
  try {
    const name = cleanName(req.body.name),
      code = codeFrom(req.body.code || name);
    if (!code || code.length < 2) fail('Use letters or numbers in the branch name.');
    if (code.endsWith('-DELETED')) fail('Choose another name.');
    if (await prisma.branch.findUnique({ where: { code } }))
      fail(`A branch with the code ${code} already exists (including deleted branches).`, 409);
    const color = COLOR.test(req.body.color || '') ? req.body.color : '#475569';
    const last = await prisma.branch.aggregate({ _max: { sortOrder: true } });
    const branch = await prisma.branch.create({
      data: { code, name, color, sortOrder: (last._max.sortOrder || 0) + 1 }
    });
    await loadBranches(true);
    await logAction('CREATE_BRANCH', `Added branch ${name} (${code}).`, req.user.username);
    res.status(201).json(branch);
  } catch (error) {
    next(error);
  }
});

// Names and colours can change; the code stays, because the data refers to it.
export const updateBranch = atomic(async (req, res, next) => {
  try {
    const current = await prisma.branch.findUnique({ where: { code: String(req.params.code) } });
    if (!current) fail('Branch not found.', 404);
    if (current.deletedAt) fail('A deleted branch cannot be changed.', 409);
    const data = {};
    if (req.body.name !== undefined) data.name = cleanName(req.body.name);
    if (req.body.color !== undefined) {
      if (!COLOR.test(req.body.color)) fail('Choose a valid colour.');
      data.color = req.body.color;
    }
    const branch = await prisma.branch.update({ where: { code: current.code }, data });
    await logAction(
      'UPDATE_BRANCH',
      `Updated branch ${current.code}: ${current.name} → ${branch.name}, colour ${current.color} → ${branch.color}.`,
      req.user.username
    );
    res.json(branch);
  } catch (error) {
    next(error);
  }
});

// What deleting a branch would touch, shown before the choice is made.
async function impactOf(code) {
  const cycles = await prisma.cycle.findMany({
    where: { branch: code },
    select: { id: true, archivedAt: true, isFinished: true }
  });
  const ids = cycles.map(c => c.id);
  const [enrollments, payments, lockedEarnings, courses, instructors, users] = await Promise.all([
    prisma.enrollment.count({ where: { courseId: { in: ids } } }),
    prisma.paymentEntry.count({ where: { courseId: { in: ids } } }),
    prisma.payrollEarning.count({ where: { courseId: { in: ids }, batchId: { not: null } } }),
    prisma.course.findMany({ where: { branches: { contains: code } }, select: { id: true, branches: true } }),
    prisma.instructor.findMany({ where: { branches: { contains: code } }, select: { id: true, branches: true } }),
    prisma.user.findMany({
      where: { OR: [{ branchScope: code }, { branches: { contains: code } }] },
      select: { id: true, username: true, role: true, branchScope: true, branches: true }
    })
  ]);
  return {
    cycles: cycles.length,
    activeCycles: cycles.filter(c => !c.archivedAt && !c.isFinished).length,
    enrollments,
    payments,
    lockedEarnings,
    umbrellas: courses.filter(c => list(c.branches).includes(code)).length,
    employees: instructors.filter(i => list(i.branches).includes(code)).length,
    branchMods: users.filter(u => u.role === 'mod' && u.branchScope === code).map(u => u.username),
    users: users.filter(u => u.role === 'user' && list(u.branches).includes(code)).length
  };
}
export const branchImpact = async (req, res, next) => {
  try {
    const branch = await prisma.branch.findUnique({ where: { code: String(req.params.code) } });
    if (!branch) fail('Branch not found.', 404);
    res.json({ branch, ...(await impactOf(branch.code)) });
  } catch (error) {
    next(error);
  }
};

// Takes the branch out of umbrellas, employees and users; its branch mods are banned (accounts kept).
async function detach(code, keptAs) {
  const without = value => list(value).filter(b => b !== code);
  for (const c of await prisma.course.findMany({ where: { branches: { contains: code } } }))
    if (list(c.branches).includes(code))
      await prisma.course.update({ where: { id: c.id }, data: { branches: without(c.branches).join(',') } });
  for (const i of await prisma.instructor.findMany({ where: { branches: { contains: code } } }))
    if (list(i.branches).includes(code))
      await prisma.instructor.update({ where: { id: i.id }, data: { branches: without(i.branches).join(',') } });
  for (const u of await prisma.user.findMany({
    where: { OR: [{ branchScope: code }, { branches: { contains: code } }] }
  })) {
    const data = {};
    if (list(u.branches).includes(code)) data.branches = without(u.branches).join(',') || null;
    // A branch mod of a deleted branch keeps their account, banned; their scope points at the kept data.
    if (u.role === 'mod' && u.branchScope === code)
      Object.assign(data, { isBanned: true, branchScope: keptAs || code });
    if (Object.keys(data).length) await prisma.user.update({ where: { id: u.id }, data });
  }
}

export const deleteBranch = atomic(
  async (req, res, next) => {
    try {
      const branch = await prisma.branch.findUnique({ where: { code: String(req.params.code) } });
      if (!branch) fail('Branch not found.', 404);
      if (branch.deletedAt) fail('This branch is already deleted.', 409);
      if (!['KEEP', 'DELETE_DATA'].includes(req.body?.mode))
        fail('Choose whether to keep or delete the branch’s data.');
      if (req.body.confirm !== true) fail('Confirm deleting the branch.');
      if ((await prisma.branch.count({ where: { deletedAt: null } })) <= 1) fail('Keep at least one branch.', 409);
      const impact = await impactOf(branch.code);
      let message;
      if (req.body.mode === 'KEEP') {
        // The data stays, renamed to <CODE>-DELETED so nothing is lost and nothing new is added to it.
        let keptAs = `${branch.code}-DELETED`;
        for (let n = 2; await prisma.branch.findUnique({ where: { code: keptAs } }); n++)
          keptAs = `${branch.code}-DELETED-${n}`;
        await prisma.cycle.updateMany({ where: { branch: branch.code }, data: { branch: keptAs } });
        await prisma.payrollEarning.updateMany({ where: { branch: branch.code }, data: { branch: keptAs } });
        await prisma.moneyCheck.updateMany({ where: { branch: branch.code }, data: { branch: keptAs } });
        await prisma.payrollRecord.updateMany({ where: { branch: branch.code }, data: { branch: keptAs } });
        await detach(branch.code, keptAs);
        await prisma.branch.create({
          data: {
            code: keptAs,
            name: `${branch.name} (deleted)`,
            color: branch.color,
            sortOrder: branch.sortOrder,
            deletedAt: new Date(),
            deletedBy: req.user.username,
            createdAt: branch.createdAt
          }
        });
        await prisma.branch.delete({ where: { code: branch.code } });
        message = `${branch.name} deleted. Its ${impact.cycles} cycles and their money are kept under ${keptAs}.`;
      } else {
        // Everything in the branch is removed. Paid or processing employee earnings can't be deleted.
        if (impact.lockedEarnings)
          fail(
            `${branch.name} has employee earnings in payment batches, which can't be deleted. Choose to keep the data instead.`,
            409
          );
        const cycles = await prisma.cycle.findMany({ where: { branch: branch.code }, select: { id: true } });
        const students = new Set(
          (
            await prisma.enrollment.findMany({
              where: { courseId: { in: cycles.map(c => c.id) } },
              select: { studentId: true }
            })
          ).map(e => e.studentId)
        );
        // Later levels first, so links between levels never block a deletion.
        const ordered = await prisma.cycle.findMany({
          where: { branch: branch.code },
          orderBy: { startDate: 'desc' },
          select: { id: true }
        });
        for (const { id } of ordered) await executePlan('cycle', await deletionPlan('cycle', id), req.user.username);
        // Students who only studied in this branch have nothing left anywhere: their profiles go too.
        const orphans = await prisma.student.findMany({
          where: { id: { in: [...students] }, enrollments: { none: {} } },
          select: { id: true }
        });
        await prisma.student.deleteMany({ where: { id: { in: orphans.map(s => s.id) } } });
        await prisma.moneyCheck.deleteMany({ where: { branch: branch.code } });
        await detach(branch.code, null);
        await prisma.branch.delete({ where: { code: branch.code } });
        message = `${branch.name} and all its data were deleted: ${impact.cycles} cycles, ${impact.enrollments} enrollments, ${orphans.length} student profiles.`;
      }
      await loadBranches(true);
      await logAction(
        req.body.mode === 'KEEP' ? 'DELETE_BRANCH_KEEP_DATA' : 'DELETE_BRANCH_AND_DATA',
        `${message} Umbrellas updated: ${impact.umbrellas}, employees: ${impact.employees}, users: ${impact.users}; branch mods banned: ${impact.branchMods.join(', ') || 'none'}.`,
        req.user.username
      );
      res.json({ message, impact });
    } catch (error) {
      next(error);
    }
  },
  { timeout: 120000 }
);
