import prisma from '../db/prisma.js';
import { branchScopeOf } from './access.js';

// Branch mods change only cycles they created, and only until the main mod checks any of the cycle's money
// (one checked payment or book payment locks the whole cycle). Admins and the main mod are never locked.
export const NOT_CREATOR = 'Only the branch mod who created this cycle can change it. Ask the main mod or an admin.';
export const CYCLE_CHECKED =
  'The main mod has checked money in this cycle, so it is locked. Ask the main mod or an admin to change it.';

// Why each cycle is locked for this person (id -> reason); cycles they can change are left out.
export async function cycleLocks(user, cycleIds) {
  const ids = [...new Set(cycleIds.filter(Boolean).map(String))];
  if (!branchScopeOf(user) || !ids.length) return new Map();
  const [cycles, payments, books] = await Promise.all([
    prisma.cycle.findMany({ where: { id: { in: ids } }, select: { id: true, createdById: true } }),
    prisma.paymentEntry.findMany({ where: { courseId: { in: ids } }, select: { id: true, courseId: true } }),
    prisma.bookPayment.findMany({
      where: { enrollment: { courseId: { in: ids } } },
      select: { id: true, enrollment: { select: { courseId: true } } }
    })
  ]);
  const checks =
    payments.length || books.length
      ? await prisma.moneyCheck.findMany({
          where: {
            OR: [
              { kind: 'PAYMENT', recordId: { in: payments.map(p => p.id) } },
              { kind: 'BOOK', recordId: { in: books.map(b => b.id) } }
            ]
          },
          select: { kind: true, recordId: true }
        })
      : [];
  const cycleOf = new Map([
    ...payments.map(p => ['PAYMENT:' + p.id, p.courseId]),
    ...books.map(b => ['BOOK:' + b.id, b.enrollment.courseId])
  ]);
  const checked = new Set(checks.map(c => cycleOf.get(c.kind + ':' + c.recordId)));
  const locks = new Map();
  for (const cycle of cycles)
    if (cycle.createdById !== user.id) locks.set(cycle.id, NOT_CREATOR);
    else if (checked.has(cycle.id)) locks.set(cycle.id, CYCLE_CHECKED);
  return locks;
}

export async function assertCyclesChangeable(user, cycleIds) {
  const locks = await cycleLocks(user, cycleIds);
  if (locks.size) throw Object.assign(new Error([...locks.values()][0]), { status: 403 });
}
