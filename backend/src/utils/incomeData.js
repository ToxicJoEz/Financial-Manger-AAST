import { moneyMinor } from './numbers.js';
const money = minor => {
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw Object.assign(new Error('Income exceeds the supported reporting range.'), {
    status: 400
  });
  return Number(minor) / 100;
};
export function incomeReport(cycles) {
  let total = 0n, bookTotal = 0n,
    students = 0,
    full = 0,
    discounted = 0,
    exempt = 0;
  const branches = new Map();
  const rows = cycles.map(cycle => {
    let collected = (cycle.retainedIncome||[]).reduce((sum,r)=>sum+r.tuitionMinor,0n), books = (cycle.retainedIncome||[]).reduce((sum,r)=>sum+r.bookMinor,0n);
    const counts = {
      full: 0,
      discounted: 0,
      exempt: 0
    };
    const fee = moneyMinor(cycle.courseFee);
    for (const enrollment of cycle.enrollments) {
      if (enrollment.financialArchivedAt) continue;
      const paid = moneyMinor(enrollment.amountPaid);
      collected += paid;
      books += (enrollment.bookPayments || []).reduce((sum, p) => sum + BigInt(p.amountMinor), 0n);
      counts[paid === 0n ? 'exempt' : paid < fee ? 'discounted' : 'full']++;
    }
    const count = counts.full + counts.discounted + counts.exempt;
    total += collected; bookTotal += books;
    students += count;
    full += counts.full;
    discounted += counts.discounted;
    exempt += counts.exempt;
    const branch = branches.get(cycle.branch) || {
      branch: cycle.branch,
      minor: 0n, tuitionMinor: 0n, bookMinor: 0n,
      cycles: 0,
      students: 0
    };
    branch.minor += collected + books; branch.tuitionMinor += collected; branch.bookMinor += books;
    branch.cycles++;
    branch.students += count;
    branches.set(cycle.branch, branch);
    return {
      id: cycle.id,
      parentCourseId: cycle.parentCourseId,
      name: cycle.name,
      isPrivate:Boolean(cycle.parentCourse.isPrivate),
      courseCode: cycle.parentCourse.code,
      branch: cycle.branch,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      archivedAt: cycle.archivedAt,
      students: count,
      types: counts,
      tuition: money(collected), books: money(books), income: money(collected + books)
    };
  });
  return {
    summary: {
      tuition: money(total), books: money(bookTotal), income: money(total + bookTotal),
      cycles: rows.length,
      students,
      full,
      discounted,
      exempt
    },
    cycles: rows,
    branches: [...branches.values()].map(({
      minor, tuitionMinor, bookMinor,
      ...branch
    }) => ({
      ...branch,
      tuition: money(tuitionMinor), books: money(bookMinor), income: money(minor)
    })).sort((a, b) => b.income - a.income || a.branch.localeCompare(b.branch))
  };
}
