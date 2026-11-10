import prisma from '../db/prisma.js';
import { canSeePayroll, canCheckBranchMoney, cycleBranchWhere, CHECKED_BRANCHES } from '../utils/access.js';
import { moneyCheckSummary } from './moneyCheckController.js';

// Counts of things waiting for someone, for sidebar badges and the Overview "Needs your attention" strip.
// Each user only gets the counts that apply to them.
export const getAttention = async (req, res, next) => {
  try {
    const user = req.user,
      payroll = canSeePayroll(user);
    const activeCycle = { archivedAt: null, parentCourse: { archivedAt: null }, ...cycleBranchWhere(user) };
    const [pendingApprovals, myPendingRequests, unassignedCycles] = await Promise.all([
      payroll ? prisma.pendingAssignment.count({ where: { status: 'PENDING', course: activeCycle } }) : 0,
      prisma.pendingAssignment.count({ where: { status: 'PENDING', submittedById: user.id } }),
      prisma.cycle.count({ where: { ...activeCycle, isFinished: false, instructors: { none: {} } } })
    ]);
    const result = { pendingApprovals, myPendingRequests, unassignedCycles };
    if (payroll) {
      const [processing, unpaid] = await Promise.all([
        prisma.payrollEarning.aggregate({
          where: { batch: { status: 'PROCESSING' } },
          _count: true,
          _sum: { amountMinor: true }
        }),
        prisma.payrollEarning.findMany({
          where: { batchId: null, amountMinor: { gt: 0n }, course: { archivedAt: null, isFinished: true } },
          select: { courseId: true },
          distinct: ['courseId']
        })
      ]);
      result.processingPayments = { count: processing._count, amount: Number(processing._sum.amountMinor || 0n) / 100 };
      result.payrollDueCycles = unpaid.length;
    }
    // Branch money waiting for the main mod: totals across branches plus each branch's share.
    if (canCheckBranchMoney(user)) {
      const byBranch = await Promise.all(
        CHECKED_BRANCHES.map(async branch => {
          const summary = await moneyCheckSummary(branch);
          return { branch, unchecked: summary.unchecked, changed: summary.changed };
        })
      );
      const sum = key => ({
        count: byBranch.reduce((n, b) => n + b[key].count, 0),
        amount: Math.round(byBranch.reduce((n, b) => n + b[key].amount, 0) * 100) / 100
      });
      result.moneyChecks = { unchecked: sum('unchecked'), changed: sum('changed'), byBranch };
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
};
