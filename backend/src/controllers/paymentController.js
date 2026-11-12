import { logAction } from '../utils/logger.js';
import { enrollmentTerms } from '../utils/enrollmentTerms.js';
import { assertMoneyUnlocked } from '../utils/moneyLock.js';
import { paymentFields } from '../utils/studentProfile.js';
import prisma, { atomic } from '../db/prisma.js';
import { appendPayment, paymentView } from '../utils/paymentLedger.js';
import { moneyMinor } from '../utils/numbers.js';
import { isManager } from '../utils/courseView.js';

async function enrollmentFor(req) {
  const row = await prisma.enrollment.findFirst({
    where: { id: req.params.enrollmentId, courseId: req.params.id },
    include: { course: true, student: true }
  });
  if (!row || (!isManager(req.user) && (row.student.deletedAt || row.deletedAt || row.financialArchivedAt)))
    throw Object.assign(new Error('Enrollment not found.'), { status: 404 });
  return row;
}
export const getPayments = async (req, res, next) => {
  try {
    const enrollment = await enrollmentFor(req);
    const { cursor } = req.query;
    if (
      cursor &&
      (typeof cursor !== 'string' ||
        !(await prisma.paymentEntry.findFirst({ where: { id: cursor, enrollmentId: enrollment.id } })))
    )
      return res.status(400).json({ error: 'Invalid payment-history cursor.' });
    const entries = await prisma.paymentEntry.findMany({
      where: { enrollmentId: enrollment.id },
      include: { reversal: { select: { id: true } } },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    const page = entries.slice(0, 50);
    // Entries the main mod confirmed in Checks (branch mods can no longer reverse them).
    const confirmed = new Set(
      (
        await prisma.moneyCheck.findMany({
          where: { kind: 'PAYMENT', recordId: { in: page.map(e => e.id) } },
          select: { recordId: true }
        })
      ).map(c => c.recordId)
    );
    res.json({
      entries: page.map(entry => ({ ...paymentView(entry), confirmed: confirmed.has(entry.id) })),
      amountPaid: enrollment.amountPaid,
      nextCursor: entries.length > 50 ? page.at(-1).id : null
    });
  } catch (error) {
    res.status(error.status || 500);
    next(error);
  }
};
export const recordPayment = atomic(async (req, res, next) => {
  try {
    const enrollment = await enrollmentFor(req);
    if (!isManager(req.user))
      return res.status(403).json({ error: 'Only admins and mods can record or correct tuition payments.' });
    if (enrollment.deletedAt || enrollment.financialArchivedAt)
      return res.status(409).json({ error: 'This enrollment is archived. Its payment history is read-only.' });
    const metadata = paymentFields(req.body);
    const { amount, kind = 'PAYMENT', note, idempotencyKey, occurredAt } = req.body;
    if (!['PAYMENT', 'REFUND', 'ADJUSTMENT'].includes(kind))
      return res.status(400).json({ error: 'Invalid payment entry type.' });
    if (typeof note !== 'string' || !note.trim() || note.length > 1000)
      return res.status(400).json({ error: 'A description of 1–1000 characters is required.' });
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 100)
      return res.status(400).json({ error: 'A unique request key is required.' });
    let amountMinor = moneyMinor(amount, 'Amount', { signed: kind === 'ADJUSTMENT' });
    if (amountMinor === 0n) return res.status(400).json({ error: 'Enter a non-zero amount.' });
    // Tuition is paid in one go (full, discounted or exempt), never in instalments.
    if (kind === 'PAYMENT') {
      const fee = moneyMinor(enrollment.customFee ?? enrollment.course.courseFee),
        left = fee - moneyMinor(enrollment.amountPaid);
      if (left > 0n && amountMinor !== left)
        return res.status(400).json({
          error: `Tuition is paid in full, not in instalments: record the whole ${Number(left) / 100} EGP, or change the tuition to discounted or exempt first.`
        });
    }
    if (kind === 'REFUND') amountMinor = -amountMinor;
    const date = occurredAt ? new Date(occurredAt) : new Date();
    if (!Number.isFinite(date.getTime()) || date > new Date())
      return res.status(400).json({ error: 'Payment date must be valid and not in the future.' });
    const existing = await prisma.paymentEntry.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (
        existing.enrollmentId !== enrollment.id ||
        existing.kind !== kind ||
        existing.amountMinor !== amountMinor ||
        existing.note !== note.trim() ||
        existing.paymentMethod !== metadata.paymentMethod ||
        existing.receiptNumber !== metadata.receiptNumber
      )
        return res.status(409).json({ error: 'This request key was already used for another payment.' });
      return res.json(paymentView(existing));
    }
    res.status(201).json(
      await appendPayment(enrollment, enrollment.course, enrollment.student, req.user, {
        amountMinor,
        kind,
        note: note.trim(),
        idempotencyKey,
        occurredAt: date,
        ...metadata
      })
    );
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});
export const reversePayment = atomic(async (req, res, next) => {
  try {
    const enrollment = await enrollmentFor(req);
    if (!isManager(req.user)) return res.status(403).json({ error: 'Only admins and mods can reverse entries.' });
    if (enrollment.deletedAt || enrollment.financialArchivedAt)
      return res.status(409).json({ error: 'Archived payment records are read-only.' });
    if (typeof req.body.note !== 'string' || !req.body.note.trim() || req.body.note.length > 1000)
      return res.status(400).json({ error: 'Explain why this entry is being reversed (1–1000 characters).' });
    const entry = await prisma.paymentEntry.findFirst({
      where: { id: req.params.paymentId, enrollmentId: enrollment.id },
      include: { reversal: true }
    });
    if (!entry) return res.status(404).json({ error: 'Payment entry not found.' });
    await assertMoneyUnlocked(req.user, { paymentIds: [entry.id] });
    if (entry.reversal || entry.kind === 'REVERSAL')
      return res.status(409).json({ error: 'This entry cannot be reversed again.' });
    res.status(201).json(
      await appendPayment(enrollment, enrollment.course, enrollment.student, req.user, {
        amountMinor: -entry.amountMinor,
        kind: 'REVERSAL',
        note: req.body.note.trim(),
        idempotencyKey: `reversal:${entry.id}`,
        reversalOfId: entry.id,
        paymentMethod: entry.paymentMethod,
        receiptNumber: entry.receiptNumber
      })
    );
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

// Marks an unpaid enrollment as paid in one step: full fee, a discounted fee paid in full, or exempt.
// Used for students carried into a next level, who start unpaid. There are no instalments.
export const settleEnrollment = atomic(async (req, res, next) => {
  try {
    const enrollment = await enrollmentFor(req);
    if (!isManager(req.user))
      return res.status(403).json({ error: 'Only admins and mods can record tuition payments.' });
    if (enrollment.deletedAt || enrollment.financialArchivedAt)
      return res.status(409).json({ error: 'This enrollment is archived. Its payment history is read-only.' });
    if (enrollment.course.archivedAt) return res.status(409).json({ error: 'Restore the archived cycle first.' });
    const paid = await prisma.paymentEntry.count({ where: { enrollmentId: enrollment.id } });
    if (enrollment.amountPaid !== 0 || paid)
      return res.status(409).json({
        error: `${enrollment.student.name}'s tuition is already recorded. Correct it from the payment history.`
      });
    if (typeof req.body.idempotencyKey !== 'string' || req.body.idempotencyKey.length < 8)
      return res.status(400).json({ error: 'A unique request key is required.' });
    const terms = enrollmentTerms(
      { tuitionType: req.body.tuitionType, customFee: req.body.customFee },
      enrollment.course.courseFee
    );
    const updated = await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { customFee: terms.customFee }
    });
    if (terms.amountPaid > 0)
      await appendPayment(updated, enrollment.course, enrollment.student, req.user, {
        amountMinor: moneyMinor(terms.amountPaid),
        kind: 'PAYMENT',
        note: terms.tuitionType === 'DISCOUNTED' ? 'Discounted tuition paid in full' : 'Full tuition paid',
        idempotencyKey: req.body.idempotencyKey,
        ...paymentFields(req.body)
      });
    const label = { FULL: 'paid in full', DISCOUNTED: 'paid at a discount', EXEMPT: 'exempt' }[terms.tuitionType];
    await logAction(
      'SETTLE_TUITION',
      `${enrollment.student.name} in ${enrollment.course.name} (${enrollment.course.branch}): tuition ${label}${terms.amountPaid ? ` · ${terms.amountPaid} EGP` : ''}`,
      req.user.username
    );
    res.json({ message: `Tuition ${label}.`, tuitionType: terms.tuitionType, amountPaid: terms.amountPaid });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});
