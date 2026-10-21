import { paymentFields } from './studentProfile.js';
import { assertWithinFee } from './tuition.js';
import prisma from '../db/prisma.js';
import { moneyMinor } from './numbers.js';

export const paymentView = entry => ({ ...entry, amountMinor: entry.amountMinor.toString(), amount: Number(entry.amountMinor) / 100 });

export async function appendPayment(enrollment, course, student, user, { amountMinor, kind, note, idempotencyKey, reversalOfId, occurredAt, paymentMethod, receiptNumber, paymentDateKnown = true, importBatchId }) {
  const entry = await prisma.paymentEntry.create({ data: {
    enrollmentId: enrollment.id, courseId: course.id, studentId: student.id,
    courseName: course.name, studentName: student.name, amountMinor, kind, note,
    ...paymentFields({ paymentMethod, receiptNumber }), paymentDateKnown, importBatchId,
    recordedBy: user.username, idempotencyKey, reversalOfId, occurredAt: occurredAt || new Date()
  } });
  const { _sum } = await prisma.paymentEntry.aggregate({ where: { enrollmentId: enrollment.id }, _sum: { amountMinor: true } });
  const net = _sum.amountMinor || 0n;
  if (net < 0n) throw Object.assign(new Error('Refunds or corrections cannot reduce the collected balance below zero.'), { status: 400 });
  if (net > BigInt(Number.MAX_SAFE_INTEGER)) throw Object.assign(new Error('Balance exceeds the supported range.'), { status: 400 });
  if (amountMinor > 0n) assertWithinFee(Number(net) / 100, enrollment.customFee ?? course.courseFee);
  await prisma.enrollment.update({ where: { id: enrollment.id }, data: { amountPaid: Number(net) / 100 } });
  return paymentView(entry);
}

export async function openingBalance(enrollment, course, student, user, metadata = {}) {
  const amountMinor = moneyMinor(enrollment.amountPaid);
  if (amountMinor === 0n) return;
  await appendPayment(enrollment, course, student, user, { amountMinor, kind: 'PAYMENT',
    note: 'Payment explicitly recorded when the student was enrolled.', idempotencyKey: `opening:${enrollment.id}`, ...metadata });
}
