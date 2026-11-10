import { createHash } from 'node:crypto';
import prisma, { atomic } from '../db/prisma.js';
import { logAction } from '../utils/logger.js';
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
async function deletionPlan(kind, id) {
  const record = await prisma[kind].findUnique({ where: { id } });
  if (!record)
    fail({ course: 'Course not found.', subCourse: 'Sub-umbrella not found.' }[kind] || 'Cycle not found.', 404);
  const cycles = await prisma.cycle.findMany({
    where: kind === 'course' ? { parentCourseId: id } : kind === 'subCourse' ? { subCourseId: id } : { id },
    select: { id: true, name: true, updatedAt: true },
    orderBy: { id: 'asc' }
  });
  const ids = cycles.map(c => c.id),
    where = { courseId: { in: ids } };
  const enrollments = await prisma.enrollment.findMany({
    where,
    select: { id: true, updatedAt: true },
    orderBy: { id: 'asc' }
  });
  const bookPayments = await prisma.bookPayment.findMany({
    where: { enrollment: { courseId: { in: ids } } },
    select: { id: true, status: true, reversedAt: true },
    orderBy: { id: 'asc' }
  });
  const payments = await prisma.paymentEntry.findMany({
    where,
    select: { id: true, reversalOfId: true },
    orderBy: { id: 'asc' }
  });
  const earnings = await prisma.payrollEarning.findMany({
    where,
    select: { id: true, batchId: true, updatedAt: true },
    orderBy: { id: 'asc' }
  });
  const payroll = await prisma.payrollRecord.findMany({
    where,
    select: { id: true, updatedAt: true },
    orderBy: { id: 'asc' }
  });
  const assignments = await prisma.courseInstructor.findMany({
    where,
    select: { id: true, updatedAt: true },
    orderBy: { id: 'asc' }
  });
  const pending = await prisma.pendingAssignment.findMany({
    where,
    select: { id: true, updatedAt: true },
    orderBy: { id: 'asc' }
  });
  const notifications = await prisma.notification.findMany({
    where: { relatedId: { in: [...ids, ...pending.map(p => p.id)] } },
    select: { id: true },
    orderBy: { id: 'asc' }
  });
  const imports = await prisma.importBatch.findMany({
    where: { cycleId: { in: ids } },
    select: { id: true },
    orderBy: { id: 'asc' }
  });
  const version = createHash('sha256')
    .update(
      JSON.stringify({
        record,
        cycles,
        enrollments,
        payments,
        bookPayments,
        payroll,
        earnings,
        assignments,
        pending,
        notifications,
        imports
      })
    )
    .digest('hex');
  return {
    record,
    ids,
    earnings,
    paymentIds: payments.map(p => p.id),
    notificationIds: notifications.map(n => n.id),
    version,
    counts: {
      cycles: cycles.length,
      enrollments: enrollments.length,
      payments: payments.length,
      bookPayments: bookPayments.length,
      payroll: earnings.length,
      instructorAssignments: assignments.length,
      requests: pending.length,
      imports: imports.length
    }
  };
}
export const deletionPreview = kind => async (req, res, next) => {
  try {
    const plan = await deletionPlan(kind, req.params.id);
    res.json({ name: plan.record.name, version: plan.version, counts: plan.counts });
  } catch (error) {
    res.status(error.status || 500);
    next(error);
  }
};
// Removes everything a deletion plan covers. Callers must validate confirmation and version first.
async function executePlan(kind, plan, actor) {
  if (plan.earnings.some(e => e.batchId))
    fail(
      `${plan.record.name} contains processing or paid instructor earnings. Archive it to preserve its payment history.`,
      409
    );
  const where = { courseId: { in: plan.ids } };
  await prisma.payrollEarning.deleteMany({ where });
  // Reversal links restrict deletion. Detach the affected graph only after all checks pass.
  if (plan.paymentIds.length) {
    const outside = await prisma.paymentEntry.count({
      where: { reversalOfId: { in: plan.paymentIds }, NOT: { id: { in: plan.paymentIds } } }
    });
    if (outside)
      fail(
        'A payment reversal outside this course references its ledger. Resolve this inconsistency before deleting.',
        409
      );
    await prisma.paymentEntry.updateMany({ where, data: { reversalOfId: null } });
    await prisma.paymentEntry.deleteMany({ where });
  }
  await prisma.notification.deleteMany({ where: { id: { in: plan.notificationIds } } });
  await prisma.importBatch.deleteMany({ where: { cycleId: { in: plan.ids } } });
  await prisma.payrollRecord.deleteMany({ where });
  await prisma.pendingAssignment.deleteMany({ where });
  await prisma.courseInstructor.deleteMany({ where });
  await prisma.enrollment.deleteMany({ where });
  await prisma.cycle.deleteMany({ where: { id: { in: plan.ids } } });
  if (kind === 'subCourse') await prisma.subCourse.delete({ where: { id: plan.record.id } });
  if (kind === 'course') {
    await prisma.subCourse.deleteMany({ where: { parentCourseId: plan.record.id } });
    await prisma.course.delete({ where: { id: plan.record.id } });
  }
  await logAction(
    'PERMANENT_DELETE_' + kind.toUpperCase(),
    `Permanently deleted ${plan.record.name}. Removed ${JSON.stringify(plan.counts)}. Shared student/instructor profiles retained.`,
    actor
  );
}
export const permanentlyDelete = kind =>
  atomic(
    async (req, res, next) => {
      try {
        const plan = await deletionPlan(kind, req.params.id);
        // The dialog's confirmation (no typed name needed).
        if (req.body?.confirm !== true) fail('Confirm permanent deletion.');
        if (req.body.version !== plan.version)
          fail(
            'These records changed since the deletion preview. Close this dialog and review the latest details.',
            409
          );
        await executePlan(kind, plan, req.user.username);
        res.json({
          message: `${{ course: 'Course', subCourse: 'Sub-umbrella' }[kind] || 'Cycle'} permanently deleted.`
        });
      } catch (error) {
        next(error);
      }
    },
    { timeout: 45000 }
  );

// Bulk cycle deletion: each selected cycle is either archived (finances kept) or permanently deleted
// with the same checks as a single permanent deletion, all in one transaction.
const bulkIds = ids => {
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 200 ||
    ids.some(id => typeof id !== 'string') ||
    new Set(ids).size !== ids.length
  )
    fail('Select between 1 and 200 unique cycles.');
  return ids;
};
export const bulkCycleDeletionPreview = async (req, res, next) => {
  try {
    const cycles = [];
    for (const id of bulkIds(
      String(req.query.ids || '')
        .split(',')
        .filter(Boolean)
    )) {
      const plan = await deletionPlan('cycle', id);
      cycles.push({
        id,
        name: plan.record.name,
        branch: plan.record.branch,
        archivedAt: plan.record.archivedAt,
        version: plan.version,
        counts: plan.counts,
        permanentBlocked: plan.earnings.some(e => e.batchId)
      });
    }
    res.json({ cycles });
  } catch (error) {
    res.status(error.status || 500);
    next(error);
  }
};
export const bulkDeleteCycles = atomic(
  async (req, res, next) => {
    try {
      if (req.body?.confirm !== true) fail('Confirm the selected deletions.');
      const items = req.body?.items;
      if (
        !Array.isArray(items) ||
        items.some(
          item =>
            !item ||
            typeof item !== 'object' ||
            !['ARCHIVE', 'DELETE'].includes(item.mode) ||
            typeof item.version !== 'string'
        )
      )
        fail('Choose archive or permanent deletion for every selected cycle.');
      bulkIds(items.map(item => item.id));
      let archived = 0,
        deleted = 0;
      const now = new Date();
      for (const item of items) {
        const plan = await deletionPlan('cycle', item.id);
        if (plan.version !== item.version)
          fail(
            `${plan.record.name} changed since the deletion preview. Close this dialog and review the latest details.`,
            409
          );
        if (item.mode === 'DELETE') {
          await executePlan('cycle', plan, req.user.username);
          deleted++;
        } else {
          if (!plan.record.archivedAt) {
            await prisma.cycle.update({
              where: { id: plan.record.id },
              data: { archivedAt: now, archivedBy: req.user.username }
            });
            await logAction(
              'ARCHIVE_COURSE',
              `Archived ${plan.record.name}; tuition and payroll records retained.`,
              req.user.username
            );
          }
          archived++;
        }
      }
      res.json({
        message: `${archived} cycle${archived === 1 ? '' : 's'} archived with finances kept; ${deleted} permanently deleted.`,
        archived,
        deleted
      });
    } catch (error) {
      next(error);
    }
  },
  { timeout: 60000 }
);
