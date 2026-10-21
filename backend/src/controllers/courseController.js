import { activeBookInclude } from '../utils/bookPayments.js';
import { cycleSchedule } from '../utils/cycleSchedule.js';
import { queueStudentRequest } from '../utils/studentRequests.js';
import { assertWithinFee, financialChoice } from '../utils/tuition.js';
import { savePayrollRecord } from '../utils/payrollRecord.js';
import { courseView, enrollmentView, hidePayroll, isManager, paymentSummaryInclude } from '../utils/courseView.js';
import { paymentFields } from '../utils/studentProfile.js';
import { openingBalance } from '../utils/paymentLedger.js';
import { moneyMinor } from '../utils/numbers.js';
import { numberValue } from '../utils/numbers.js';
import prisma, { atomic } from '../db/prisma.js';
import { logAction } from '../utils/logger.js';

export const getCourses = async (req, res) => {
  try {
    const isJunior = req.user.role === 'user';
    const courses = await prisma.cycle.findMany({
      where: { ...(req.params.id ? {id:req.params.id} : {}), ...(!isManager(req.user) ? { archivedAt: null, parentCourse: { archivedAt: null } } : {}), ...(req.query.parentCourseId ? { parentCourseId: req.query.parentCourseId } : {}) },
      include: {
        parentCourse: true,
        ...(isManager(req.user) ? { payrollEarnings: { include: { batch: true } } } : {}),
        instructors: {
          include: { instructor: true }
        },
        pendingAssignments: {
          where: { status: 'PENDING' },
          include: {
            instructor: true,
            submittedBy: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
                role: true
              }
            }
          }
        },
        enrollments: {
          include: { student: true, bookPayments: activeBookInclude, payments: paymentSummaryInclude },
          orderBy: { enrolledAt: 'asc' }
        }
      },
      orderBy: [
        { parentCourse: { name: 'asc' } },
        { cycleNumber: 'asc' }
      ]
    });

    const enriched = courses.map(course => { const { payrollEarnings, ...rest } = course; return courseView({ ...rest, ...(isManager(req.user) ? { payrollEarnings: (payrollEarnings || []).map(e => ({ id: e.id, amount: Number(e.amountMinor) / 100, status: e.batch?.status || 'UNPAID' })) } : {}) }, req.user); });

    if(req.params.id) return enriched.length ? res.json(enriched[0]) : res.status(404).json({error:'Cycle not found.'});
    res.json(enriched);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const createCourse = atomic(async (req, res, next) => {
  try {
    const { parentCourseId, cycleNumber, details, branch, startDate, endDate, totalHours, courseFee } = req.body;
    const parent = await prisma.course.findUnique({ where: { id: parentCourseId || '' } });
    if (!parent || parent.archivedAt) return res.status(400).json({ error: 'Choose an available parent course.' });
    const number = Number(cycleNumber);
    if (!['number','string'].includes(typeof cycleNumber) || !Number.isInteger(number) || number < 1 || number > 2147483647) return res.status(400).json({ error: 'Cycle number must be a whole number between 1 and 2,147,483,647.' });
    if (typeof branch !== 'string' || !branch.trim()) return res.status(400).json({ error: 'Branch is required.' });
    const start = startDate ? new Date(startDate) : null, end = endDate ? new Date(endDate) : null;
    if ((start && !Number.isFinite(start.getTime())) || (end && !Number.isFinite(end.getTime())) || (start && end && end < start)) return res.status(400).json({ error: 'Choose valid dates; end date cannot precede start date.' });
    const duplicate = await prisma.cycle.findUnique({ where: { parentCourseId_cycleNumber: { parentCourseId, cycleNumber: number } } });
    if (duplicate) return res.status(409).json({ error: 'This cycle number is already used in this course, including archived cycles. Choose another number.' });
    const cycle = await prisma.cycle.create({ data: { ...cycleSchedule(req.body), parentCourseId, cycleNumber: number, name: `${parent.name} ${number}`, details, branch: branch.trim().toUpperCase(), startDate: start, endDate: end, totalHours: totalHours === undefined || totalHours === null || totalHours === '' ? null : numberValue(totalHours, 'Cycle hours'), courseFee: Number(moneyMinor(courseFee || 0, 'Tuition fee')) / 100 }, include: { parentCourse: true } });
    await logAction('CREATE_CYCLE', `Created ${cycle.name} (${cycle.branch}) under ${parent.code}`, req.user.username);
    res.status(201).json(hidePayroll(cycle, req.user));
  } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); next(error); }
});

export const updateCourse = atomic(async (req, res, next) => {
  try {
    const cycle = await prisma.cycle.findUnique({ where: { id: req.params.id }, include: { enrollments: true, parentCourse: true } });
    if (!cycle) return res.status(404).json({ error: 'Cycle not found.' });
    const body = req.body;
    if (body.parentCourseId !== undefined && body.parentCourseId !== cycle.parentCourseId) return res.status(400).json({ error: 'Cycles cannot be moved to another course.' });
    if ((body.isFinished !== undefined && body.isFinished !== cycle.isFinished) || (body.isPaid !== undefined && body.isPaid !== cycle.isPaid) || (body.payrollMonth !== undefined && body.payrollMonth !== cycle.payrollMonth)) return res.status(400).json({ error: 'Use the dedicated completion or payment action to change accounting state.' });
    const data = cycleSchedule(body, cycle);
    if (body.cycleNumber !== undefined) {
      const number = Number(body.cycleNumber);
      if (!['number','string'].includes(typeof body.cycleNumber) || !Number.isInteger(number) || number < 1 || number > 2147483647) return res.status(400).json({ error: 'Cycle number must be a whole number between 1 and 2,147,483,647.' });
      const duplicate = await prisma.cycle.findUnique({ where: { parentCourseId_cycleNumber: { parentCourseId: cycle.parentCourseId, cycleNumber: number } } });
      if (duplicate && duplicate.id !== cycle.id) return res.status(409).json({ error: 'That cycle number already belongs to this course, including archived cycles.' });
      data.cycleNumber = number; data.name = `${cycle.parentCourse.name} ${number}`;
    }
    if (body.branch !== undefined) { if (typeof body.branch !== 'string' || !body.branch.trim()) return res.status(400).json({ error: 'Branch is required.' }); data.branch = body.branch.trim().toUpperCase(); }
    if (body.details !== undefined) data.details = body.details;
    for (const key of ['startDate','endDate']) if (body[key] !== undefined) { data[key] = body[key] ? new Date(body[key]) : null; if (data[key] && !Number.isFinite(data[key].getTime())) return res.status(400).json({ error: 'Choose valid dates.' }); }
    const start = data.startDate === undefined ? cycle.startDate : data.startDate, end = data.endDate === undefined ? cycle.endDate : data.endDate;
    if (start && end && end < start) return res.status(400).json({ error: 'End date cannot precede start date.' });
    if (body.totalHours !== undefined) data.totalHours = body.totalHours === null || body.totalHours === '' ? null : numberValue(body.totalHours, 'Cycle hours');
    if (body.courseFee !== undefined) { data.courseFee = Number(moneyMinor(body.courseFee || 0, 'Tuition fee')) / 100; for (const enrollment of cycle.enrollments) if (enrollment.customFee === null) assertWithinFee(enrollment.amountPaid, data.courseFee); }
    const updated = await prisma.cycle.update({ where: { id: cycle.id }, data, include: { parentCourse: true } });
    await logAction('UPDATE_CYCLE', `Updated ${updated.name}; financial snapshots retained.`, req.user.username);
    res.json(hidePayroll(updated, req.user));
  } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); next(error); }
});

export const togglePaymentStatus = (req, res) => res.status(410).json({ error: 'Course-wide payment toggles have been removed. Use instructor payment batches in Finance > Payroll.' });

export const deleteCourse = atomic(async (req, res, next) => {
  try {
    const course = await prisma.cycle.findUnique({ where: { id: req.params.id } });
    if (!course) return res.status(404).json({ error: 'Course not found.' });
    await prisma.cycle.update({ where: { id: course.id }, data: { archivedAt: course.archivedAt || new Date(), archivedBy: course.archivedBy || req.user.username } });
    await logAction('ARCHIVE_COURSE', `Archived ${course.name}; tuition and payroll records retained.`, req.user.username);
    res.json({ message: 'Course archived. Tuition and payroll history have been preserved.' });
  } catch (error) { next(error); }
});

export const assignInstructor = atomic(async (req, res) => {
  try {
    const { id } = req.params;
    const { instructorId, hourlyRate } = req.body;

    const course = await prisma.cycle.findUnique({ where: { id } });
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (course.archivedAt || course.isFinished) return res.status(409).json({ error: 'Reopen an unarchived course before changing its teaching team.' });
    if (!instructorId) return res.status(400).json({ error: 'Employee is required.' });

    const instructor = await prisma.instructor.findUnique({ where: { id: instructorId } });
    if (!instructor) return res.status(404).json({ error: 'Employee not found' });

    if (req.user.role === 'user') {
      const existingPending = await prisma.pendingAssignment.findFirst({
        where: { courseId: id, instructorId, type: 'ASSIGN', status: 'PENDING' }
      });
      if (existingPending) {
        return res.status(400).json({ error: 'A pending assignment request already exists for this instructor.' });
      }

      const alreadyAssigned = await prisma.courseInstructor.findFirst({
        where: { courseId: id, instructorId }
      });
      if (alreadyAssigned) {
        return res.status(400).json({ error: 'Employee is already assigned to this course.' });
      }

      const pending = await prisma.pendingAssignment.create({
        data: {
          courseId: id,
          instructorId,
          type: 'ASSIGN',
          submittedById: req.user.id
        },
        include: {
          instructor: true,
          course: true,
          submittedBy: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              avatar: true,
              role: true
            }
          }
        }
      });

      const mods = await prisma.user.findMany({ where: { role: { in: ['mod', 'admin'] } } });
      const notifications = mods.map(m => ({
        userId: m.id,
        title: 'Pending Assignment',
        message: `<span class="font-bold text-blue-600">@${pending.submittedBy.username}</span> requested to assign <span class="font-bold text-emerald-600">${pending.instructor ? pending.instructor.name : 'instructor'}</span> to <span class="font-bold text-emerald-600">${pending.course.name}</span>.`,
        type: 'ASSIGNMENT_REQUEST',
        relatedId: pending.id
      }));
      if (notifications.length > 0) {
        await prisma.notification.createMany({ data: notifications });
      }
      await logAction('ASSIGN_INSTRUCTOR_PENDING', `Requested to assign ${instructor.name} to course ${course.name}`, req.user.username);
      return res.json(hidePayroll({ message: 'Request submitted for approval.', pending }, req.user));
    } else {
      if (hourlyRate === undefined || isNaN(numberValue(hourlyRate)) || numberValue(hourlyRate) < 0) {
        return res.status(400).json({ error: 'A valid non-negative hourly rate is required for assignment' });
      }

      const updated = await prisma.courseInstructor.create({
        data: {
          courseId: id,
          instructorId: instructorId,
          hourlyRate: numberValue(hourlyRate)
        },
        include: { instructor: true }
      });
      await logAction('ASSIGN_INSTRUCTOR', `Assigned instructor ${instructor.name} to course ${course.name} at ${numberValue(hourlyRate)} EGP/hr`, req.user.username);
      return res.json(updated);
    }
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Employee is already assigned to this course.' });
    res.status(400).json({ error: error.message });
  }
});

export const removeInstructor = atomic(async (req, res) => {
  try {
    const { id, courseInstructorId } = req.params;

    const course = await prisma.cycle.findUnique({ where: { id } });
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (course.archivedAt || course.isFinished) return res.status(409).json({ error: 'Reopen an unarchived course before changing its teaching team.' });

    const assignment = await prisma.courseInstructor.findUnique({
      where: { id: courseInstructorId },
      include: { instructor: true }
    });
    if (!assignment || assignment.courseId !== id) return res.status(404).json({ error: 'Employee assignment not found for this course.' });

    if (req.user.role === 'user') {
      const existingPending = await prisma.pendingAssignment.findFirst({
        where: {
          courseId: id,
          instructorId: assignment.instructorId,
          type: 'REMOVE',
          status: 'PENDING'
        }
      });
      if (existingPending) {
        return res.status(400).json({ error: 'A pending removal request already exists for this instructor.' });
      }

      const pending = await prisma.pendingAssignment.create({
        data: {
          courseId: id,
          instructorId: assignment.instructorId,
          type: 'REMOVE',
          submittedById: req.user.id
        },
        include: {
          course: true,
          instructor: true,
          submittedBy: {
            select: { id: true, username: true, firstName: true, lastName: true, avatar: true, role: true }
          }
        }
      });

      const mods = await prisma.user.findMany({ where: { role: { in: ['mod', 'admin'] } } });
      const notifications = mods.map(m => ({
        userId: m.id,
        title: 'Pending Removal Request',
        message: `<span class="font-bold text-blue-600">@${req.user.username}</span> requested to remove <span class="font-bold text-red-600">${assignment.instructor ? assignment.instructor.name : 'instructor'}</span> from <span class="font-bold text-emerald-600">${course.name}</span>.`,
        type: 'ASSIGNMENT_REQUEST',
        relatedId: pending.id
      }));
      if (notifications.length > 0) {
        await prisma.notification.createMany({ data: notifications });
      }

      const instName = assignment.instructor ? assignment.instructor.name : assignment.instructorId;
      await logAction('REMOVE_INSTRUCTOR_PENDING', `Requested removal of ${instName} from course ${course.name}`, req.user.username);
      return res.json(hidePayroll({ message: 'Removal request submitted for approval.', pending }, req.user));
    } else {
      await prisma.courseInstructor.delete({
        where: { id: courseInstructorId }
      });
      const instName = assignment.instructor ? assignment.instructor.name : assignment.instructorId;
      await logAction('REMOVE_INSTRUCTOR', `Removed instructor ${instName} from course ${course.name}`, req.user.username);
      return res.json({ message: 'Employee removed' });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export const markFinished = atomic(async (req, res) => {
  try {
    const { id } = req.params;
    const { totalHours, instructorHours } = req.body;
    if (req.body.payrollMonth !== undefined) return res.status(400).json({ error: 'Payroll is no longer assigned to a month. Omit payrollMonth.' });
    
    const course = await prisma.cycle.findUnique({
      where: { id },
      include: {
        instructors: {
          include: { instructor: true }
        }
      }
    });

    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!course.instructors || course.instructors.length === 0) {
      return res.status(400).json({ error: 'Cannot complete a course without an assigned instructor.' });
    }
    if (course.archivedAt) return res.status(409).json({ error: 'Restore the archived course before completing it.' });

    const total = numberValue(totalHours);
    if (isNaN(total) || !isFinite(total) || total <= 0) {
      return res.status(400).json({ error: 'Total course hours must be a valid positive number.' });
    }

    if (instructorHours !== undefined && (!Array.isArray(instructorHours) || instructorHours.some(entry => !entry || typeof entry !== 'object' || Array.isArray(entry)))) {
      return res.status(400).json({ error: 'Employee hour allocations must be a list of valid instructor assignments. Review the instructors and try again.' });
    }
    if (Array.isArray(instructorHours) && new Set(instructorHours.map(entry => entry.courseInstructorId)).size !== instructorHours.length) return res.status(400).json({ error: 'Each instructor must appear exactly once in the hour allocation.' });
    const assignedIds = new Set(course.instructors.map(ci => ci.id));
    if (instructorHours?.some(entry => !assignedIds.has(entry.courseInstructorId))) {
      return res.status(400).json({ error: 'The submitted instructor assignments do not match this course. Review the assigned instructors, refresh the course, and choose the correct allocation before trying again. No changes have been saved.' });
    }
    let finalInstructorHours = [];

    if (course.instructors.length === 1) {
      // Single instructor: either hours provided or automatically assigned full total
      const singleCi = course.instructors[0];
      if (instructorHours && Array.isArray(instructorHours) && instructorHours.length > 0) {
        const entry = instructorHours.find(ih => ih.courseInstructorId === singleCi.id);
        const hours = numberValue(entry.hoursTaught);
        if (isNaN(hours) || !isFinite(hours) || hours <= 0) {
          return res.status(400).json({ error: 'Employee hours taught must be a positive number.' });
        }
        if (Math.abs(hours - total) > 0.01) {
          return res.status(400).json({ error: `Employee hours (${hours}) must equal total course hours (${total}).` });
        }
        finalInstructorHours = [{ courseInstructorId: singleCi.id, hoursTaught: hours }];
      } else {
        finalInstructorHours = [{ courseInstructorId: singleCi.id, hoursTaught: total }];
      }
    } else {
      // Multiple instructors: must provide a complete, valid distribution
      if (!instructorHours || !Array.isArray(instructorHours) || instructorHours.length === 0) {
        return res.status(400).json({ error: 'Please specify the hours taught for each instructor.' });
      }

      // Check ownership & non-negative numbers
      for (const ih of instructorHours) {
        if (!assignedIds.has(ih.courseInstructorId)) {
          return res.status(400).json({ error: `Employee assignment ID '${ih.courseInstructorId}' does not belong to this course.` });
        }
        const h = numberValue(ih.hoursTaught);
        if (isNaN(h) || !isFinite(h) || h < 0) {
          return res.status(400).json({ error: 'Employee hours taught must be finite non-negative numbers.' });
        }
      }

      // Ensure every assigned instructor has an allocation
      const suppliedIds = new Set(instructorHours.map(ih => ih.courseInstructorId));
      for (const ci of course.instructors) {
        if (!suppliedIds.has(ci.id)) {
          return res.status(400).json({ error: `Missing hour allocation for assigned instructor '${ci.instructor.name}'.` });
        }
      }

      // Sum of distributed hours must match total
      const sum = instructorHours.reduce((acc, curr) => acc + numberValue(curr.hoursTaught), 0);
      if (Math.abs(sum - total) > 0.01) {
        return res.status(400).json({
          error: `Sum of distributed instructor hours (${sum.toFixed(1)} h) must exactly match total course hours (${total.toFixed(1)} h).`
        });
      }

      finalInstructorHours = instructorHours.map(ih => ({
        courseInstructorId: ih.courseInstructorId,
        hoursTaught: numberValue(ih.hoursTaught)
      }));
    }

    // Atomic transaction for completion and hour allocation
    await prisma.$transaction(async (tx) => {
      await tx.cycle.update({
        where: { id },
        data: {
          totalHours: total,
          isFinished: true
        }
      });

      for (const ih of finalInstructorHours) {
        await tx.courseInstructor.update({
          where: { id: ih.courseInstructorId },
          data: { hoursTaught: ih.hoursTaught }
        });
      }
    });

    await savePayrollRecord(id);
    await logAction(
      'FINISH_COURSE',
      `Completed course ${course.name} with ${total} hours allocated across ${finalInstructorHours.length} instructor(s) with unpaid earnings and no payment dates`,
      req.user.username
    );

    res.json({ message: 'Course marked as finished.' });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

export const revertFinish = atomic(async (req, res, next) => {
  try {
    const course = await prisma.cycle.findUnique({ where: { id: req.params.id } });
    if (!course) return res.status(404).json({ error: 'Course not found.' });
    if (course.archivedAt) return res.status(409).json({ error: 'Restore the archived course before reopening it.' });
    await prisma.cycle.update({ where: { id: course.id }, data: { isFinished: false } });
    await logAction('REOPEN_COURSE', `Reopened ${course.name}; recorded teaching hours, instructor earnings, payment batches, and student payments retained.`, req.user.username);
    res.json({ message: 'Course reopened. All existing financial records have been preserved.' });
  } catch (error) { next(error); }
});

export const getCourseEnrollments = async (req, res, next) => {
  try {
    const isJunior = req.user.role === 'user';
    const { id } = req.params;
    const course = await prisma.cycle.findUnique({
      where: { id },
      include: {
        enrollments: {
          include: { student: true, bookPayments: activeBookInclude, payments: paymentSummaryInclude },
          orderBy: { enrolledAt: 'asc' }
        }
      }
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    if (course.archivedAt && !isManager(req.user)) return res.status(404).json({ error: 'Course not found.' });

    const view = courseView(course, req.user);
    res.json({ course: { id: course.id, name: course.name, branch: course.branch, courseFee: course.courseFee }, enrollments: view.enrollments,
      stats: { totalEnrolled: view.totalEnrolled, totalExpectedRevenue: view.totalExpectedRevenue, totalCollectedRevenue: view.totalCollectedRevenue, totalRemainingBalance: view.totalRemainingBalance } });
  } catch (error) {
    next(error);
  }
};

// @desc    Enroll a student into a course
// @route   POST /api/courses/:id/enrollments
// @access  Private (All authenticated users)
export const enrollStudentHandler = async (req, res, next) => {
  try {
    const isJunior = req.user.role === 'user';
    const { id } = req.params;
    let { studentId, amountPaid, customFee } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required.' });
    }

    const course = await prisma.cycle.findUnique({ where: { id } });
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }
    if (course.archivedAt) return res.status(409).json({ error: 'Restore the archived course before enrolling students.' });

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    if (student.deletedAt) return res.status(isManager(req.user) ? 400 : 404).json({ error: isManager(req.user) ? 'Restore the deleted student before enrolling them.' : 'Student not found.' });

    const existing = await prisma.enrollment.findUnique({
      where: {
        courseId_studentId: {
          courseId: id,
          studentId
        }
      }
    });

    if (existing) {
      return res.status(400).json({ error: `Student '${student.name}' is already enrolled in this course.` });
    }

    if (req.body.recordPayment !== undefined && typeof req.body.recordPayment !== 'boolean') return res.status(400).json({ error: 'Record payment must be a checkbox value.' });
    if (req.body.exempt !== undefined && typeof req.body.exempt !== 'boolean') return res.status(400).json({ error: 'Exemption must be a checkbox value.' });
    const exempt = req.body.exempt === true;
    let parsedCustomFee = exempt ? 0 : null;
    if (!exempt && customFee !== undefined && customFee !== null && customFee !== '') {
      if (!isManager(req.user)) return res.status(403).json({ error: 'Only managers can set custom discounted fees. Staff may select the exemption option.' });
      parsedCustomFee = Number(moneyMinor(customFee, 'Custom tuition fee')) / 100;
      if (parsedCustomFee > course.courseFee) return res.status(400).json({ error: 'A custom discounted fee cannot exceed the standard course fee.' });
    }
    const effectiveFee = parsedCustomFee ?? course.courseFee;
    const parsedAmountPaid = !exempt && req.body.recordPayment === true ? Number(moneyMinor(amountPaid, 'Amount received')) / 100 : 0;
    assertWithinFee(parsedAmountPaid, effectiveFee);
    const metadata = paymentFields(req.body);
    if (!isManager(req.user)) return queueStudentRequest(req, res, 'ENROLL_STUDENT', { studentId, recordPayment: req.body.recordPayment === true, exempt, amountPaid: parsedAmountPaid, ...metadata }, { courseId: id, studentId });
    const enrollment = await prisma.enrollment.create({
      data: {
        courseId: id,
        studentId,
        amountPaid: parsedAmountPaid,
        customFee: parsedCustomFee
      },
      include: {
        student: true
      }
    });

    await logAction(
      'ENROLL_STUDENT',
      `Enrolled ${student.name} in course ${course.name} (${course.branch})${isJunior ? '' : ` - Fee: ${effectiveFee} EGP, Paid: ${parsedAmountPaid} EGP`}`,
      req.user.username
    );

    await openingBalance(enrollment, course, student, req.user, paymentFields(req.body));
    const remainingBalance = Math.max(0, effectiveFee - enrollment.amountPaid);
    let status = 'UNPAID';
    if (effectiveFee === 0) status = 'EXEMPT';
    else if (enrollment.amountPaid >= effectiveFee) status = 'PAID';
    else if (enrollment.amountPaid > 0) status = 'PARTIAL';


    res.status(201).json({
      ...enrollment,
      effectiveFee,
      remainingBalance,
      status
    });
  } catch (error) {
    next(error);
  }
};
export const enrollStudent = atomic(enrollStudentHandler);

// @desc    Update enrollment payment or fee
// @route   PUT /api/courses/:id/enrollments/:enrollmentId
// @access  Private (Managers only)
export const updateEnrollment = atomic(async (req, res, next) => {
  try {
    if (req.user.role === 'user') {
      return res.status(403).json({ error: 'Permission denied. Only managers can update tuition fees and payment records.' });
    }

    const { id, enrollmentId } = req.params;
    let { amountPaid, customFee } = req.body;

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { student: true, course: true }
    });

    if (!enrollment || enrollment.courseId !== id || (!isManager(req.user) && enrollment.student.deletedAt)) {
      return res.status(404).json({ error: 'Enrollment record not found for this course.' });
    }

    const updateData = {};

    let parsedCustomFee = enrollment.customFee;
    if (customFee !== undefined) {
      if (customFee !== null && customFee !== '') {
        const parsed = numberValue(customFee);
        if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) {
          return res.status(400).json({ error: 'Custom fee must be a finite non-negative number.' });
        }
        parsedCustomFee = parsed;
        updateData.customFee = parsed;
      } else {
        parsedCustomFee = null;
        updateData.customFee = null;
      }
    }

    if (amountPaid !== undefined) return res.status(400).json({ error: 'Use payment history to record payments, refunds, or corrections. Payment totals cannot be overwritten.' });
    if (parsedCustomFee !== null) {
      moneyMinor(parsedCustomFee, 'Custom fee');
      if (parsedCustomFee > enrollment.course.courseFee) return res.status(400).json({ error: 'The custom fee cannot exceed the standard course fee.' });
    }
    assertWithinFee(enrollment.amountPaid, parsedCustomFee ?? enrollment.course.courseFee);

    const updated = await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: updateData,
      include: { student: true }
    });

    const effectiveFee = updated.customFee !== null ? updated.customFee : (enrollment.course.courseFee || 0);
    const remainingBalance = Math.max(0, effectiveFee - updated.amountPaid);
    let status = 'UNPAID';
    if (effectiveFee === 0) status = 'EXEMPT';
    else if (updated.amountPaid >= effectiveFee) status = 'PAID';
    else if (updated.amountPaid > 0) status = 'PARTIAL';

    await logAction(
      'UPDATE_ENROLLMENT',
      `Updated enrollment for ${enrollment.student.name} in ${enrollment.course.name} (${enrollment.course.branch}): Paid ${enrollment.amountPaid} -> ${updated.amountPaid} EGP, CustomFee: ${enrollment.customFee} -> ${updated.customFee}`,
      req.user.username
    );

    res.json({
      ...updated,
      effectiveFee,
      remainingBalance,
      status
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Remove student enrollment from course
// @route   DELETE /api/courses/:id/enrollments/:enrollmentId
// @access  Private (All authenticated users)
export const removeEnrollmentHandler = async (req, res, next) => {
  try {
    const isJunior = req.user.role === 'user';
    const { id, enrollmentId } = req.params;

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { student: true, course: true }
    });

    if (!enrollment || enrollment.courseId !== id || (!isManager(req.user) && enrollment.student.deletedAt)) {
      return res.status(404).json({ error: 'Enrollment record not found for this course.' });
    }

    const keep = financialChoice(req.body);
    if (enrollment.deletedAt) return res.status(409).json({ error: 'This enrollment has already been archived.' });
    if (!isManager(req.user)) return queueStudentRequest(req, res, 'REMOVE_ENROLLMENT', { keepFinancialRecords: keep, confirm: true }, { studentId: enrollment.studentId, courseId: id, enrollmentId });
    await prisma.enrollment.update({ where: { id: enrollmentId }, data: { deletedAt: new Date(), deletedBy: req.user.username, financialArchivedAt: keep ? null : new Date() } });

    await logAction(
      'UNENROLL_STUDENT',
      `Archived enrollment for ${enrollment.student.name} in ${enrollment.course.name}; financial records ${keep ? "kept in totals" : "soft-deleted from totals"}; no refund issued.`,
      req.user.username
    );

    res.json({
      message: `Enrollment archived; financial records ${keep ? "remain in" : "are excluded from"} course totals.`,
      amountPaid: enrollment.amountPaid
    });
  } catch (error) {
    next(error);
  }
};
export const removeEnrollment = atomic(removeEnrollmentHandler);

export const restoreCourse = atomic(async (req, res, next) => {
  try {
    const existing = await prisma.cycle.findUnique({ where: { id: req.params.id }, include: { parentCourse: true } });
    if (!existing) return res.status(404).json({ error: 'Cycle not found.' });
    if (existing.parentCourse.archivedAt) return res.status(409).json({ error: 'Restore the parent course first.' });
    const course = await prisma.cycle.update({ where: { id: req.params.id }, data: { archivedAt: null, archivedBy: null } });
    await logAction('RESTORE_COURSE', `Restored archived course ${course.name}.`, req.user.username);
    res.json(course);
  } catch (error) { next(error); }
});

export const replaceInstructor = atomic(async (req, res, next) => {
  try {
    const { id, courseInstructorId } = req.params;
    const course = await prisma.cycle.findUnique({ where: { id } });
    const old = await prisma.courseInstructor.findFirst({ where: { id: courseInstructorId, courseId: id }, include: { instructor: true } });
    const replacement = typeof req.body.instructorId === 'string' ? await prisma.instructor.findUnique({ where: { id: req.body.instructorId } }) : null;
    if (!course || !old || !replacement) return res.status(404).json({ error: 'Course, current assignment, or replacement instructor not found.' });
    if (course.archivedAt || course.isFinished) return res.status(409).json({ error: 'Reopen an unarchived course before changing its teaching team.' });
    if (await prisma.courseInstructor.findUnique({ where: { courseId_instructorId: { courseId: id, instructorId: replacement.id } } })) return res.status(400).json({ error: 'The replacement instructor is already assigned to this course.' });
    if (isManager(req.user)) {
      const rate = numberValue(req.body.hourlyRate, 'Hourly rate');
      await prisma.courseInstructor.delete({ where: { id: old.id } });
      const result = await prisma.courseInstructor.create({ data: { courseId: id, instructorId: replacement.id, hourlyRate: rate }, include: { instructor: true } });
      await logAction('REPLACE_INSTRUCTOR', `Replaced ${old.instructor.name} with ${replacement.name} in ${course.name}. Retained completed payroll records.`, req.user.username);
      return res.json(result);
    }
    const duplicate = await prisma.pendingAssignment.findFirst({ where: { courseId: id, replacedAssignmentId: old.id, type: 'REPLACE', status: 'PENDING' } });
    if (duplicate) return res.status(409).json({ error: 'A replacement request is already pending for this assignment.' });
    const pending = await prisma.pendingAssignment.create({ data: { courseId: id, instructorId: replacement.id, replacedAssignmentId: old.id, replacedInstructorId: old.instructorId, type: 'REPLACE', submittedById: req.user.id } });
    const managers = await prisma.user.findMany({ where: { role: { in: ['admin', 'mod'] }, isActive: true, isBanned: false }, select: { id: true } });
    if (managers.length) await prisma.notification.createMany({ data: managers.map(user => ({ userId: user.id, title: 'Instructor Replacement Request', message: `${req.user.username} requested replacing ${old.instructor.name} with ${replacement.name} in ${course.name}.`, type: 'ASSIGNMENT_REQUEST', relatedId: pending.id })) });
    await logAction('REPLACE_INSTRUCTOR_PENDING', `Requested replacing ${old.instructor.name} with ${replacement.name} in ${course.name}.`, req.user.username);
    res.json({ message: 'Replacement requested. A manager must approve it and set the rate.', pending });
  } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); next(error); }
});
