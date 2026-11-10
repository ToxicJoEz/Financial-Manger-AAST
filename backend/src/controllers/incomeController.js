import { canSeePayroll, cycleBranchWhere } from '../utils/access.js';
import prisma from '../db/prisma.js';
import { incomeReport } from '../utils/incomeData.js';
const incomeCycleSelect = {
  id: true,
  parentCourseId: true,
  subCourseId: true,
  name: true,
  branch: true,
  startDate: true,
  endDate: true,
  archivedAt: true,
  courseFee: true,
  parentCourse: {
    select: {
      code: true,
      isPrivate: true
    }
  },
  retainedIncome: { select: { tuitionMinor: true, bookMinor: true } },
  enrollments: {
    select: {
      student: { select: { name: true } },
      bookPayments: { where: { reversedAt: null, status: 'PAID' }, select: { amountMinor: true } },
      amountPaid: true,
      financialArchivedAt: true
    }
  }
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const validYear = y => Number(y) >= 1900 && Number(y) <= 9998;
// Income is reported for one month, a range of months or a whole year (by cycle start month).
export function incomePeriod(query) {
  const fail = message => {
    throw Object.assign(new Error(message), { status: 400 });
  };
  let from, to, kind;
  if (query.year !== undefined) {
    if (typeof query.year !== 'string' || !/^\d{4}$/.test(query.year) || !validYear(query.year))
      fail('Choose a valid year (YYYY).');
    kind = 'year';
    from = `${query.year}-01`;
    to = `${query.year}-12`;
  } else if (query.from !== undefined || query.to !== undefined) {
    for (const value of [query.from, query.to])
      if (typeof value !== 'string' || !MONTH.test(value) || !validYear(value.slice(0, 4)))
        fail('Choose a valid month range (YYYY-MM to YYYY-MM).');
    if (query.from > query.to) fail('The range must start before it ends.');
    kind = 'range';
    from = query.from;
    to = query.to;
  } else {
    const month = query.month;
    if (typeof month !== 'string' || !MONTH.test(month) || !validYear(month.slice(0, 4)))
      fail('Choose a valid income month (YYYY-MM).');
    kind = 'month';
    from = to = month;
  }
  const months = [];
  for (
    let d = new Date(from + '-01T00:00:00Z');
    d <= new Date(to + '-01T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + 1)
  )
    months.push(d.toISOString().slice(0, 7));
  if (months.length > 36) fail('Choose a range of up to 36 months.');
  const end = new Date(to + '-01T00:00:00Z');
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { kind, from, to, months, start: new Date(from + '-01T00:00:00Z'), end };
}

export const getIncome = async (req, res, next) => {
  try {
    const period = incomePeriod(req.query);
    const branch = cycleBranchWhere(req.user);
    const result = await prisma.$transaction(async tx => {
      const cycles = await tx.cycle.findMany({
        where: { startDate: { gte: period.start, lt: period.end }, ...branch },
        select: incomeCycleSelect,
        orderBy: [{ startDate: 'asc' }, { name: 'asc' }]
      });
      const undatedCycles = await tx.cycle.count({ where: { startDate: null, ...branch } });
      // Each month on its own, in order, for the month-by-month sections of a range or year.
      const months =
        period.kind === 'month'
          ? undefined
          : period.months.map(month => {
              const report = incomeReport(cycles.filter(c => c.startDate.toISOString().slice(0, 7) === month));
              return { month, summary: report.summary, cycles: report.cycles };
            });
      return {
        ...incomeReport(cycles),
        period: { kind: period.kind, from: period.from, to: period.to },
        month: period.kind === 'month' ? period.from : undefined,
        months,
        undatedCycles
      };
    });
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
};

export const getYearlyOverview = async (req, res, next) => {
  try {
    const year = req.query.year;
    if (typeof year !== 'string' || !/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > 9998)
      return res.status(400).json({ error: 'Choose a valid year (YYYY).' });
    const from = new Date(`${year}-01-01T00:00:00.000Z`),
      to = new Date(`${Number(year) + 1}-01-01T00:00:00.000Z`);
    const result = await prisma.$transaction(
      async tx => {
        const cycles = await tx.cycle.findMany({
          where: { startDate: { gte: from, lt: to }, ...cycleBranchWhere(req.user) },
          select: incomeCycleSelect
        });
        const batches = await tx.instructorPaymentBatch.findMany({
          where: { status: 'PAID', actualPaymentDate: { gte: from, lt: to } },
          select: { instructorId: true, earnings: { select: { amountMinor: true, courseId: true } } }
        });
        const income = incomeReport(cycles).summary;
        const minor = batches.reduce((sum, b) => sum + b.earnings.reduce((n, e) => n + e.amountMinor, 0n), 0n);
        if (minor > BigInt(Number.MAX_SAFE_INTEGER))
          throw Object.assign(new Error('Payroll exceeds the supported reporting range.'), { status: 400 });
        return {
          year,
          income: { tuition: income.tuition, books: income.books, total: income.income },
          payroll: {
            totalPaid: Number(minor) / 100,
            instructorsPaid: new Set(batches.map(b => b.instructorId)).size,
            cyclesPaid: new Set(batches.flatMap(b => b.earnings.map(e => e.courseId))).size,
            paymentsCompleted: batches.length
          }
        };
      },
      { isolationLevel: 'RepeatableRead' }
    );
    // Branch mods never see payroll figures.
    if (!canSeePayroll(req.user)) delete result.payroll;
    res.json(result);
  } catch (error) {
    next(error);
  }
};
