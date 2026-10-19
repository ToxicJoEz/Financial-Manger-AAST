import prisma, { atomic } from '../db/prisma.js';
import { isManager } from '../utils/courseView.js';
import { logAction } from '../utils/logger.js';
const clean = (value, field) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) throw Object.assign(new Error(`${field} must contain 1 to 120 characters.`), {
    status: 400
  });
  return value.trim().toUpperCase();
};
const summary = (course, user) => {
  const visible = course.cycles.filter(c => isManager(user) || !c.archivedAt);
  const live = visible.filter(c => !c.archivedAt);
  const highest = course.cycles.reduce((n, c) => Math.max(n, c.cycleNumber), 0);
  return {
    id: course.id,
    name: course.name,
    code: course.code,
    archivedAt: course.archivedAt,
    nextCycleNumber: highest < 2147483647 ? highest + 1 : null,
    cycleCount: visible.length,
    archivedCount: visible.filter(c => c.archivedAt).length,
    activeCount: live.filter(c => !c.isFinished).length,
    completedCount: live.filter(c => c.isFinished).length,
    branches: [...new Set(live.map(c => c.branch))],
    students: live.reduce((n, c) => n + c._count.enrollments, 0)
  };
};
const relations = {
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
      where: isManager(req.user) ? {} : {
        archivedAt: null
      },
      include: relations,
      orderBy: {
        name: 'asc'
      }
    });
    res.json(courses.map(c => summary(c, req.user)));
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
    if (!course || !isManager(req.user) && course.archivedAt) return res.status(404).json({
      error: 'Course not found.'
    });
    res.json(summary(course, req.user));
  } catch (error) {
    next(error);
  }
};
export const createCourse = atomic(async (req, res, next) => {
  try {
    const name = clean(req.body.name, 'Course name'),
      code = clean(req.body.code, 'Course code');
    if (await prisma.course.findUnique({
      where: {
        code
      }
    })) return res.status(409).json({
      error: 'This course code is already in use.'
    });
    const course = await prisma.course.create({
      data: {
        name,
        code
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
    if (!current) return res.status(404).json({
      error: 'Course not found.'
    });
    const name = clean(req.body.name ?? current.name, 'Course name'),
      code = clean(req.body.code ?? current.code, 'Course code');
    const duplicate = await prisma.course.findUnique({
      where: {
        code
      }
    });
    if (duplicate && duplicate.id !== current.id) return res.status(409).json({
      error: 'This course code is already in use.'
    });
    const course = await prisma.course.update({
      where: {
        id: current.id
      },
      data: {
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
        cycleNumber: true
      }
    });
    for (const cycle of cycles) await prisma.cycle.update({
      where: {
        id: cycle.id
      },
      data: {
        name: `${name} ${cycle.cycleNumber}`
      }
    });
    await logAction('UPDATE_COURSE', `Updated ${current.name} (${current.code}) to ${name} (${code}); historical financial snapshots retained.`, req.user.username);
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
    if (!course) return res.status(404).json({
      error: 'Course not found.'
    });
    if (await prisma.cycle.count({
      where: {
        parentCourseId: course.id,
        archivedAt: null
      }
    })) return res.status(409).json({
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
