import {randomUUID} from 'node:crypto';
import prisma from '../db/prisma.js';


export async function studentRequestSnapshot({ studentId, courseId, enrollmentId }) {
  const student = studentId ? await prisma.student.findUnique({ where: { id: studentId } }) : null;
  const course = courseId ? await prisma.cycle.findUnique({ where: { id: courseId }, select: { id: true, name: true, branch: true, updatedAt: true, archivedAt: true } }) : null;
  const enrollments = studentId ? await prisma.enrollment.findMany({ where: { studentId, ...(enrollmentId ? { id: enrollmentId } : {}) }, orderBy: { id: 'asc' }, select: { id: true, updatedAt: true, amountPaid: true, deletedAt: true, financialArchivedAt: true } }) : [];
  return { student, course, enrollments };
}
export async function queueStudentRequest(req, res, action, payload, targets = {}) {
  const pendingKey = action==='CREATE_AND_ENROLL'?`create-enroll:${targets.courseId}:${payload.newStudent?.registrationNumber||randomUUID()}`:action === 'CREATE_STUDENT' ? `create:${payload.registrationNumber||randomUUID()}` : action === 'ENROLL_STUDENT' ? `enroll:${targets.courseId}:${targets.studentId}` : `${action}:${targets.enrollmentId || targets.studentId}`;
  if (await prisma.studentRequest.findUnique({ where: { pendingKey } })) return res.status(409).json({ error: 'An approval request for this action is already pending.' });
  const snapshot = await studentRequestSnapshot(targets);
  const request = await prisma.studentRequest.create({ data: { action, submittedById: req.user.id, ...targets, payload: JSON.stringify(payload), snapshot: JSON.stringify(snapshot), pendingKey } });
  const name = payload.name || payload.newStudent?.name || snapshot.student?.name || 'Student';
  const removal = action === 'DELETE_STUDENT' || action === 'REMOVE_ENROLLMENT';
  const title = removal ? 'Student removal requested' : 'Student addition requested';
  const message = `@${req.user.username} requested to ${removal ? 'remove' : 'add'} student ${name}${snapshot.course ? ' in ' + snapshot.course.name : ' in the student directory'}.`;
  const managers = await prisma.user.findMany({ where: { role: { in: ['admin', 'mod'] }, isActive: true }, select: { id: true } });
  await prisma.notification.createMany({ data: [...new Set([req.user.id, ...managers.map(u => u.id)])].map(userId => ({ userId, title, message, type: 'STUDENT_REQUEST', relatedId: request.id })) });
  res.status(202).json({ pending: true, requestId: request.id, message: 'Student request submitted for approval. No student or payment records have changed.' });
}
