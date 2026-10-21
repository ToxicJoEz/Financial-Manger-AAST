import prisma, { atomic } from '../db/prisma.js';
import { studentRequestSnapshot } from '../utils/studentRequests.js';
import { createStudentHandler, deleteStudentHandler } from './studentController.js';
import { enrollStudentHandler, removeEnrollmentHandler } from './courseController.js';
import { logAction } from '../utils/logger.js';

export const getStudentRequest = async (req, res, next) => {
  try {
    const request = await prisma.studentRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: 'Student request no longer exists.' });
    if (request.status !== 'PENDING') return res.status(409).json({ error: 'This request has already been processed. Refresh your notifications.' });
    const submittedBy = await prisma.user.findUnique({ where: { id: request.submittedById }, select: { username: true, firstName: true, lastName: true } });
    res.json({ ...request, payload: JSON.parse(request.payload), snapshot: JSON.parse(request.snapshot), submittedBy, kind: 'STUDENT' });
  } catch (error) { next(error); }
};

export const decideStudentRequest = atomic(async (req, res, next) => {
  try {
    const request = await prisma.studentRequest.findUnique({ where: { id: req.params.id } });
    if (!request) return res.status(404).json({ error: 'Student request no longer exists.' });
    if (request.status !== 'PENDING') return res.status(409).json({ error: 'This request has already been processed.' });
    const approve = req.params.decision === 'approve';
    if (!approve && req.params.decision !== 'reject') return res.status(400).json({ error: 'Invalid decision.' });
    const payload = JSON.parse(request.payload);
    if (approve) {
      const current = await studentRequestSnapshot(request);
      if (JSON.stringify(current) !== request.snapshot) return res.status(409).json({ error: 'The student, cycle, or payment records changed after this request. Reject it and ask for a new request so the correct details can be reviewed.' });
    }
    const claimed = await prisma.studentRequest.updateMany({ where: { id: request.id, status: 'PENDING' }, data: { status: approve ? 'APPROVED' : 'REJECTED', resolvedById: req.user.id, pendingKey: null } });
    if (claimed.count !== 1) return res.status(409).json({ error: 'Another reviewer already processed this request.' });
    if (approve) {
      const handlers = { CREATE_STUDENT: createStudentHandler, DELETE_STUDENT: deleteStudentHandler, ENROLL_STUDENT: enrollStudentHandler, REMOVE_ENROLLMENT: removeEnrollmentHandler };
      const handler = handlers[request.action];
      if (!handler) throw new Error('Unsupported student request action.');
      let result, status = 200;
      const response = { status(code) { status = code; return this; }, json(body) { result = body; return this; } };
      await handler({ ...req, body: payload, params: { id: request.courseId || request.studentId, enrollmentId: request.enrollmentId } }, response, error => { throw error; });
      if (!result || status >= 400) throw Object.assign(new Error(result?.error || 'Student request could not be applied.'), { status: status >= 400 ? status : 500 });
    }
    await prisma.notification.updateMany({ where: { relatedId: request.id, type: 'STUDENT_REQUEST' }, data: { isResolved: true, resolvedBy: req.user.username, isRead: true } });
    const snapshot = JSON.parse(request.snapshot);
    const name = payload.name || snapshot.student?.name || 'Student';
    await prisma.notification.create({ data: { userId: request.submittedById, title: approve ? 'Student request accepted' : 'Student request rejected', message: `Your request for ${name}${snapshot.course ? ' in ' + snapshot.course.name : ''} was ${approve ? 'accepted' : 'rejected'} by @${req.user.username}.`, type: approve ? 'STUDENT_APPROVED' : 'STUDENT_REJECTED', relatedId: request.id, isResolved: true, resolvedBy: req.user.username } });
    await logAction(approve ? 'APPROVE_STUDENT_REQUEST' : 'REJECT_STUDENT_REQUEST', `${request.action} request ${request.id} for ${name}`, req.user.username);
    res.json({ message: approve ? 'Student request approved and applied.' : 'Student request rejected. No student or financial records changed.' });
  } catch (error) { next(error); }
});
