import { cycleBranchWhere, visibleBranchesOf } from '../utils/access.js';
import { permanentlyRemoveEnrollment } from '../utils/removeEnrollment.js';
import { activeBookInclude } from '../utils/bookPayments.js';
import { enrollmentView, hidePayroll, studentMoneyForUser } from '../utils/courseView.js';
import { profileFields } from '../utils/studentProfile.js';
import { financialChoice } from '../utils/tuition.js';
import { isManager } from '../utils/courseView.js';
import { PRIVATE_SEAT_LIMIT } from '../utils/privateSeat.js';
import prisma, { atomic } from '../db/prisma.js';
import { logAction } from '../utils/logger.js';

// @desc    Get all students (with optional search)
// @route   GET /api/students
// @access  Private (All authenticated users)
export const getStudents = async (req, res, next) => {
  try {
    if (req.query.pickerCourseId !== undefined) {
      const courseId = req.query.pickerCourseId;
      if (
        typeof courseId !== 'string' ||
        !courseId ||
        (req.query.search !== undefined && typeof req.query.search !== 'string') ||
        (req.query.cursor !== undefined && typeof req.query.cursor !== 'string')
      )
        return res.status(400).json({ error: 'Invalid student search.' });
      const cycle = await prisma.cycle.findUnique({
        where: { id: courseId },
        select: {
          archivedAt: true,
          parentCourse: { select: { archivedAt: true, isPrivate: true } },
          _count: { select: { enrollments: true } }
        }
      });
      if (!cycle || (!isManager(req.user) && (cycle.archivedAt || cycle.parentCourse.archivedAt)))
        return res.status(404).json({ error: 'Cycle not found.' });
      if (cycle.parentCourse.isPrivate && cycle._count.enrollments >= PRIVATE_SEAT_LIMIT)
        return res.json({ students: [], nextCursor: null, seatFull: true });
      const q = (req.query.search || '').trim().slice(0, 160);
      const rows = await prisma.student.findMany({
        where: {
          deletedAt: null,
          enrollments: { none: { courseId } },
          ...(q
            ? {
                OR: ['name', 'englishName', 'registrationNumber', 'mobile'].map(field => ({
                  [field]: { contains: q, mode: 'insensitive' }
                }))
              }
            : {})
        },
        select: { id: true, name: true, englishName: true, registrationNumber: true, mobile: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 21,
        ...(req.query.cursor ? { cursor: { id: req.query.cursor }, skip: 1 } : {})
      });
      return res.json({ students: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null });
    }
    // One page at a time, filtered in the database: active or archived (managers), plus search.
    const page = Number(req.query.page ?? 1),
      pageSize = Number(req.query.pageSize ?? 24);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100000 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      return res.status(400).json({ error: 'Invalid student page.' });
    // A user with no branches assigned sees nothing yet.
    if (req.user.role === 'user' && !visibleBranchesOf(req.user).length)
      return res.json({ rows: [], total: 0, page, pageSize, counts: { active: 0, archived: 0 }, noBranches: true });
    const archived = req.query.view === 'archived';
    if (archived && !isManager(req.user))
      return res.status(403).json({ error: 'Only managers can view archived students.' });
    const q = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 160) : '';
    const search = q
      ? {
          OR: ['name', 'englishName', 'registrationNumber', 'mobile'].map(field => ({
            [field]: { contains: q, mode: 'insensitive' }
          }))
        }
      : {};
    const where = { deletedAt: archived ? { not: null } : null, ...search };
    const [rows, total, active, archivedCount] = await Promise.all([
      prisma.student.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.student.count({ where }),
      prisma.student.count({ where: { deletedAt: null, ...search } }),
      isManager(req.user) ? prisma.student.count({ where: { deletedAt: { not: null }, ...search } }) : 0
    ]);
    res.json({ rows, total, page, pageSize, counts: { active, archived: archivedCount } });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new student
// @route   POST /api/students
// @access  Private (All authenticated users)
export const createStudentHandler = async (req, res, next) => {
  try {
    const { name, registrationNumber, mobile } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Student full name is required.' });
    }

    if (registrationNumber != null && typeof registrationNumber !== 'string')
      return res.status(400).json({ error: 'Registration number must be text or empty.' });
    const cleanReg = typeof registrationNumber === 'string' ? registrationNumber.trim() || null : null;
    const cleanName = name.trim();
    const cleanMobile = mobile ? mobile.trim() : null;

    const existing = cleanReg ? await prisma.student.findUnique({ where: { registrationNumber: cleanReg } }) : null;

    if (existing) {
      return res.status(400).json({
        error:
          existing.deletedAt && !isManager(req.user)
            ? 'This registration number is unavailable. Contact an administrator.'
            : `A student with registration number '${cleanReg}' already exists (${existing.name}).`
      });
    }

    const extra = profileFields(req.body);
    const student = await prisma.student.create({
      data: {
        name: cleanName,
        registrationNumber: cleanReg,
        mobile: cleanMobile,
        ...profileFields(req.body)
      }
    });

    await logAction(
      'CREATE_STUDENT',
      `Registered student ${student.name} (Reg: ${student.registrationNumber})`,
      req.user.username
    );

    res.status(201).json(student);
  } catch (error) {
    next(error);
  }
};
export const createStudent = atomic(createStudentHandler);

// @desc    Update student details
// @route   PUT /api/students/:id
// @access  Private (All authenticated users)
export const updateStudent = atomic(async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, registrationNumber, mobile } = req.body;

    const student = await prisma.student.findUnique({ where: { id } });
    if (!student || (student.deletedAt && !isManager(req.user))) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    if (registrationNumber != null && typeof registrationNumber !== 'string')
      return res.status(400).json({ error: 'Registration number must be text or empty.' });
    const cleanReg =
      registrationNumber === undefined
        ? student.registrationNumber
        : typeof registrationNumber === 'string'
          ? registrationNumber.trim() || null
          : null;
    const cleanName = name ? name.trim() : student.name;
    const cleanMobile = mobile !== undefined ? (mobile ? mobile.trim() : null) : student.mobile;

    if (cleanReg && cleanReg !== student.registrationNumber) {
      const duplicate = await prisma.student.findUnique({ where: { registrationNumber: cleanReg } });
      if (duplicate && duplicate.id !== id) {
        return res.status(400).json({ error: 'This registration number is unavailable.' });
      }
    }

    const updated = await prisma.student.update({
      where: { id },
      data: {
        name: cleanName,
        registrationNumber: cleanReg,
        mobile: cleanMobile,
        ...profileFields(req.body)
      }
    });

    await logAction(
      'UPDATE_STUDENT',
      `Updated student ${updated.name} (Reg: ${updated.registrationNumber})`,
      req.user.username
    );

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private (All authenticated users)
export const deleteStudentHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student || (student.deletedAt && !isManager(req.user))) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    // Only managers may exclude financial records from totals; staff deletions always keep them.
    const keep = isManager(req.user)
      ? financialChoice(req.body)
      : (financialChoice({ ...req.body, keepFinancialRecords: true }), true);
    if (student.deletedAt) return res.status(409).json({ error: 'This student is already deleted.' });
    if (!keep)
      await prisma.enrollment.updateMany({ where: { studentId: id }, data: { financialArchivedAt: new Date() } });
    await prisma.student.update({
      where: { id },
      data: { deletedAt: student.deletedAt || new Date(), deletedBy: student.deletedBy || req.user.username }
    });

    await logAction(
      'DELETE_STUDENT',
      `Soft-deleted student ${student.name}; financial records ${keep ? 'retained in totals' : 'soft-deleted from totals'}. No refund issued.`,
      req.user.username
    );

    res.json({
      message: `Student deleted. Financial records ${keep ? 'remain in' : 'are excluded from'} current totals; history retained.`
    });
  } catch (error) {
    next(error);
  }
};
export const deleteStudent = atomic(deleteStudentHandler);

// Student-centric enrollment history; removed records remain manager-only.
export const getStudentDetails = async (req, res, next) => {
  try {
    const manager = isManager(req.user);
    const row = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        enrollments: {
          // Branch mods and users see a student's courses in their branches only.
          where: manager
            ? { course: cycleBranchWhere(req.user) }
            : {
                deletedAt: null,
                financialArchivedAt: null,
                course: { archivedAt: null, parentCourse: { archivedAt: null }, ...cycleBranchWhere(req.user) }
              },
          include: {
            bookPayments: activeBookInclude,
            course: {
              include: {
                parentCourse: true,
                enrollments: { where: { deletedAt: null }, select: { student: { select: { id: true, name: true } } } }
              }
            }
          },
          orderBy: [{ course: { startDate: 'desc' } }, { id: 'asc' }]
        }
      }
    });
    if (!row || (!manager && row.deletedAt)) return res.status(404).json({ error: 'Student not found.' });
    const { enrollments, ...student } = row;
    const enrichedEnrollments = enrollments.map(enrollment => {
      const isPrivate = Boolean(enrollment.course?.parentCourse?.isPrivate);
      const privateStudents = isPrivate
        ? (enrollment.course?.enrollments || []).map(e => e.student?.name).filter(Boolean)
        : [];
      const enrichedCourse = {
        ...enrollment.course,
        isPrivate,
        privateStudents
      };
      return studentMoneyForUser(
        hidePayroll(enrollmentView({ ...enrollment, course: enrichedCourse }, enrichedCourse), req.user),
        req.user
      );
    });
    res.json({ student, enrollments: enrichedEnrollments });
  } catch (error) {
    next(error);
  }
};

export const archiveStudent = atomic(async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    const archived = req.body.archived !== false;
    const result = await prisma.student.update({
      where: { id: student.id },
      data: { deletedAt: archived ? new Date() : null, deletedBy: archived ? req.user.username : null }
    });
    await logAction(
      archived ? 'ARCHIVE_STUDENT' : 'RESTORE_STUDENT',
      `${archived ? 'Archived' : 'Restored'} ${student.name}; financial totals unchanged.`,
      req.user.username
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});
export const permanentlyDeleteStudent = atomic(async (req, res, next) => {
  try {
    if (req.body.confirm !== true) return res.status(400).json({ error: 'Confirm permanent deletion.' });
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: { enrollments: { include: { course: true, student: true } } }
    });
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    for (const enrollment of student.enrollments)
      await permanentlyRemoveEnrollment(enrollment, req.user, {
        mode: 'KEEP',
        reason:
          'Student permanently deleted; previously collected income retained. Use enrollment removal first to record refunds or corrections.'
      });
    await prisma.student.delete({ where: { id: student.id } });
    await logAction(
      'PERMANENT_DELETE_STUDENT',
      `Permanently deleted ${student.name}; income and audit/payment history retained.`,
      req.user.username
    );
    res.json({ message: 'Student permanently deleted. Financial history retained.' });
  } catch (error) {
    next(error);
  }
});

export const bulkArchiveStudents = atomic(async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Select at least one student.' });
    const result = await prisma.student.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: req.user.username }
    });
    await logAction('BULK_ARCHIVE_STUDENTS', `Archived ${result.count} students`, req.user.username);
    res.json({ message: `Successfully archived ${result.count} students.`, count: result.count });
  } catch (error) {
    next(error);
  }
});

export const bulkDeleteStudents = atomic(async (req, res, next) => {
  try {
    const { ids, confirm = false } = req.body;
    // Only managers may exclude financial records from totals; staff deletions always keep them.
    const keepFinancialRecords = isManager(req.user) ? req.body.keepFinancialRecords !== false : true;
    if (confirm !== true) return res.status(400).json({ error: 'Please confirm deletion.' });
    if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string'))
      return res.status(400).json({ error: 'Select at least one student.' });

    if (keepFinancialRecords) {
      const result = await prisma.student.updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: { deletedAt: new Date(), deletedBy: req.user.username }
      });
      await logAction(
        'BULK_DELETE_STUDENTS_KEPT_FINANCES',
        `Soft-deleted ${result.count} students; financial records retained in totals.`,
        req.user.username
      );
      return res.json({
        message: `Removed ${result.count} students. Financial records remain in totals.`,
        count: result.count
      });
    } else {
      await prisma.enrollment.updateMany({
        where: { studentId: { in: ids }, financialArchivedAt: null, student: { deletedAt: null } },
        data: { financialArchivedAt: new Date() }
      });
      const result = await prisma.student.updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: { deletedAt: new Date(), deletedBy: req.user.username }
      });
      await logAction(
        'BULK_DELETE_STUDENTS_EXCLUDED_FINANCES',
        `Soft-deleted ${result.count} students; financial records excluded from totals.`,
        req.user.username
      );
      return res.json({
        message: `Removed ${result.count} students. Financial records excluded from totals.`,
        count: result.count
      });
    }
  } catch (error) {
    next(error);
  }
});
