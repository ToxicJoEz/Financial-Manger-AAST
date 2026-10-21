import prisma from '../db/prisma.js';
import { incomeReport } from '../utils/incomeData.js';
const incomeCycleSelect = {
          id: true,
          parentCourseId: true,
          name: true,
          branch: true,
          startDate: true,
          endDate: true,
          archivedAt: true,
          courseFee: true,
          parentCourse: {
            select: {
              code: true
            }
          },
          enrollments: {
            select: {
              bookPayments: { where: { reversedAt: null, status: 'PAID' }, select: { amountMinor: true } },
              amountPaid: true,
              financialArchivedAt: true
            }
          }
        };

export const getIncome = async (req, res, next) => {
  try {
    const month = req.query.month;
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1900 || Number(month.slice(0, 4)) > 9998) return res.status(400).json({
      error: 'Choose a valid income month (YYYY-MM).'
    });
    const from = new Date(month + '-01T00:00:00.000Z'),
      to = new Date(from);
    to.setUTCMonth(to.getUTCMonth() + 1);
    const result = await prisma.$transaction(async tx => {
      const cycles = await tx.cycle.findMany({
        where: {
          startDate: {
            gte: from,
            lt: to
          }
        },
        select: incomeCycleSelect,
        orderBy: [{
          startDate: 'asc'
        }, {
          name: 'asc'
        }]
      });
      const undatedCycles = await tx.cycle.count({
        where: {
          startDate: null
        }
      });
      return {
        ...incomeReport(cycles),
        month,
        undatedCycles
      };
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500);
    next(error);
  }
};

export const getYearlyOverview = async (req, res, next) => {
  try {
    const year=req.query.year;
    if(typeof year !== 'string' || !/^\d{4}$/.test(year) || Number(year)<1900 || Number(year)>9998) return res.status(400).json({error:'Choose a valid year (YYYY).'});
    const from=new Date(`${year}-01-01T00:00:00.000Z`),to=new Date(`${Number(year)+1}-01-01T00:00:00.000Z`);
    const result=await prisma.$transaction(async tx=>{
      const cycles=await tx.cycle.findMany({where:{startDate:{gte:from,lt:to}},select:incomeCycleSelect});
      const batches=await tx.instructorPaymentBatch.findMany({where:{status:'PAID',actualPaymentDate:{gte:from,lt:to}},select:{instructorId:true,earnings:{select:{amountMinor:true,courseId:true}}}});
      const income=incomeReport(cycles).summary;
      const minor=batches.reduce((sum,b)=>sum+b.earnings.reduce((n,e)=>n+e.amountMinor,0n),0n);
      if(minor>BigInt(Number.MAX_SAFE_INTEGER)) throw Object.assign(new Error('Payroll exceeds the supported reporting range.'),{status:400});
      return {year,income:{tuition:income.tuition,books:income.books,total:income.income},payroll:{totalPaid:Number(minor)/100,instructorsPaid:new Set(batches.map(b=>b.instructorId)).size,cyclesPaid:new Set(batches.flatMap(b=>b.earnings.map(e=>e.courseId))).size,paymentsCompleted:batches.length}};
    },{isolationLevel:'RepeatableRead'});
    res.json(result);
  } catch(error) {next(error);}
};
