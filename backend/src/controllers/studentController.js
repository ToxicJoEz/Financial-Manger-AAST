import { activeBookInclude } from '../utils/bookPayments.js';
import { enrollmentView, hidePayroll } from '../utils/courseView.js';
import { queueStudentRequest } from '../utils/studentRequests.js';
import { profileFields } from '../utils/studentProfile.js';
import { financialChoice } from '../utils/tuition.js';
import { isManager } from '../utils/courseView.js';
import prisma, { atomic } from '../db/prisma.js';
import { logAction } from '../utils/logger.js';

// @desc    Get all students (with optional search)
// @route   GET /api/students
// @access  Private (All authenticated users)
export const getStudents = async (req, res, next) => {
  try {
    if (req.query.pickerCourseId !== undefined) {
      const courseId = req.query.pickerCourseId;
      if (typeof courseId !== 'string' || !courseId || (req.query.search !== undefined && typeof req.query.search !== 'string') || (req.query.cursor !== undefined && typeof req.query.cursor !== 'string')) return res.status(400).json({error:'Invalid student search.'});
      const cycle = await prisma.cycle.findUnique({where:{id:courseId},select:{archivedAt:true,parentCourse:{select:{archivedAt:true}}}});
      if (!cycle || (!isManager(req.user) && (cycle.archivedAt || cycle.parentCourse.archivedAt))) return res.status(404).json({error:'Cycle not found.'});
      const q = (req.query.search || '').trim().slice(0,160);
      const rows = await prisma.student.findMany({
        where:{deletedAt:null,enrollments:{none:{courseId}},...(q?{OR:['name','englishName','registrationNumber','mobile'].map(field=>({[field]:{contains:q,mode:'insensitive'}}))}:{})},
        select:{id:true,name:true,englishName:true,registrationNumber:true,mobile:true},
        orderBy:[{name:'asc'},{id:'asc'}], take:21,
        ...(req.query.cursor ? {cursor:{id:req.query.cursor},skip:1} : {})
      });
      return res.json({students:rows.slice(0,20),nextCursor:rows.length>20?rows[19].id:null});
    }
    const { search } = req.query;

    const where = isManager(req.user) ? {} : { deletedAt: null };
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q } },
        { registrationNumber: { contains: q } },
        { mobile: { contains: q } },
        { englishName: { contains: q } }
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
export const createStudentHandler = async (req, res, next) => {
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

    const extra = profileFields(req.body);
    if (!isManager(req.user)) return queueStudentRequest(req, res, 'CREATE_STUDENT', { name: cleanName, registrationNumber: cleanReg, mobile: cleanMobile, ...extra, ...(extra.dateOfBirth ? { dateOfBirth: extra.dateOfBirth.toISOString().slice(0, 10) } : {}) });
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

    const keep = financialChoice(req.body);
    if (student.deletedAt) return res.status(409).json({ error: "This student is already deleted." });
    if (!isManager(req.user)) return queueStudentRequest(req, res, 'DELETE_STUDENT', { keepFinancialRecords: keep, confirm: true }, { studentId: id });
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
};
export const deleteStudent = atomic(deleteStudentHandler);

// Student-centric enrollment history; removed records remain manager-only.
export const getStudentDetails = async (req, res, next) => {
  try {
    const manager = isManager(req.user);
    const row = await prisma.student.findUnique({where:{id:req.params.id},include:{enrollments:{
      where: manager ? {} : {deletedAt:null,financialArchivedAt:null,course:{archivedAt:null,parentCourse:{archivedAt:null}}},
      include:{bookPayments:activeBookInclude,course:{include:{parentCourse:true}}},
      orderBy:[{course:{startDate:'desc'}},{id:'asc'}]
    }}});
    if(!row || (!manager && row.deletedAt)) return res.status(404).json({error:'Student not found.'});
    const {enrollments,...student}=row;
    res.json({student,enrollments:enrollments.map(enrollment=>hidePayroll(enrollmentView(enrollment,enrollment.course),req.user))});
  } catch(error) {next(error);}
};
