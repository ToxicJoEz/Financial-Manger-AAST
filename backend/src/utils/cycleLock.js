import prisma from '../db/prisma.js';
import { branchScopeOf } from './access.js';

// Branch mods change only cycles they created. Two lock levels (admins and the main mod are never locked):
// - the cycle's details (edit, archive, delete, complete, employees): locked once the main mod approves the cycle;
// - its students (enroll, payments, books, remove): stay open after approval, locked once the main mod checks any
//   of the cycle's money (one checked payment or book payment locks it). A checked cycle is locked at both levels.
export const NOT_CREATOR = 'Only the branch mod who created this cycle can change it. Ask the main mod or an admin.';
export const CYCLE_APPROVED =
  "The main mod approved this cycle, so its details are locked. You can still add and manage its students. Ask the main mod or an admin to change anything else.";
export const CYCLE_CHECKED =
  'The main mod has checked money in this cycle, so it is locked. Ask the main mod or an admin to change it.';

// Why each cycle is locked for this person (id -> reason); cycles they can change are left out.
// level 'details' (default) or 'students'.
export async function cycleLocks(user, cycleIds, level = 'details') {
  const ids = [...new Set(cycleIds.filter(Boolean).map(String))];
  if (!branchScopeOf(user) || !ids.length) return new Map();
  const [cycles, payments, books] = await Promise.all([
    prisma.cycle.findMany({ where: { id: { in: ids } }, select: { id: true, createdById: true, approvalStatus: true } }),
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
    else if (level === 'details' && cycle.approvalStatus === 'APPROVED') locks.set(cycle.id, CYCLE_APPROVED);
  return locks;
}

export async function assertCyclesChangeable(user, cycleIds, level = 'details') {
  const locks = await cycleLocks(user, cycleIds, level);
  if (locks.size) throw Object.assign(new Error([...locks.values()][0]), { status: 403 });
}
