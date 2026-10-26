import { createHash } from 'node:crypto';
import prisma, { atomic } from '../db/prisma.js';
import { earningView } from '../utils/payrollRecord.js';
import { logAction } from '../utils/logger.js';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const paymentDate = (value, label) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || value < '0001-01-01') fail(`Choose a valid ${label}.`);
  return new Date(value + 'T00:00:00Z');
};

export const getFinances = async (req, res, next) => {
  try {
    const month = req.query.month;
    if (month !== undefined && (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) return res.status(400).json({ error: 'Choose a valid salary report month.' });
    const records = await prisma.payrollEarning.findMany({ include: { batch: true }, orderBy: [{ instructorName: 'asc' }, { createdAt: 'desc' }], take: 10001 });
    if (records.length > 10000) return res.status(413).json({ error: 'Payroll exceeds the interactive limit. Contact your administrator to archive old records.' });
    const earnings = records.map(earningView);
    const batches = await prisma.instructorPaymentBatch.findMany({ where:{status:{not:'CANCELLED'}}, include: { earnings: { orderBy: { cycleName: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 10000 });
    const amounts = { totalPayroll: 0n, totalPaid: 0n, totalProcessing: 0n, totalUnpaid: 0n };
    for (const row of records) {
      amounts.totalPayroll += row.amountMinor;
      amounts[row.batch?.status === 'PAID' ? 'totalPaid' : row.batch ? 'totalProcessing' : 'totalUnpaid'] += row.amountMinor;
    }
    const needsAllocation = await prisma.cycle.findMany({ where: { isFinished: true, archivedAt: null, payrollEarnings: { none: {} } }, select: { id: true, name: true, parentCourseId: true, branch: true,parentCourse:{select:{isPrivate:true}} } });
    const monthlyRows = month ? records.filter(e => e.batch?.status === 'PAID' && e.batch.actualPaymentDate?.toISOString().slice(0, 7) === month) : [];
    const monthlyInstructors = new Map();
    for (const row of monthlyRows) {
      const instructor = monthlyInstructors.get(row.instructorId) || { id: row.instructorId, name: row.instructorName, employeeId: row.employeeId, amountMinor: 0n };
      instructor.amountMinor += row.amountMinor; monthlyInstructors.set(row.instructorId, instructor);
    }
    const monthly = month ? { month, instructorsPaid: monthlyInstructors.size, cyclesPaid: new Set(monthlyRows.map(row => row.courseId)).size, paymentsCompleted: new Set(monthlyRows.map(row => row.batchId)).size, totalPaid: Number(monthlyRows.reduce((sum, row) => sum + row.amountMinor, 0n)) / 100, instructors: [...monthlyInstructors.values()].sort((a,b) => Number(b.amountMinor-a.amountMinor)).map(({amountMinor,...row}) => ({ ...row, totalPaid: Number(amountMinor)/100 })) } : null;
    res.json({ monthly, summary: monthly ? { totalPaid: monthly.totalPaid, instructorsPaid: monthly.instructorsPaid, cyclesPaid: monthly.cyclesPaid, paymentsCompleted: monthly.paymentsCompleted } : Object.fromEntries(Object.entries(amounts).map(([key, value]) => [key, Number(value) / 100])), earnings,
      batches: batches.map(batch => ({ ...batch, earnings: batch.earnings.map(e=>({...earningView(e),status:batch.status})), amount: Number(batch.earnings.reduce((sum, e) => sum + e.amountMinor, 0n)) / 100 })), needsAllocation });
  } catch (error) { next(error); }
};

export const initiatePaymentHandler = async (req, res, next) => {
  try {
    const { earningIds, initiatedDate, versions, idempotencyKey } = req.body;
    if (!Array.isArray(earningIds) || !earningIds.length || earningIds.length > 500 || earningIds.some(id => typeof id !== 'string') || new Set(earningIds).size !== earningIds.length) fail('Select unique cycle earnings for one instructor (up to 500).');
    if (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(idempotencyKey)) fail('A valid payment request key is required.');
    const date = paymentDate(initiatedDate, 'payment initiation date');
    const existing = await prisma.instructorPaymentBatch.findUnique({ where: { idempotencyKey }, include: { earnings: { select: { id: true } } } });
    if (existing) {
      if (JSON.stringify(existing.earnings.map(e => e.id).sort()) !== JSON.stringify([...earningIds].sort()) || existing.initiatedDate?.toISOString().slice(0, 10) !== initiatedDate) fail('This payment request key was already used for different details.', 409);
      return res.json({ id: existing.id, message: 'Payment batch was already initiated.' });
    }
    const rows = await prisma.payrollEarning.findMany({ where: { id: { in: earningIds } } });
    if (rows.length !== earningIds.length || rows.some(r => r.batchId)) fail('Some selected salary are no longer unpaid. Refresh payroll and select again.', 409);
    if (new Set(rows.map(r => r.instructorId)).size !== 1) fail('A payment batch must belong to one instructor.');
    if (!versions || rows.some(r => versions[r.id] !== r.updatedAt.toISOString())) fail('The salary records changed after selection. Refresh payroll before initiating payment.', 409);
    const total = rows.reduce((sum, row) => sum + row.amountMinor, 0n);
    if (total <= 0n) fail('Selected salary must have a positive total.');
    const batch = await prisma.instructorPaymentBatch.create({ data: { instructorId: rows[0].instructorId, instructorName: rows[0].instructorName, initiatedDate: date, initiatedBy: req.user.username, idempotencyKey } });
    const claimed = await prisma.payrollEarning.updateMany({ where: { id: { in: earningIds }, batchId: null }, data: { batchId: batch.id } });
    if (claimed.count !== earningIds.length) fail('Another reviewer started payment for these salary records. Refresh payroll.', 409);
    await logAction('INITIATE_INSTRUCTOR_PAYMENT', `Batch ${batch.id}: ${rows[0].instructorName}, ${rows.length} cycles, ${Number(total) / 100} EGP; initiated ${initiatedDate}.`, req.user.username);
    res.status(201).json({ id: batch.id, message: 'Selected salary are now processing. Actual payment date is still empty.' });
  } catch (error) { next(error); }
};
export const initiatePayment = atomic(initiatePaymentHandler);

export const completePaymentHandler = async (req, res, next) => {
  try {
    const date = paymentDate(req.body.actualPaymentDate, 'actual payment date');
    const batch = await prisma.instructorPaymentBatch.findUnique({ where: { id: req.params.id } });
    if (!batch) fail('Payment batch not found.', 404);
    if (batch.status !== 'PROCESSING') fail('This batch has already been paid.', 409);
    const claimed = await prisma.instructorPaymentBatch.updateMany({ where: { id: batch.id, status: 'PROCESSING' }, data: { status: 'PAID', actualPaymentDate: date, paidBy: req.user.username } });
    if (claimed.count !== 1) fail('Another reviewer already processed this payment.', 409);
    await logAction('COMPLETE_INSTRUCTOR_PAYMENT', `Batch ${batch.id} for ${batch.instructorName} paid on ${req.body.actualPaymentDate}. Initiation date preserved.`, req.user.username);
    res.json({ message: 'Payment confirmed. Both dates have been saved.' });
  } catch (error) { next(error); }
};
export const completePayment = atomic(completePaymentHandler);

async function applyHandler(handler, req) {
  let status = 200, result;
  const response = { status(code) { status = code; return this; }, json(body) { result = body; return this; } };
  await handler(req, response, error => { throw error; });
  if (status >= 400 || !result) fail(result?.error || 'Payment could not be processed.', status >= 400 ? status : 500);
  return result;
}

// Course selection creates one ordinary batch per instructor, together in one transaction.
export const initiateCoursePayment = atomic(async (req, res, next) => {
  try {
    const { earningIds, courseIds, idempotencyKey } = req.body;
    if (!Array.isArray(courseIds) || !courseIds.length || courseIds.length > 100 || courseIds.some(id => typeof id !== 'string') || new Set(courseIds).size !== courseIds.length) fail('Select valid, unique courses.');
    if (!Array.isArray(earningIds) || !earningIds.length || earningIds.length > 500 || earningIds.some(id => typeof id !== 'string') || new Set(earningIds).size !== earningIds.length) fail('Select valid course salary records.');
    if (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(idempotencyKey)) fail('A valid payment request key is required.');
    const rows = await prisma.payrollEarning.findMany({ where: { id: { in: earningIds }, courseId: { in: courseIds } } });
    if (rows.length !== earningIds.length || new Set(rows.map(e=>e.courseId)).size !== courseIds.length) fail('The selected course salary records changed. Refresh and review them again.',409);
    const omitted = await prisma.payrollEarning.count({ where: { courseId: { in: courseIds }, batchId: null, amountMinor: { gt: 0n }, id: { notIn: earningIds } } });
    if (omitted) fail('A selected course has additional unpaid instructors. Refresh and select the course again to include everyone.',409);
    const batchIds = await initiateSelectedBatches(req, rows);
    res.status(201).json({ batchIds, message: 'Course payments started for all selected unpaid instructors.' });
  } catch (error) { next(error); }
});

export const completeCoursePayments = atomic(async (req, res, next) => {
  try {
    const { batchIds, courseIds } = req.body;
    if (!Array.isArray(batchIds) || !batchIds.length || batchIds.length > 100 || batchIds.some(id=>typeof id!=='string') || new Set(batchIds).size!==batchIds.length) fail('Select valid payment batches.');
    if (!Array.isArray(courseIds) || !courseIds.length || courseIds.some(id=>typeof id!=='string')) fail('Select valid courses.');
    const rows = await prisma.instructorPaymentBatch.findMany({where:{id:{in:batchIds}},include:{earnings:{select:{courseId:true}}}});
    if(rows.length!==batchIds.length)fail('A selected payment batch no longer exists.',409);
    if(rows.some(b=>b.earnings.some(e=>!courseIds.includes(e.courseId))))fail('One payment batch includes other courses. Confirm that full batch in Payment batches to avoid paying an unselected course.',409);
    for (const id of batchIds) await applyHandler(completePaymentHandler,{...req,params:{id}});
    res.json({message:'Selected course payments confirmed. Actual payment date saved for every instructor.'});
  } catch(error){next(error);}
});

async function initiateSelectedBatches(req, rows) {
  const groups = new Map();
  for (const row of rows) groups.set(row.instructorId, [...(groups.get(row.instructorId) || []), row.id]);
  const batchIds = [];
  for (const [instructorId, ids] of groups) {
    const key = createHash('sha256').update(req.body.idempotencyKey + ':' + instructorId).digest('hex');
    const result = await applyHandler(initiatePaymentHandler, { ...req, body: { ...req.body, earningIds: ids, idempotencyKey: key } });
    batchIds.push(result.id);
  }
  return batchIds;
}

// Arbitrary cycle selections may span instructors; every instructor gets a separate batch.
export const initiateSalarySelection = atomic(async (req, res, next) => {
  try {
    const { earningIds, idempotencyKey } = req.body;
    if (!Array.isArray(earningIds) || !earningIds.length || earningIds.length > 500 || earningIds.some(id => typeof id !== 'string') || new Set(earningIds).size !== earningIds.length) fail('Select valid, unique salary records (up to 500).');
    if (typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(idempotencyKey)) fail('A valid payment request key is required.');
    const rows = await prisma.payrollEarning.findMany({ where: { id: { in: earningIds } } });
    if (rows.length !== earningIds.length) fail('Some selected salary records no longer exist. Refresh payroll.', 409);
    const batchIds = await initiateSelectedBatches(req, rows);
    res.status(201).json({ batchIds, message: `Payment processing started for ${batchIds.length} instructor${batchIds.length === 1 ? '' : 's'}.` });
  } catch (error) { next(error); }
});

// A visible daily batch contains every instructor payment initiated on that date.
export const completeDailyBatch = atomic(async (req, res, next) => {
  try {
    const initiatedDate = paymentDate(req.params.day, 'batch initiation date');
    const { batchIds } = req.body;
    if (!Array.isArray(batchIds) || !batchIds.length || batchIds.length > 1000 || batchIds.some(id => typeof id !== 'string') || new Set(batchIds).size !== batchIds.length) fail('Select valid pending payments for this daily batch.');
    const pending = await prisma.instructorPaymentBatch.findMany({ where: { initiatedDate, status: 'PROCESSING' }, select: { id: true } });
    if (JSON.stringify(pending.map(p => p.id).sort()) !== JSON.stringify([...batchIds].sort())) fail('This batch changed since you opened it. Refresh and review its pending payments before confirming.', 409);
    for (const id of batchIds) await applyHandler(completePaymentHandler, { ...req, params: { id } });
    await logAction('COMPLETE_DAILY_PAYMENT_BATCH', `Confirmed ${batchIds.length} payments initiated ${req.params.day}; actual payment date ${req.body.actualPaymentDate}.`, req.user.username);
    res.json({ message: `Batch confirmed: ${batchIds.length} payments marked as paid.` });
  } catch (error) { next(error); }
});

export const returnProcessingToUnpaid=atomic(async(req,res,next)=>{
 try{
  const {earningIds,versions}=req.body;
  if(!Array.isArray(earningIds)||!earningIds.length||earningIds.length>1000||earningIds.some(id=>typeof id!=='string')||new Set(earningIds).size!==earningIds.length)fail('Select valid, unique processing salary items (up to 1,000).');
  const rows=await prisma.payrollEarning.findMany({where:{id:{in:earningIds}},include:{batch:true}});
  if(rows.length!==earningIds.length||rows.some(row=>row.batch?.status!=='PROCESSING'))fail('Only processing payments can return to unpaid. Some records changed; refresh and try again.',409);
  if(!versions||rows.some(row=>versions[row.id]!==row.updatedAt.toISOString()))fail('These payments changed after selection. Refresh and select again.',409);
  const result=await prisma.payrollEarning.updateMany({where:{id:{in:earningIds},batchId:{in:[...new Set(rows.map(row=>row.batchId))]}},data:{batchId:null}});
  if(result.count!==rows.length)fail('Another reviewer changed these payments.',409);
  for(const id of new Set(rows.map(row=>row.batchId)))if(!await prisma.payrollEarning.count({where:{batchId:id}}))await prisma.instructorPaymentBatch.update({where:{id},data:{status:'CANCELLED'}});
  await logAction('RETURN_PAYROLL_TO_UNPAID',`${rows.length} salary items returned to unpaid.`,req.user.username);
  res.json({message:`${rows.length} salary items returned to unpaid. Processing totals updated.`});
 }catch(error){next(error);}
});
