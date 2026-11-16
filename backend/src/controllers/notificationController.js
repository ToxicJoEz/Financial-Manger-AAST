import prisma, { atomic } from '../db/prisma.js';

// New cycles a branch mod created: the notification points at the cycle itself.
const CYCLE_TYPES = ['CYCLE_REQUEST', 'CYCLE_APPROVED', 'CYCLE_REJECTED'];
async function cycleDetails(notifications) {
  const ids = [...new Set(notifications.filter(n => CYCLE_TYPES.includes(n.type)).map(n => n.relatedId))];
  if (!ids.length) return new Map();
  const cycles = await prisma.cycle.findMany({
    where: { id: { in: ids.filter(Boolean) } },
    select: {
      id: true,
      name: true,
      branch: true,
      approvalStatus: true,
      rejectionReason: true,
      createdById: true,
      parentCourse: { select: { isPrivate: true } }
    }
  });
  const people = await prisma.user.findMany({
    where: { id: { in: cycles.map(c => c.createdById).filter(Boolean) } },
    select: { id: true, username: true }
  });
  const name = new Map(people.map(p => [p.id, p.username]));
  return new Map(
    cycles.map(c => [
      c.id,
      {
        kind: 'CYCLE',
        id: c.id,
        type: 'CYCLE',
        status: c.approvalStatus,
        courseId: c.id,
        rejectionReason: c.rejectionReason,
        course: { name: c.name, branch: c.branch, parentCourse: c.parentCourse },
        submittedBy: name.has(c.createdById) ? { username: name.get(c.createdById) } : null
      }
    ])
  );
}

async function requestDetails(notifications) {
  const cycles = await cycleDetails(notifications);
  const ids = [
    ...new Set(
      notifications
        .filter(n => !CYCLE_TYPES.includes(n.type))
        .map(n => n.relatedId)
        .filter(Boolean)
    )
  ];
  const requests = ids.length
    ? await prisma.pendingAssignment.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          type: true,
          status: true,
          courseId: true,
          instructor: { select: { name: true } },
          course: { select: { name: true, parentCourse: { select: { isPrivate: true } } } },
          submittedBy: { select: { username: true } },
          resolvedBy: { select: { username: true } }
        }
      })
    : [];
  const byId = new Map(requests.map(r => [r.id, r]));
  return notifications.map(n => {
    if (CYCLE_TYPES.includes(n.type)) {
      const cycle = cycles.get(n.relatedId) || null;
      return {
        ...n,
        action: 'CYCLE',
        status: cycle?.status || (n.type === 'CYCLE_REJECTED' ? 'REJECTED' : n.isResolved ? 'RESOLVED' : 'OTHER'),
        request: cycle
      };
    }
    const request = byId.has(n.relatedId) ? { ...byId.get(n.relatedId), kind: 'INSTRUCTOR' } : null;
    return {
      ...n,
      resolvedBy: n.resolvedBy || request?.resolvedBy?.username || null,
      action: request?.type || 'OTHER',
      status:
        request?.status ||
        (n.type === 'ASSIGNMENT_APPROVED'
          ? 'APPROVED'
          : n.type === 'ASSIGNMENT_REJECTED'
            ? 'REJECTED'
            : n.isResolved
              ? 'RESOLVED'
              : 'OTHER'),
      request: request || null
    };
  });
}

export const getNotificationHistory = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const status = String(req.query.status || ''),
      action = String(req.query.action || ''),
      search = String(req.query.search || '')
        .trim()
        .slice(0, 200);
    const own = { userId: req.user.id };
    const clauses = [own];
    if (req.query.unread === 'true') clauses.push({ isRead: false });
    if (search) clauses.push({ OR: [{ title: { contains: search } }, { message: { contains: search } }] });
    if (status || action) {
      if (
        (status && !['PENDING', 'APPROVED', 'REJECTED', 'RESOLVED'].includes(status)) ||
        (action && !['ASSIGN', 'REMOVE', 'REPLACE', 'CYCLE'].includes(action))
      )
        return res.status(400).json({ error: 'Invalid notification filter.' });
      const related = await prisma.notification.findMany({
        where: own,
        select: { relatedId: true },
        distinct: ['relatedId']
      });
      const relatedIds = related.map(n => n.relatedId).filter(Boolean);
      const decided = status ? (status === 'RESOLVED' ? { not: 'PENDING' } : status) : undefined;
      const requests =
        action === 'CYCLE'
          ? []
          : await prisma.pendingAssignment.findMany({
              where: {
                id: { in: relatedIds },
                ...(action ? { type: action } : {}),
                ...(decided ? { status: decided } : {})
              },
              select: { id: true }
            });
      const cycles =
        !action || action === 'CYCLE'
          ? await prisma.cycle.findMany({
              where: { id: { in: relatedIds }, ...(decided ? { approvalStatus: decided } : {}) },
              select: { id: true }
            })
          : [];
      const matching = [
        { relatedId: { in: requests.map(r => r.id) }, type: { notIn: CYCLE_TYPES } },
        { relatedId: { in: cycles.map(c => c.id) }, type: { in: CYCLE_TYPES } }
      ];
      if (!action && status === 'APPROVED') matching.push({ type: 'ASSIGNMENT_APPROVED' });
      if (!action && status === 'REJECTED') matching.push({ type: 'ASSIGNMENT_REJECTED' });
      if (!action && status === 'RESOLVED')
        matching.push({ isResolved: true }, { type: { in: ['ASSIGNMENT_APPROVED', 'ASSIGNMENT_REJECTED'] } });
      clauses.push({ OR: matching });
    }
    const where = { AND: clauses },
      pageSize = 20;
    const [total, unread, notifications] = await prisma.$transaction([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...own, isRead: false } }),
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    res.json({ items: await requestDetails(notifications), total, unread, page, pageSize });
  } catch (error) {
    next(error);
  }
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

export const markAsRead = atomic(async (req, res) => {
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
});

export const markAllAsRead = atomic(async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true }
    });
    res.json({ message: 'All marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
