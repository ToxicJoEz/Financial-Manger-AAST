import { assertMoneyUnlocked } from '../utils/moneyLock.js';
import prisma, { atomic } from '../db/prisma.js';
import { moneyMinor } from '../utils/numbers.js';
import { logAction } from '../utils/logger.js';
import { cycleBookPrice } from '../utils/privateCourses.js';
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

export const updateBookStatus = atomic(async (req, res, next) => {
  try {
    const canManage = ['admin', 'mod'].includes(req.user.role) || Boolean(req.user.canManageBooks);
    if (!canManage) fail('You do not have permission to manage book payments.', 403);

    const { status, expectedPrice, paymentId } = req.body;
    if (!['PAID', 'EXEMPT', 'UNPAID'].includes(status)) fail('Choose a valid book status.');
    const row = await prisma.enrollment.findFirst({
      where: { id: req.params.enrollmentId, courseId: req.params.id },
      include: { student: true, course: { include: { parentCourse: true, subCourse: true } } }
    });
    if (!row) fail('Enrollment not found.', 404);
    const current = await prisma.bookPayment.findUnique({ where: { activeKey: row.id } });
    if (status === 'UNPAID') {
      // Users can record books but never undo them; branch mods can until the main mod confirms the payment.
      if (req.user.role === 'user') fail('Only admins and mods can undo a book status.', 403);
      if (!current || current.id !== paymentId) fail('Book status changed. Refresh and review it again.', 409);
      await assertMoneyUnlocked(req.user, { bookIds: [current.id] });
      await prisma.bookPayment.update({
        where: { id: current.id },
        data: { activeKey: null, reversedAt: new Date(), reversedBy: req.user.username }
      });
    } else {
      if (
        row.deletedAt ||
        row.financialArchivedAt ||
        row.student.deletedAt ||
        row.course.archivedAt ||
        row.course.parentCourse.archivedAt
      )
        fail('Restore this student and cycle before recording book status.');
      if (current) fail('Books already have a status. An authorized user must undo it first.', 409);
      const price = moneyMinor(cycleBookPrice(row.course), 'Book price');
      if (status === 'PAID' && (price <= 0n || moneyMinor(expectedPrice, 'Displayed book price') !== price))
        fail(
          'The book price changed or is not set. Refresh and check the current book price before recording payment.',
          409
        );
      await prisma.bookPayment.create({
        data: {
          enrollmentId: row.id,
          activeKey: row.id,
          status,
          amountMinor: status === 'PAID' ? price : 0n,
          recordedBy: req.user.username
        }
      });
    }
    // Also update the enrollment version for deletion previews and concurrent edits.
    await prisma.enrollment.update({ where: { id: row.id }, data: { updatedAt: new Date() } });
    await logAction(
      'BOOK_' + status,
      `${row.student.name} / ${row.course.name}: ${status}; ${status === 'PAID' ? cycleBookPrice(row.course) : 0} EGP`,
      req.user.username
    );
    res.json({
      message:
        status === 'UNPAID'
          ? 'Book status undone.'
          : status === 'PAID'
            ? 'Book payment recorded.'
            : 'Books marked not required.'
    });
  } catch (error) {
    if (error.code === 'P2002')
      return res.status(409).json({ error: 'Book status changed. Refresh and review before trying again.' });
    next(error);
  }
});
