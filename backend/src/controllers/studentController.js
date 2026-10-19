import { financialChoice } from '../utils/tuition.js';
import { isManager } from '../utils/courseView.js';
import prisma, { atomic } from '../db/prisma.js';
import { logAction } from '../utils/logger.js';

// @desc    Get all students (with optional search)
// @route   GET /api/students
// @access  Private (All authenticated users)
export const getStudents = async (req, res, next) => {
  try {
    const { search } = req.query;

    const where = isManager(req.user) ? {} : { deletedAt: null };
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q } },
        { registrationNumber: { contains: q } },
        { mobile: { contains: q } }
      ];
    }

    const students = await prisma.student.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    res.json(students);
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new student
// @route   POST /api/students
// @access  Private (All authenticated users)
export const createStudent = atomic(async (req, res, next) => {
  try {
    const { name, registrationNumber, mobile } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Student full name is required.' });
    }
    if (!registrationNumber || !registrationNumber.trim()) {
      return res.status(400).json({ error: 'Registration number is required.' });
    }

    const cleanReg = registrationNumber.trim();
    const cleanName = name.trim();
    const cleanMobile = mobile ? mobile.trim() : null;

    const existing = await prisma.student.findUnique({
      where: { registrationNumber: cleanReg }
    });

    if (existing) {
      return res.status(400).json({ error: existing.deletedAt && !isManager(req.user) ? 'This registration number is unavailable. Contact an administrator.' : `A student with registration number '${cleanReg}' already exists (${existing.name}).` });
    }

    const student = await prisma.student.create({
      data: {
        name: cleanName,
        registrationNumber: cleanReg,
        mobile: cleanMobile
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
});

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

    const cleanReg = registrationNumber ? registrationNumber.trim() : student.registrationNumber;
    const cleanName = name ? name.trim() : student.name;
    const cleanMobile = mobile !== undefined ? (mobile ? mobile.trim() : null) : student.mobile;

    if (cleanReg !== student.registrationNumber) {
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
        mobile: cleanMobile
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
export const deleteStudent = atomic(async (req, res, next) => {
  try {
    const { id } = req.params;
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student || (student.deletedAt && !isManager(req.user))) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const keep = financialChoice(req.body);
    if (student.deletedAt) return res.status(409).json({ error: "This student is already deleted." });
    if (!keep) await prisma.enrollment.updateMany({ where: { studentId: id }, data: { financialArchivedAt: new Date() } });
    await prisma.student.update({ where: { id }, data: { deletedAt: student.deletedAt || new Date(), deletedBy: student.deletedBy || req.user.username } });

    await logAction(
      'DELETE_STUDENT',
      `Soft-deleted student ${student.name}; financial records ${keep ? "retained in totals" : "soft-deleted from totals"}. No refund issued.`,
      req.user.username
    );

    res.json({ message: `Student deleted. Financial records ${keep ? "remain in" : "are excluded from"} current totals; history retained.` });
  } catch (error) {
    next(error);
  }
});
