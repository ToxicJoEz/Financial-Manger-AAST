import { numberValue } from '../utils/numbers.js';
import prisma, { atomic } from '../db/prisma.js';
import { logAction } from '../utils/logger.js';

export const approveAssignment = atomic(async (req, res) => {
  try {
    const { id } = req.params;
    const { hourlyRate } = req.body;

    const pending = await prisma.pendingAssignment.findUnique({
      where: { id },
      include: { course: true, instructor: true, submittedBy: { select: { username: true } } }
    });

    if (!pending) {
      return res.status(404).json({ error: 'Pending assignment not found' });
    }
    if (pending.status !== 'PENDING') {
      return res.status(400).json({ error: 'Assignment has already been processed' });
    }

    const isRemoval = pending.type === 'REMOVE';
    const isReplacement = pending.type === 'REPLACE';
    if (pending.course.archivedAt || pending.course.isFinished) return res.status(409).json({ error: 'Reopen the unarchived course before approving changes to its teaching team.' });

    if (!isRemoval) {
      if (hourlyRate === undefined || isNaN(numberValue(hourlyRate)) || numberValue(hourlyRate) < 0) {
        return res.status(400).json({ error: 'A valid non-negative hourly rate must be provided when approving an assignment.' });
      }
    }

    // Atomic transaction: status update, assignment mutation, notifications
    await prisma.$transaction(async (tx) => {
      // 1. Concurrency Guard: Atomically claim and approve the request
      const updateResult = await tx.pendingAssignment.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          resolvedById: req.user.id
        }
      });

      if (updateResult.count === 0) {
        throw new Error('CONCURRENCY_ERROR: Assignment has already been processed or is no longer pending.');
      }

      // A replacement is one atomic removal/addition, never two independently approved requests.
      if (isReplacement) {
        const old = await tx.courseInstructor.findFirst({ where: { id: pending.replacedAssignmentId || '', courseId: pending.courseId, instructorId: pending.replacedInstructorId || '' } });
        if (!old) throw Object.assign(new Error('The original assignment has changed. Reject this stale replacement request.'), { status: 409 });
        await tx.courseInstructor.delete({ where: { id: old.id } });
      }
      // 2. Apply changes to the Course
      if (isRemoval) {
        // Removal: delete instructor from course
        await tx.courseInstructor.deleteMany({
          where: {
            courseId: pending.courseId,
            instructorId: pending.instructorId
          }
        });
      } else {
        // Assignment: verify not already assigned
        const alreadyAssigned = await tx.courseInstructor.findFirst({
          where: {
            courseId: pending.courseId,
            instructorId: pending.instructorId
          }
        });

        if (alreadyAssigned) {
          throw new Error('DUPLICATE_ASSIGNMENT: Employee is already assigned to this course.');
        }

        await tx.courseInstructor.create({
          data: {
            courseId: pending.courseId,
            instructorId: pending.instructorId,
            hourlyRate: numberValue(hourlyRate)
          }
        });
      }

      // 3. Mark related notifications as resolved
      await tx.notification.updateMany({
        where: { relatedId: id, type: 'ASSIGNMENT_REQUEST' },
        data: { isResolved: true, resolvedBy: req.user.username, isRead: true }
      });

      // 4. Notify the submitter
      const actionLabel = isRemoval ? 'removal of' : isReplacement ? 'replacement with' : 'assignment for';
      const instructorName = pending.instructor ? pending.instructor.name : 'instructor';

      await tx.notification.create({
        data: {
          userId: pending.submittedById,
          title: isRemoval ? 'Removal Request Approved' : 'Assignment Approved',
          message: `Your request for ${actionLabel} <span class="font-bold text-emerald-600">${instructorName}</span> in <span class="font-bold text-emerald-600">${pending.course.name}</span> was approved by <span class="font-bold text-blue-600">@${req.user.username}</span>.`,
          type: 'ASSIGNMENT_APPROVED',
          relatedId: id
        }
      });
    });

    // 5. System Audit Log
    const instructorName = pending.instructor ? pending.instructor.name : pending.instructorId;
    const logDesc = isRemoval
      ? `Approved removal of instructor ${instructorName} from course ${pending.course.name}`
      : `Approved assignment of instructor ${instructorName} to course ${pending.course.name} at ${numberValue(hourlyRate)} EGP/hr`;

    await logAction('ASSIGNMENT_APPROVED', logDesc, req.user.username, pending.submittedBy.username);

    res.json({ message: isRemoval ? 'Employee removal approved successfully' : 'Assignment approved successfully' });
  } catch (error) {
    if (error.message?.includes('CONCURRENCY_ERROR')) {
      return res.status(409).json({ error: 'Assignment has already been processed by another reviewer.' });
    }
    if (error.message?.includes('DUPLICATE_ASSIGNMENT') || error.code === 'P2002') {
      return res.status(400).json({ error: 'Employee is already assigned to this course.' });
    }
    res.status(error.status || 500).json({ error: error.message });
  }
});

export const rejectAssignment = atomic(async (req, res) => {
  try {
    const { id } = req.params;
    
    const pending = await prisma.pendingAssignment.findUnique({
      where: { id },
      include: { course: true, instructor: true, submittedBy: { select: { username: true } } }
    });
    
    if (!pending) {
      return res.status(404).json({ error: 'Pending assignment not found' });
    }
    if (pending.status !== 'PENDING') {
      return res.status(400).json({ error: 'Assignment is already processed' });
    }

    // Atomic transaction with concurrency guard
    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.pendingAssignment.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          resolvedById: req.user.id
        }
      });

      if (updateResult.count === 0) {
        throw new Error('CONCURRENCY_ERROR: Assignment has already been processed or is no longer pending.');
      }

      // Mark related notifications as resolved
      await tx.notification.updateMany({
        where: { relatedId: id, type: 'ASSIGNMENT_REQUEST' },
        data: { isResolved: true, resolvedBy: req.user.username, isRead: true }
      });

      // Notify the submitter
      const isRemoval = pending.type === 'REMOVE';
      const actionLabel = isRemoval ? 'removal of' : 'assignment for';
      const instructorName = pending.instructor ? pending.instructor.name : 'instructor';

      await tx.notification.create({
        data: {
          userId: pending.submittedById,
          title: isRemoval ? 'Removal Request Rejected' : 'Assignment Rejected',
          message: `Your request for ${actionLabel} <span class="font-bold text-emerald-600">${instructorName}</span> in <span class="font-bold text-emerald-600">${pending.course.name}</span> was rejected by <span class="font-bold text-blue-600">@${req.user.username}</span>.`,
          type: 'ASSIGNMENT_REJECTED',
          relatedId: id
        }
      });
    });

    const isRemoval = pending.type === 'REMOVE';
    const instructorName = pending.instructor ? pending.instructor.name : pending.instructorId;
    const logDesc = isRemoval
      ? `Rejected removal request for instructor ${instructorName} from course ${pending.course.name}`
      : `Rejected assignment request for instructor ${instructorName} to course ${pending.course.name}`;

    await logAction('ASSIGNMENT_REJECTED', logDesc, req.user.username, pending.submittedBy.username);

    res.json({ message: 'Assignment request rejected' });
  } catch (error) {
    if (error.message?.includes('CONCURRENCY_ERROR')) {
      return res.status(409).json({ error: 'Assignment has already been processed.' });
    }
    res.status(error.status || 500).json({ error: error.message });
  }
});

export const undoAssignment = atomic(async (req, res) => {
  try {
    const { id } = req.params;
    
    const pending = await prisma.pendingAssignment.findUnique({
      where: { id },
      include: { course: true, instructor: true }
    });

    if (!pending) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    if (pending.submittedById !== req.user.id && req.user.role === 'user') {
      return res.status(403).json({ error: 'Not authorized to undo this request' });
    }
    
    if (pending.status !== 'PENDING') {
      return res.status(400).json({ error: 'Cannot undo processed requests' });
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.pendingAssignment.deleteMany({ where: { id, status: 'PENDING', ...(req.user.role === 'user' ? { submittedById: req.user.id } : {}) } });
      if (claimed.count !== 1) throw Object.assign(new Error('This request has already been processed. Refresh the page.'), { status: 409 });
      await tx.notification.deleteMany({ where: { relatedId: id } });
    });

    const isRemoval = pending.type === 'REMOVE';
    const instructorName = pending.instructor ? pending.instructor.name : pending.instructorId;
    const logDesc = isRemoval
      ? `User @${req.user.username} withdrew removal request for instructor ${instructorName} from course ${pending.course.name}`
      : `User @${req.user.username} withdrew assignment request for instructor ${instructorName} to course ${pending.course.name}`;

    await logAction('ASSIGNMENT_WITHDRAWN', logDesc, req.user.username);

    res.json({ message: 'Assignment request withdrawn' });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Fetch only review details; compensation and user credentials are not needed here.
export const getAssignmentReview = async (req, res, next) => {
  try {
    const request = await prisma.pendingAssignment.findUnique({ where: { id: req.params.id }, select: {
      id: true, type: true, status: true, courseId: true,
      instructor: { select: { id: true, name: true } },
      course: { select: { id: true, name: true, branch: true } },
      submittedBy: { select: { username: true, firstName: true, lastName: true } }
    } });
    if (!request) return res.status(404).json({ error: 'This request no longer exists.' });
    if (request.status !== 'PENDING') return res.status(409).json({ error: 'This request has already been processed. Refresh your notifications.' });
    res.json(request);
  } catch (error) { next(error); }
};
