import { paymentFields } from '../utils/studentProfile.js';
import prisma, { atomic } from '../db/prisma.js';
import { appendPayment, paymentView } from '../utils/paymentLedger.js';
import { moneyMinor } from '../utils/numbers.js';
import { isManager } from '../utils/courseView.js';

async function enrollmentFor(req) {
  const row = await prisma.enrollment.findFirst({ where: { id: req.params.enrollmentId, courseId: req.params.id }, include: { course: true, student: true } });
  if (!row || (!isManager(req.user) && (row.student.deletedAt || row.deletedAt || row.financialArchivedAt))) throw Object.assign(new Error('Enrollment not found.'), { status: 404 });
  return row;
}
export const getPayments = async (req, res, next) => {
  try {
    const enrollment = await enrollmentFor(req);
    const { cursor } = req.query;
    if (cursor && (typeof cursor !== 'string' || !await prisma.paymentEntry.findFirst({ where: { id: cursor, enrollmentId: enrollment.id } }))) return res.status(400).json({ error: 'Invalid payment-history cursor.' });
    const entries = await prisma.paymentEntry.findMany({ where: { enrollmentId: enrollment.id }, include: { reversal: { select: { id: true } } }, orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    const page = entries.slice(0, 50);
    res.json({ entries: page.map(paymentView), amountPaid: enrollment.amountPaid, nextCursor: entries.length > 50 ? page.at(-1).id : null });
  } catch (error) { res.status(error.status || 500); next(error); }
};
export const recordPayment = atomic(async (req, res, next) => {
  try {
    const enrollment = await enrollmentFor(req);
    if (!isManager(req.user)) return res.status(403).json({ error: 'Only admins and mods can record or correct tuition payments.' });
    if (enrollment.deletedAt || enrollment.financialArchivedAt) return res.status(409).json({ error: 'This enrollment is archived. Its payment history is read-only.' });
    const metadata = paymentFields(req.body);
    const { amount, kind = 'PAYMENT', note, idempotencyKey, occurredAt } = req.body;
    if (!['PAYMENT', 'REFUND', 'ADJUSTMENT'].includes(kind)) return res.status(400).json({ error: 'Invalid payment entry type.' });
    if (typeof note !== 'string' || !note.trim() || note.length > 1000) return res.status(400).json({ error: 'A description of 1–1000 characters is required.' });
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 100) return res.status(400).json({ error: 'A unique request key is required.' });
    let amountMinor = moneyMinor(amount, 'Amount', { signed: kind === 'ADJUSTMENT' });
    if (amountMinor === 0n) return res.status(400).json({ error: 'Enter a non-zero amount.' });
    if (kind === 'REFUND') amountMinor = -amountMinor;
    const date = occurredAt ? new Date(occurredAt) : new Date();
    if (!Number.isFinite(date.getTime()) || date > new Date()) return res.status(400).json({ error: 'Payment date must be valid and not in the future.' });
    const existing = await prisma.paymentEntry.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.enrollmentId !== enrollment.id || existing.kind !== kind || existing.amountMinor !== amountMinor || existing.note !== note.trim() || existing.paymentMethod !== metadata.paymentMethod || existing.receiptNumber !== metadata.receiptNumber) return res.status(409).json({ error: 'This request key was already used for another payment.' });
      return res.json(paymentView(existing));
    }
    res.status(201).json(await appendPayment(enrollment, enrollment.course, enrollment.student, req.user, { amountMinor, kind, note: note.trim(), idempotencyKey, occurredAt: date, ...metadata }));
  } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); next(error); }
});
export const reversePayment = atomic(async (req, res, next) => {
  try {
    const enrollment = await enrollmentFor(req);
    if (!isManager(req.user)) return res.status(403).json({ error: 'Only admins and mods can reverse entries.' });
    if (enrollment.deletedAt || enrollment.financialArchivedAt) return res.status(409).json({ error: 'Archived payment records are read-only.' });
    if (typeof req.body.note !== 'string' || !req.body.note.trim() || req.body.note.length > 1000) return res.status(400).json({ error: 'Explain why this entry is being reversed (1–1000 characters).' });
    const entry = await prisma.paymentEntry.findFirst({ where: { id: req.params.paymentId, enrollmentId: enrollment.id }, include: { reversal: true } });
    if (!entry) return res.status(404).json({ error: 'Payment entry not found.' });
    if (entry.reversal || entry.kind === 'REVERSAL') return res.status(409).json({ error: 'This entry cannot be reversed again.' });
    res.status(201).json(await appendPayment(enrollment, enrollment.course, enrollment.student, req.user, { amountMinor: -entry.amountMinor, kind: 'REVERSAL', note: req.body.note.trim(), idempotencyKey: `reversal:${entry.id}`, reversalOfId: entry.id, paymentMethod: entry.paymentMethod, receiptNumber: entry.receiptNumber }));
  } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); next(error); }
});
