import prisma from '../db/prisma.js';
import { branchScopeOf } from './access.js';

// Branch mods may undo or change money they recorded until the main mod confirms it in Checks.
// Once a record is confirmed, only admins and the main mod can change or remove it.
export const CONFIRMED_MESSAGE =
  'The main mod has already confirmed this money. Ask the main mod or an admin to change or remove it.';

export async function assertMoneyUnlocked(
  user,
  { paymentIds = [], bookIds = [], enrollmentIds = [], cycleIds = [], studentIds = [] }
) {
  if (!branchScopeOf(user)) return;
  const enrollmentScope = [
    ...(enrollmentIds.length ? [{ id: { in: enrollmentIds } }] : []),
    ...(cycleIds.length ? [{ courseId: { in: cycleIds } }] : []),
    ...(studentIds.length ? [{ studentId: { in: studentIds } }] : [])
  ];
  const enrollments = enrollmentScope.length
    ? (await prisma.enrollment.findMany({ where: { OR: enrollmentScope }, select: { id: true } })).map(e => e.id)
    : [];
  const [payments, books] = await Promise.all([
    paymentIds.length || enrollments.length || cycleIds.length
      ? prisma.paymentEntry.findMany({
          where: {
            OR: [
              { id: { in: paymentIds } },
              { enrollmentId: { in: enrollments } },
              ...(cycleIds.length ? [{ courseId: { in: cycleIds } }] : [])
            ]
          },
          select: { id: true }
        })
      : [],
    bookIds.length || enrollments.length
      ? prisma.bookPayment.findMany({
          where: { OR: [{ id: { in: bookIds } }, { enrollmentId: { in: enrollments } }] },
          select: { id: true }
        })
      : []
  ]);
  if (!payments.length && !books.length) return;
  const confirmed = await prisma.moneyCheck.count({
    where: {
      OR: [
        { kind: 'PAYMENT', recordId: { in: payments.map(p => p.id) } },
        { kind: 'BOOK', recordId: { in: books.map(b => b.id) } }
      ]
    }
  });
  if (confirmed) throw Object.assign(new Error(CONFIRMED_MESSAGE), { status: 403 });
}
