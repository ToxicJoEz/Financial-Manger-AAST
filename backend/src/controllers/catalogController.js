import { moneyMinor } from '../utils/numbers.js';
import prisma, { atomic } from '../db/prisma.js';
import { isManager } from '../utils/courseView.js';
import { visibleBranchesOf } from '../utils/access.js';
import { cycleName, umbrellaBranches } from '../utils/privateCourses.js';
import { EMPLOYEE_BRANCHES } from '../utils/employees.js';
import { logAction } from '../utils/logger.js';
const clean = (value, field) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120)
    throw Object.assign(new Error(`${field} must contain 1 to 120 characters.`), {
      status: 400
    });
  return value.trim().toUpperCase();
};
const summary = (course, user) => {
  // Branch mods and users only count their branches' cycles.
  const seen = visibleBranchesOf(user);
  const visible = course.cycles.filter(c => (isManager(user) || !c.archivedAt) && (!seen || seen.includes(c.branch)));
  const live = visible.filter(c => !c.archivedAt);
  // Per-branch counts, for the branch filter on the Courses page.
  const byBranch = {};
  for (const c of live) {
    const row = (byBranch[c.branch] ||= { cycles: 0, active: 0, completed: 0 });
    row.cycles++;
    row[c.isFinished ? 'completed' : 'active']++;
  }
  return {
    id: course.id,
    name: course.name,
    code: course.code,
    bookPrice: course.bookPrice,
    isPrivate: course.isPrivate,
    archivedAt: course.archivedAt,
    // Branches allowed to run cycles under this umbrella.
    allowedBranches: umbrellaBranches(course),
    cycleCount: visible.length,
    archivedCount: visible.filter(c => c.archivedAt).length,
    activeCount: live.filter(c => !c.isFinished).length,
    completedCount: live.filter(c => c.isFinished).length,
    branches: [...new Set(live.map(c => c.branch))],
    byBranch,
    students: live.reduce((n, c) => n + c._count.enrollments, 0),
    subCourseCount: course.isPrivate ? course.subCourses.filter(sub => isManager(user) || !sub.archivedAt).length : 0
  };
};
// Branch mods and users see an umbrella when it is open for one of their branches, or already runs cycles there.
const visibleToBranch = (course, user) => {
  const seen = visibleBranchesOf(user);
  return (
    !seen || seen.some(b => umbrellaBranches(course).includes(b)) || course.cycles.some(c => seen.includes(c.branch))
  );
};
const relations = {
  subCourses: { select: { id: true, archivedAt: true } },
  cycles: {
    select: {
      cycleNumber: true,
      archivedAt: true,
      branch: true,
      isFinished: true,
      _count: {
        select: {
          enrollments: {
            where: {
              deletedAt: null,
              financialArchivedAt: null,
              student: {
                deletedAt: null
              }
            }
          }
        }
      }
    }
  }
};
export const listCourses = async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({
      where: isManager(req.user)
        ? {}
        : {
            archivedAt: null
          },
      include: relations,
      orderBy: {
        name: 'asc'
      }
    });
    res.json(courses.filter(c => visibleToBranch(c, req.user)).map(c => summary(c, req.user)));
  } catch (error) {
    next(error);
  }
};
export const getCourse = async (req, res, next) => {
  try {
    const course = await prisma.course.findUnique({
      where: {
        id: req.params.id
      },
      include: relations
    });
    if (!course || (!isManager(req.user) && course.archivedAt))
      return res.status(404).json({
        error: 'Course not found.'
      });
    if (!visibleToBranch(course, req.user)) return res.status(404).json({ error: 'Course not found.' });
    res.json(summary(course, req.user));
  } catch (error) {
    next(error);
  }
};
export const createCourse = atomic(async (req, res, next) => {
  try {
    if (req.body.isPrivate !== undefined && typeof req.body.isPrivate !== 'boolean')
      return res.status(400).json({ error: 'Private course must be a toggle value.' });
    const name = clean(req.body.name, 'Course name'),
      code = clean(req.body.code, 'Course code');
    if (
      await prisma.course.findUnique({
        where: {
          code
        }
      })
    )
      return res.status(409).json({
        error: 'This course code is already in use.'
      });
    const course = await prisma.course.create({
      data: {
        isPrivate: req.body.isPrivate === true,
        bookPrice: req.body.isPrivate === true ? 0 : Number(moneyMinor(req.body.bookPrice ?? 0, 'Book price')) / 100,
        name,
        code,
        branches: 'MIAMI'
      }
    });
    await logAction('CREATE_COURSE', `Created course ${name} (${code})`, req.user.username);
    res.status(201).json(course);
  } catch (error) {
    next(error);
  }
});
export const editCourse = atomic(async (req, res, next) => {
  try {
    const current = await prisma.course.findUnique({
      where: {
        id: req.params.id
      }
    });
    if (!current)
      return res.status(404).json({
        error: 'Course not found.'
      });
    if (req.body.isPrivate !== undefined && typeof req.body.isPrivate !== 'boolean')
      return res.status(400).json({ error: 'Private course must be a toggle value.' });
    const isPrivate = req.body.isPrivate ?? current.isPrivate;
    if (
      isPrivate !== current.isPrivate &&
      ((await prisma.cycle.count({ where: { parentCourseId: current.id } })) ||
        (await prisma.subCourse.count({ where: { parentCourseId: current.id } })))
    )
      return res
        .status(409)
        .json({ error: 'Course type cannot change once cycles exist. Create a separate umbrella for the other type.' });
    const name = clean(req.body.name ?? current.name, 'Course name'),
      code = clean(req.body.code ?? current.code, 'Course code');
    const duplicate = await prisma.course.findUnique({
      where: {
        code
      }
    });
    if (duplicate && duplicate.id !== current.id)
      return res.status(409).json({
        error: 'This course code is already in use.'
      });
    const course = await prisma.course.update({
      where: {
        id: current.id
      },
      data: {
        isPrivate,
        bookPrice: isPrivate ? 0 : Number(moneyMinor(req.body.bookPrice ?? current.bookPrice, 'Book price')) / 100,
        name,
        code
      }
    });
    // Update current display names, while completed payroll and receipt snapshots stay unchanged.
    const cycles = await prisma.cycle.findMany({
      where: {
        parentCourseId: course.id
      },
      select: {
        id: true,
        cycleNumber: true,
        startDate: true,
        sequence: true
      }
    });
    if (!course.isPrivate && name !== current.name)
      for (const cycle of cycles)
        await prisma.cycle.update({
          where: {
            id: cycle.id
          },
          data: {
            name: cycle.startDate
              ? cycleName(name, cycle.cycleNumber, cycle.startDate, cycle.sequence)
              : `${name} ${cycle.cycleNumber}`
          }
        });
    await logAction(
      'UPDATE_COURSE',
      `Updated ${current.name} (${current.code}) to ${name} (${code}); historical financial snapshots retained.`,
      req.user.username
    );
    res.json(course);
  } catch (error) {
    next(error);
  }
});
export const archiveCourse = atomic(async (req, res, next) => {
  try {
    const course = await prisma.course.findUnique({
      where: {
        id: req.params.id
      }
    });
    if (!course)
      return res.status(404).json({
        error: 'Course not found.'
      });
    if (
      await prisma.cycle.count({
        where: {
          parentCourseId: course.id,
          archivedAt: null
        }
      })
    )
      return res.status(409).json({
        error: 'Archive every cycle before archiving this course.'
      });
    await prisma.course.update({
      where: {
        id: course.id
      },
      data: {
        archivedAt: new Date(),
        archivedBy: req.user.username
      }
    });
    await logAction('ARCHIVE_COURSE', `Archived ${course.name}`, req.user.username);
    res.json({
      message: 'Course archived.'
    });
  } catch (error) {
    next(error);
  }
});
export const restoreCourse = atomic(async (req, res, next) => {
  try {
    const course = await prisma.course.update({
      where: {
        id: req.params.id
      },
      data: {
        archivedAt: null,
        archivedBy: null
      }
    });
    await logAction('RESTORE_COURSE', `Restored ${course.name}`, req.user.username);
    res.json(course);
  } catch (error) {
    next(error);
  }
});

// The main mod opens an umbrella for the branches allowed to run its cycles (new umbrellas: Miami only).
export const setCourseBranches = atomic(async (req, res, next) => {
  try {
    const list = Array.isArray(req.body.branches)
      ? [...new Set(req.body.branches.map(b => String(b).toUpperCase()))]
      : null;
    if (!list || !list.length || list.some(b => !EMPLOYEE_BRANCHES.includes(b)))
      return res.status(400).json({ error: 'Choose at least one valid branch.' });
    const current = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Course not found.' });
    const branches = EMPLOYEE_BRANCHES.filter(b => list.includes(b)).join(',');
    const course = await prisma.course.update({ where: { id: current.id }, data: { branches } });
    await logAction(
      'COURSE_BRANCHES',
      `${current.name} open for ${branches.replaceAll(',', ', ')} (was ${current.branches.replaceAll(',', ', ')}).`,
      req.user.username
    );
    res.json({ id: course.id, allowedBranches: umbrellaBranches(course) });
  } catch (error) {
    next(error);
  }
});
