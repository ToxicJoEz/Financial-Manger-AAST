import prisma from '../db/prisma.js';
import { canSeePayroll } from './access.js';

// Cycles created by branch mods wait for the main mod (or an admin) to approve them. While pending, the branch mod
// keeps working on it; once approved it is locked for branch mods; a rejected cycle is archived.
export const approvalFields = user =>
  canSeePayroll(user)
    ? { approvalStatus: 'APPROVED', approvedById: user.id, approvedAt: new Date() }
    : { approvalStatus: 'PENDING' };

const managers = () =>
  prisma.user.findMany({ where: { isBanned: false, OR: [{ role: 'admin' }, { role: 'mod', branchScope: null }] } });
const bold = (text, colour = 'emerald') => `<span class="font-bold text-${colour}-600">${text}</span>`;

// Tells admins and the main mod a branch mod created a cycle that needs approval.
export async function requestCycleApproval(cycle, user) {
  if (cycle.approvalStatus !== 'PENDING') return;
  const recipients = (await managers()).filter(m => m.id !== user.id);
  if (!recipients.length) return;
  await prisma.notification.createMany({
    data: recipients.map(m => ({
      userId: m.id,
      title: 'New cycle to approve',
      message: `${bold('@' + user.username, 'blue')} created ${bold(cycle.name)} in ${cycle.branch}. Approve it, edit it, or reject it.`,
      type: 'CYCLE_REQUEST',
      relatedId: cycle.id
    }))
  });
}

// Closes the managers' request notifications and tells the branch mod who created the cycle.
export async function announceCycleDecision(cycle, user, approved, reason) {
  await prisma.notification.updateMany({
    where: { relatedId: cycle.id, type: 'CYCLE_REQUEST' },
    data: { isResolved: true, resolvedBy: user.username, isRead: true }
  });
  if (!cycle.createdById || cycle.createdById === user.id) return;
  // The branch mod who created it may have been deleted since.
  if (!(await prisma.user.findUnique({ where: { id: cycle.createdById }, select: { id: true } }))) return;
  await prisma.notification.create({
    data: {
      userId: cycle.createdById,
      title: approved ? 'Cycle approved' : 'Cycle rejected',
      message: approved
        ? `${bold(cycle.name)} was approved by ${bold('@' + user.username, 'blue')}. Its details are now locked; you can still add and manage its students.`
        : `${bold(cycle.name)} was rejected by ${bold('@' + user.username, 'blue')} and archived.${reason ? ` Reason: ${reason.replace(/[<>&]/g, '')}` : ''}`,
      type: approved ? 'CYCLE_APPROVED' : 'CYCLE_REJECTED',
      relatedId: cycle.id,
      resolvedBy: user.username,
      isResolved: true
    }
  });
}
