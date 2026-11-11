import prisma, { atomic } from '../db/prisma.js';
import { moneyMinor } from '../utils/numbers.js';
import { isManager } from '../utils/courseView.js';
import { visibleBranchesOf } from '../utils/access.js';
import { logAction } from '../utils/logger.js';
import { subCourseName, cycleName, umbrellaBranches } from '../utils/privateCourses.js';

// Sub-umbrellas organize private cycles (e.g. KET, PET). They never hold money themselves.
const cycleSelect = {
  select: {
    cycleNumber: true,
    archivedAt: true,
    branch: true,
    isFinished: true,
    _count: {
      select: { enrollments: { where: { deletedAt: null, financialArchivedAt: null, student: { deletedAt: null } } } }
    }
  }
};

async function summary(sub, user) {
  const visible = sub.cycles.filter(
    c => (isManager(user) || !c.archivedAt) && (!visibleBranchesOf(user) || visibleBranchesOf(user).includes(c.branch))
  );
  const live = visible.filter(c => !c.archivedAt);
  return {
    id: sub.id,
    parentCourseId: sub.parentCourseId,
    name: sub.name,
    bookPrice: sub.bookPrice,
    archivedAt: sub.archivedAt,
    isPrivate: true,
    cycleCount: visible.length,
    archivedCount: visible.filter(c => c.archivedAt).length,
    activeCount: live.filter(c => !c.isFinished).length,
    completedCount: live.filter(c => c.isFinished).length,
    branches: [...new Set(live.map(c => c.branch))],
    // Per-branch counts, for hiding sub-umbrellas with nothing in the chosen branch.
    byBranch: live.reduce((map, c) => ({ ...map, [c.branch]: (map[c.branch] || 0) + 1 }), {}),
    students: live.reduce((n, c) => n + c._count.enrollments, 0)
  };
}

async function privateParent(id, user) {
  const parent = await prisma.course.findUnique({ where: { id } });
  if (!parent || (!isManager(user) && parent.archivedAt))
    throw Object.assign(new Error('Course not found.'), { status: 404 });
  if (!parent.isPrivate) throw Object.assign(new Error('Only private courses have sub-umbrellas.'), { status: 400 });
  return parent;
}

const bookPrice = value => Number(moneyMinor(value ?? 0, 'Book price')) / 100;

export const listSubCourses = async (req, res) => {
  try {
    const parent = await privateParent(req.params.id, req.user);
    const subs = await prisma.subCourse.findMany({
      where: { parentCourseId: parent.id, ...(isManager(req.user) ? {} : { archivedAt: null }) },
      include: { cycles: cycleSelect },
      orderBy: { name: 'asc' }
    });
    res.json({
      parent: { id: parent.id, name: parent.name, code: parent.code, archivedAt: parent.archivedAt, isPrivate: true },
      subCourses: await Promise.all(subs.map(sub => summary(sub, req.user)))
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const getSubCourse = async (req, res) => {
  try {
    const sub = await prisma.subCourse.findUnique({
      where: { id: req.params.subId },
      include: { cycles: cycleSelect, parentCourse: true }
    });
    if (!sub || (!isManager(req.user) && (sub.archivedAt || sub.parentCourse.archivedAt)))
      return res.status(404).json({ error: 'Sub-umbrella not found.' });
    const { parentCourse } = sub;
    res.json({
      ...(await summary(sub, req.user)),
      parentCourse: {
        id: parentCourse.id,
        name: parentCourse.name,
        code: parentCourse.code,
        archivedAt: parentCourse.archivedAt,
        isPrivate: true,
        // Branches the umbrella is open for: new cycles in this sub-umbrella can only go there.
        branches: parentCourse.branches,
        allowedBranches: umbrellaBranches(parentCourse)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createSubCourse = atomic(async (req, res) => {
  try {
    const parent = await privateParent(req.params.id, req.user);
    if (parent.archivedAt) return res.status(409).json({ error: 'Restore this course before adding sub-umbrellas.' });
    const name = subCourseName(req.body.name);
    if (await prisma.subCourse.findUnique({ where: { parentCourseId_name: { parentCourseId: parent.id, name } } }))
      return res
        .status(409)
        .json({ error: `${name} already exists in ${parent.name}, including archived sub-umbrellas.` });
    const sub = await prisma.subCourse.create({
      data: { parentCourseId: parent.id, name, bookPrice: bookPrice(req.body.bookPrice) }
    });
    await logAction('CREATE_SUB_COURSE', `Created ${name} under ${parent.name} (${parent.code})`, req.user.username);
    res.status(201).json(sub);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Renaming updates current cycle names ("KET 2" -> "PRE-KET 2"); payroll and receipt snapshots keep old names.
export const updateSubCourse = atomic(async (req, res) => {
  try {
    const current = await prisma.subCourse.findUnique({
      where: { id: req.params.subId },
      include: { parentCourse: true }
    });
    if (!current) return res.status(404).json({ error: 'Sub-umbrella not found.' });
    const name = req.body.name === undefined ? current.name : subCourseName(req.body.name);
    const duplicate = await prisma.subCourse.findUnique({
      where: { parentCourseId_name: { parentCourseId: current.parentCourseId, name } }
    });
    if (duplicate && duplicate.id !== current.id)
      return res.status(409).json({ error: `${name} already exists in ${current.parentCourse.name}.` });
    const sub = await prisma.subCourse.update({
      where: { id: current.id },
      data: { name, bookPrice: req.body.bookPrice === undefined ? current.bookPrice : bookPrice(req.body.bookPrice) }
    });
    if (name !== current.name) {
      const cycles = await prisma.cycle.findMany({
        where: { subCourseId: sub.id },
        select: { id: true, cycleNumber: true, startDate: true, sequence: true }
      });
      for (const cycle of cycles)
        await prisma.cycle.update({
          where: { id: cycle.id },
          data: {
            name: cycle.startDate
              ? cycleName(name, cycle.cycleNumber, cycle.startDate, cycle.sequence)
              : `${name} ${cycle.cycleNumber}`
          }
        });
    }
    await logAction(
      'UPDATE_SUB_COURSE',
      `Updated ${current.name} to ${name}; book price ${sub.bookPrice} EGP. Historical snapshots retained.`,
      req.user.username
    );
    res.json(sub);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export const archiveSubCourse = atomic(async (req, res) => {
  try {
    const sub = await prisma.subCourse.findUnique({ where: { id: req.params.subId } });
    if (!sub) return res.status(404).json({ error: 'Sub-umbrella not found.' });
    if (await prisma.cycle.count({ where: { subCourseId: sub.id, archivedAt: null } }))
      return res.status(409).json({ error: 'Archive every cycle in this sub-umbrella first.' });
    await prisma.subCourse.update({
      where: { id: sub.id },
      data: { archivedAt: new Date(), archivedBy: req.user.username }
    });
    await logAction('ARCHIVE_SUB_COURSE', `Archived ${sub.name}`, req.user.username);
    res.json({ message: 'Sub-umbrella archived.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export const restoreSubCourse = atomic(async (req, res) => {
  try {
    const sub = await prisma.subCourse.findUnique({ where: { id: req.params.subId }, include: { parentCourse: true } });
    if (!sub) return res.status(404).json({ error: 'Sub-umbrella not found.' });
    if (sub.parentCourse.archivedAt) return res.status(409).json({ error: 'Restore the parent course first.' });
    const restored = await prisma.subCourse.update({
      where: { id: sub.id },
      data: { archivedAt: null, archivedBy: null }
    });
    await logAction('RESTORE_SUB_COURSE', `Restored ${sub.name}`, req.user.username);
    res.json(restored);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
