import prisma from '../db/prisma.js';

async function requestDetails(notifications) {
  const ids = [...new Set(notifications.map(n => n.relatedId).filter(Boolean))];
  const requests = ids.length ? await prisma.pendingAssignment.findMany({ where: { id: { in: ids } }, select: { id: true, type: true, status: true, courseId: true, instructor: { select: { name: true } }, course: { select: { name: true } }, submittedBy: { select: { username: true } }, resolvedBy: { select: { username: true } } } }) : [];
  const studentRequests = ids.length ? await prisma.studentRequest.findMany({ where: { id: { in: ids } }, select: { id: true, action: true, status: true, submittedById: true, courseId: true, snapshot: true, payload: true, resolvedById: true } }) : [];
  const actors = studentRequests.length ? await prisma.user.findMany({ where: { id: { in: [...new Set(studentRequests.flatMap(r => [r.submittedById, r.resolvedById]).filter(Boolean))] } }, select: { id: true, username: true } }) : [];
  const studentById = new Map(studentRequests.map(r => {
    const snapshot = JSON.parse(r.snapshot), payload = JSON.parse(r.payload);
    return [r.id, { id: r.id, kind: 'STUDENT', type: ['DELETE_STUDENT', 'REMOVE_ENROLLMENT'].includes(r.action) ? 'REMOVE' : 'ASSIGN', status: r.status, courseId: r.courseId, course: snapshot.course ? { name: snapshot.course.name } : null, student: { name: payload.name || snapshot.student?.name }, submittedBy: actors.find(a => a.id === r.submittedById), resolvedBy: actors.find(a => a.id === r.resolvedById) }];
  }));
  const byId = new Map(requests.map(r => [r.id, r]));
  return notifications.map(n => {
    const request = studentById.get(n.relatedId) || (byId.has(n.relatedId) ? { ...byId.get(n.relatedId), kind: 'INSTRUCTOR' } : null);
    return { ...n, resolvedBy: n.resolvedBy || request?.resolvedBy?.username || null, action: request?.type || 'OTHER', status: request?.status || (['ASSIGNMENT_APPROVED', 'STUDENT_APPROVED'].includes(n.type) ? 'APPROVED' : ['ASSIGNMENT_REJECTED', 'STUDENT_REJECTED'].includes(n.type) ? 'REJECTED' : n.isResolved ? 'RESOLVED' : 'OTHER'), request: request || null };
  });
}

export const getNotificationHistory = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const status = String(req.query.status || ''), action = String(req.query.action || ''), search = String(req.query.search || '').trim().slice(0, 200);
    const own = { userId: req.user.id };
    const clauses = [own];
    if (req.query.unread === 'true') clauses.push({ isRead: false });
    if (search) clauses.push({ OR: [{ title: { contains: search } }, { message: { contains: search } }] });
    if (status || action) {
      if (status && !['PENDING', 'APPROVED', 'REJECTED', 'RESOLVED'].includes(status) || action && !['ASSIGN', 'REMOVE', 'REPLACE'].includes(action)) return res.status(400).json({ error: 'Invalid notification filter.' });
      const related = await prisma.notification.findMany({ where: own, select: { relatedId: true }, distinct: ['relatedId'] });
      const requests = await prisma.pendingAssignment.findMany({ where: { id: { in: related.map(n => n.relatedId).filter(Boolean) }, ...(action ? { type: action } : {}), ...(status ? { status: status === 'RESOLVED' ? { not: 'PENDING' } : status } : {}) }, select: { id: true } });
      const studentRequests = await prisma.studentRequest.findMany({ where: { id: { in: related.map(n => n.relatedId).filter(Boolean) }, ...(action ? { action: { in: action === 'ASSIGN' ? ['CREATE_STUDENT', 'ENROLL_STUDENT'] : action === 'REMOVE' ? ['DELETE_STUDENT', 'REMOVE_ENROLLMENT'] : [] } } : {}), ...(status ? { status: status === 'RESOLVED' ? { not: 'PENDING' } : status } : {}) }, select: { id: true } });
      const matching = [{ relatedId: { in: [...requests, ...studentRequests].map(r => r.id) } }];
      if (!action && status === 'APPROVED') matching.push({ type: { in: ['ASSIGNMENT_APPROVED', 'STUDENT_APPROVED'] } });
      if (!action && status === 'REJECTED') matching.push({ type: { in: ['ASSIGNMENT_REJECTED', 'STUDENT_REJECTED'] } });
      if (!action && status === 'RESOLVED') matching.push({ isResolved: true }, { type: { in: ['ASSIGNMENT_APPROVED', 'ASSIGNMENT_REJECTED', 'STUDENT_APPROVED', 'STUDENT_REJECTED'] } });
      clauses.push({ OR: matching });
    }
    const where = { AND: clauses }, pageSize = 20;
    const [total, unread, notifications] = await prisma.$transaction([
      prisma.notification.count({ where }), prisma.notification.count({ where: { ...own, isRead: false } }),
      prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize })
    ]);
    res.json({ items: await requestDetails(notifications), total, unread, page, pageSize });
  } catch (error) { next(error); }
};

export const getNotifications = async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to 50 recent
    });
    res.json(await requestDetails(notifications));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await prisma.notification.update({
      where: { id, userId: req.user.id },
      data: { isRead: true }
    });
    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true }
    });
    res.json({ message: 'All marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};