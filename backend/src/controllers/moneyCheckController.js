import { createHash } from 'node:crypto';
import prisma, { atomic } from '../db/prisma.js';
import { logAction } from '../utils/logger.js';
import { CHECKED_BRANCHES } from '../utils/access.js';

// Money recorded for a checked branch (tuition ledger entries and book payments on that branch's cycles)
// stays "Unchecked" until an admin or the main mod confirms it. A check stores a fingerprint of the record,
// so a later change shows as "Changed after check" instead of silently staying checked.
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const fingerprintOf = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const paymentFingerprint = p =>
  fingerprintOf([
    p.amountMinor.toString(),
    p.kind,
    p.paymentMethod,
    p.receiptNumber,
    p.occurredAt.toISOString(),
    p.courseId
  ]);
const bookFingerprint = b =>
  fingerprintOf([
    b.amountMinor.toString(),
    b.status,
    b.reversedAt?.toISOString() ?? null,
    b.enrollment?.courseId ?? null
  ]);

function branchOf(value) {
  const branch = String(value || '').toUpperCase();
  if (!CHECKED_BRANCHES.includes(branch)) fail(`Money checks are available for: ${CHECKED_BRANCHES.join(', ')}.`);
  return branch;
}
function dayRange(from, to) {
  const range = {};
  for (const [key, value] of [
    ['gte', from],
    ['lt', to]
  ]) {
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)))
      fail('Choose valid dates.');
    const date = new Date(value + 'T00:00:00Z');
    if (key === 'lt') date.setUTCDate(date.getUTCDate() + 1);
    range[key] = date;
  }
  return Object.keys(range).length ? range : undefined;
}

// Every money record for the branch, with its current check state.
async function moneyRecords(branch, range) {
  const cycles = await prisma.cycle.findMany({ where: { branch }, select: { id: true, name: true } });
  const cycleIds = cycles.map(c => c.id);
  const [payments, books, checks] = await Promise.all([
    prisma.paymentEntry.findMany({
      where: { courseId: { in: cycleIds }, ...(range ? { occurredAt: range } : {}) },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }]
    }),
    prisma.bookPayment.findMany({
      where: {
        status: 'PAID',
        amountMinor: { gt: 0n },
        enrollment: { courseId: { in: cycleIds } },
        ...(range ? { recordedAt: range } : {})
      },
      include: { enrollment: { select: { courseId: true, student: { select: { name: true } } } } },
      orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }]
    }),
    prisma.moneyCheck.findMany({ where: { branch } })
  ]);
  const checkOf = new Map(checks.map(c => [`${c.kind}:${c.recordId}`, c]));
  const cycleName = new Map(cycles.map(c => [c.id, c.name]));
  const withState = (item, fingerprint) => {
    const check = checkOf.get(`${item.kind}:${item.id}`);
    const state = !check ? 'UNCHECKED' : check.fingerprint === fingerprint ? 'CHECKED' : 'CHANGED';
    return {
      ...item,
      state,
      check: check ? { checkedBy: check.checkedBy, checkedAt: check.checkedAt, note: check.note } : null
    };
  };
  const items = [
    ...payments.map(p =>
      withState(
        {
          kind: 'PAYMENT',
          id: p.id,
          type: p.kind,
          date: p.occurredAt,
          dateKnown: p.paymentDateKnown,
          recordedAt: p.recordedAt,
          amount: Number(p.amountMinor) / 100,
          method: p.paymentMethod,
          receiptNumber: p.receiptNumber,
          student: p.studentName,
          cycle: p.courseName,
          cycleId: p.courseId,
          recordedBy: p.recordedBy,
          description: p.note
        },
        paymentFingerprint(p)
      )
    ),
    ...books.map(b =>
      withState(
        {
          kind: 'BOOK',
          id: b.id,
          type: b.reversedAt ? 'BOOK_UNDONE' : 'BOOK',
          date: b.recordedAt,
          dateKnown: true,
          recordedAt: b.recordedAt,
          amount: b.reversedAt ? 0 : Number(b.amountMinor) / 100,
          originalAmount: Number(b.amountMinor) / 100,
          method: null,
          receiptNumber: null,
          student: b.enrollment?.student?.name || 'Removed student',
          cycle: cycleName.get(b.enrollment?.courseId) || 'Cycle',
          cycleId: b.enrollment?.courseId,
          recordedBy: b.recordedBy,
          description: b.reversedAt ? `Book payment undone by @${b.reversedBy}` : 'Book payment'
        },
        bookFingerprint(b)
      )
    )
  ].sort((a, b) => new Date(b.date) - new Date(a.date) || a.id.localeCompare(b.id));
  return { items, payments, books };
}

const totals = items => {
  const of = state => {
    const rows = items.filter(i => i.state === state);
    return { count: rows.length, amount: Math.round(rows.reduce((sum, i) => sum + i.amount, 0) * 100) / 100 };
  };
  return { unchecked: of('UNCHECKED'), checked: of('CHECKED'), changed: of('CHANGED') };
};

export const listMoneyChecks = async (req, res, next) => {
  try {
    const branch = branchOf(req.query.branch);
    const status = String(req.query.status || '');
    if (status && !['UNCHECKED', 'CHECKED', 'CHANGED'].includes(status)) fail('Invalid check filter.');
    const { items } = await moneyRecords(branch, dayRange(req.query.from, req.query.to));
    const summary = totals(items);
    if (req.query.summary === '1') return res.json({ branch, summary });
    const shown = status ? items.filter(i => i.state === status) : items;
    if (shown.length > 3000) fail('Too many records. Choose a shorter date range.', 413);
    res.json({ branch, summary, items: shown });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
};

function selection(body) {
  const items = body?.items;
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > 1000 ||
    items.some(i => !i || !['PAYMENT', 'BOOK'].includes(i.kind) || typeof i.id !== 'string')
  )
    fail('Select between 1 and 1,000 money records.');
  return items;
}

export const markMoneyChecked = atomic(async (req, res, next) => {
  try {
    const branch = branchOf(req.body.branch);
    const items = selection(req.body);
    const note = req.body.note == null || req.body.note === '' ? null : String(req.body.note).trim().slice(0, 500);
    const { payments, books } = await moneyRecords(branch);
    const paymentById = new Map(payments.map(p => [p.id, p])),
      bookById = new Map(books.map(b => [b.id, b]));
    for (const item of items) {
      const record = item.kind === 'PAYMENT' ? paymentById.get(item.id) : bookById.get(item.id);
      if (!record) fail(`A selected record is no longer part of ${branch}'s money. Refresh and try again.`, 409);
      const fingerprint = item.kind === 'PAYMENT' ? paymentFingerprint(record) : bookFingerprint(record);
      const data = { branch, fingerprint, note, checkedBy: req.user.username, checkedAt: new Date() };
      // Find-then-write (not upsert): the audit layer records before/after by id.
      const existing = await prisma.moneyCheck.findUnique({
        where: { kind_recordId: { kind: item.kind, recordId: item.id } },
        select: { id: true }
      });
      if (existing) await prisma.moneyCheck.update({ where: { id: existing.id }, data });
      else await prisma.moneyCheck.create({ data: { kind: item.kind, recordId: item.id, ...data } });
    }
    await logAction('MONEY_CHECKED', `${items.length} ${branch} money records checked.`, req.user.username);
    res.json({ message: `${items.length} record${items.length === 1 ? '' : 's'} marked as checked.` });
  } catch (error) {
    next(error);
  }
});

export const unmarkMoneyChecked = atomic(async (req, res, next) => {
  try {
    const branch = branchOf(req.body.branch);
    const items = selection(req.body);
    let removed = 0;
    for (const item of items)
      removed += (await prisma.moneyCheck.deleteMany({ where: { kind: item.kind, recordId: item.id, branch } })).count;
    await logAction('MONEY_UNCHECKED', `${removed} ${branch} money records marked unchecked.`, req.user.username);
    res.json({ message: `${removed} record${removed === 1 ? '' : 's'} marked as unchecked.` });
  } catch (error) {
    next(error);
  }
});
