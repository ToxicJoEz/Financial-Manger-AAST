import { createHmac, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma, { atomic } from '../db/prisma.js';
import { parsePrivateWorkbook, phoneNumbers, privateDate } from '../utils/privateWorkbook.js';
import { importError } from '../utils/importWorkbook.js';
import { moneyMinor, numberValue } from '../utils/numbers.js';
import { employeeName, employeeNumber, employeeBranches } from '../utils/employees.js';
import { LEVEL_MAX, subCourseName, namedCycle, umbrellaBranches } from '../utils/privateCourses.js';
import { randomUUID } from 'node:crypto';
import { PRIVATE_SEAT_LIMIT } from '../utils/privateSeat.js';
import { importedCycleFinished } from '../utils/academyDate.js';
import { appendPayment } from '../utils/paymentLedger.js';
import { savePayrollRecord } from '../utils/payrollRecord.js';
import { auditContext } from '../utils/auditContext.js';

// One private workbook entry is one student. Students whose rows share merged cells form one group,
// and each group becomes one private cycle inside a sub-umbrella (e.g. "PET 2" -> sub-umbrella PET, cycle 2).
const key = () => createHmac('sha256', process.env.JWT_SECRET).update('private-course-import-v2').digest('hex');
const hash = value => createHash('sha256').update(value).digest('hex');
async function parentFor(id) {
  const parent = await prisma.course.findUnique({ where: { id } });
  if (!parent?.isPrivate || parent.archivedAt) throw importError('Choose an available private umbrella.', 404);
  return parent;
}
function claimFor(req) {
  try {
    const claim = jwt.verify(req.body.previewToken, key(), {
      algorithms: ['HS256'],
      audience: 'private-course-import'
    });
    if (claim.userId !== req.user.id || claim.parentId !== req.params.parentId) throw new Error();
    return claim;
  } catch {
    throw importError('This preview expired or belongs to another user or umbrella. Upload again.', 403);
  }
}
const snapshot = matches =>
  matches
    .map(s => ({ id: s.id, updatedAt: s.updatedAt, archived: Boolean(s.deletedAt) }))
    .sort((a, b) => a.id.localeCompare(b.id));
const match = (row, students) =>
  students.filter(s => phoneNumbers(s.mobile).some(n => phoneNumbers(row.mobile).includes(n)));
const studentFields = {
  id: true,
  name: true,
  englishName: true,
  mobile: true,
  registrationNumber: true,
  deletedAt: true,
  updatedAt: true
};

// Per-student checks.
function studentErrors(row) {
  const errors = [];
  if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 160)
    errors.push('Student name is required (up to 160 characters).');
  if (typeof row.mobile !== 'string' || row.mobile.length > 100 || !phoneNumbers(row.mobile).length)
    errors.push('A valid student phone number is required.');
  if (row.currency && !/^EGP$/i.test(row.currency)) errors.push('Only EGP tuition is supported.');
  try {
    if (row.amount === '') throw new Error();
    moneyMinor(row.amount, 'Tuition');
  } catch {
    errors.push('Enter nonnegative tuition, or 0 for exemption.');
  }
  return errors;
}

// Cycle-level checks, read from the group's first row.
function cycleErrors(lead) {
  const errors = [];
  try {
    subCourseName(lead.subCourseName);
  } catch {
    errors.push('Enter the sub-umbrella name (e.g. KET).');
  }
  if (lead.dateIssues?.endDate && !lead.endDate && !lead.clearEndDate)
    errors.push('Correct the invalid source end date, or confirm it is unknown.');
  const start = privateDate(lead.startDate),
    end = privateDate(lead.endDate);
  if (!start.value) errors.push('Correct the start date.');
  if (lead.endDate && !end.value) errors.push('Correct the end date.');
  if (start.value && end.value && end.value < start.value) errors.push('End date must be on or after start date.');
  try {
    if (lead.hours === '' || numberValue(lead.hours, 'Teaching hours') <= 0) throw new Error();
  } catch {
    errors.push('Enter positive teaching hours.');
  }
  try {
    employeeBranches([lead.branch]);
  } catch {
    errors.push('Choose a branch.');
  }
  try {
    moneyMinor(lead.hourlyRate, 'Cycle employee hourly rate');
  } catch {
    errors.push('Enter the employee hourly rate for this cycle.');
  }
  return errors;
}

const groupFingerprint = (parentId, members) =>
  hash(
    `${parentId}:group:${members
      .map(r => r.fingerprint)
      .sort()
      .join(',')}`
  );
const validLevel = value => Number.isInteger(value) && value >= 1 && value <= LEVEL_MAX;

// Builds the cycle plan: groups, their sub-umbrella and level, and every problem to fix first.
// `numbers` holds levels the reviewer typed; otherwise the level comes from the file ("PET 2" -> level 2).
// Names follow "<sub-umbrella> <level> - <start month>", with "(n)" added on import for repeats.
async function planGroups(parentId, rows, numbers = {}) {
  const byGroup = new Map();
  for (const row of rows) byGroup.set(row.groupId, [...(byGroup.get(row.groupId) || []), row]);
  const subs = await prisma.subCourse.findMany({ where: { parentCourseId: parentId } });
  const subByName = new Map(subs.map(sub => [sub.name, sub]));
  const parent = await prisma.course.findUnique({ where: { id: parentId }, select: { name: true, branches: true } });
  const allowed = umbrellaBranches(parent);
  const imported = new Set(
    (
      await prisma.importBatch.findMany({
        where: { fingerprint: { in: [...byGroup.values()].map(m => groupFingerprint(parentId, m)) } },
        select: { fingerprint: true }
      })
    ).map(b => b.fingerprint)
  );
  const groups = [...byGroup.entries()].map(([id, members]) => {
    members.sort((a, b) => a.sourceRow - b.sourceRow);
    const lead = members[0];
    let name = '';
    try {
      name = subCourseName(lead.subCourseName);
    } catch {}
    const amounts = members.map(r => Number(r.amount)).filter(Number.isFinite);
    return {
      id,
      rowIds: members.map(r => r.id),
      sheetId: lead.sheetId,
      sheet: lead.sheet,
      sourceRows: members.map(r => r.sourceRow),
      subCourseName: name,
      newSubCourse: Boolean(name) && !subByName.has(name),
      fee: amounts.length ? Math.max(...amounts) : '',
      sharedAmount: lead.sharedAmount || null,
      alreadyImported: imported.has(groupFingerprint(parentId, members)),
      errors: [
        ...cycleErrors(lead),
        ...(lead.branch && !allowed.includes(String(lead.branch).toUpperCase())
          ? [`${parent.name} is not open for ${lead.branch}. The main mod can open it on the umbrella card.`]
          : []),
        ...(members.length > PRIVATE_SEAT_LIMIT
          ? [`A private cycle holds at most ${PRIVATE_SEAT_LIMIT} students; this group has ${members.length}.`]
          : [])
      ],
      members,
      requested: Object.hasOwn(numbers, id) ? Number(numbers[id]) : lead.cycleNumber
    };
  });
  for (const group of groups) {
    if (!group.subCourseName || group.alreadyImported) continue;
    group.numberSource = Object.hasOwn(numbers, group.id) ? 'reviewed' : 'file';
    group.cycleNumber = group.requested;
    if (group.requested == null) {
      group.errors.push('Enter the level for this cycle.');
      group.numberSource = 'missing';
    } else if (!validLevel(group.requested)) group.errors.push('Level must be a whole number from 1 up.');
  }
  return {
    groups,
    subCourses: subs.map(s => ({ id: s.id, name: s.name, bookPrice: s.bookPrice, archivedAt: s.archivedAt }))
  };
}

const publicGroup = ({ members, requested, ...group }) => group;

async function preview(req, res, claim) {
  const students = await prisma.student.findMany({ select: studentFields });
  const { groups, subCourses } = await planGroups(claim.parentId, claim.parsed.rows, claim.numbers || {});
  const groupOf = new Map(groups.flatMap(g => g.rowIds.map(id => [id, g.id])));
  const rows = claim.parsed.rows.map(row => ({
    ...row,
    groupId: groupOf.get(row.id),
    matches: match(row, students),
    errors: studentErrors(row)
  }));
  const { exp, iat, ...payload } = claim;
  const previewToken = jwt.sign(
    { ...payload, studentVersions: Object.fromEntries(rows.map(r => [r.id, snapshot(r.matches)])) },
    key(),
    { algorithm: 'HS256', expiresIn: '30m' }
  );
  res.json({
    sheets: claim.parsed.sheets,
    rows,
    groups: groups.map(publicGroup),
    subCourses,
    newSubCourses: [...new Set(groups.filter(g => g.newSubCourse && !g.alreadyImported).map(g => g.subCourseName))],
    warnings: claim.parsed.warnings,
    previewToken
  });
}

export const previewPrivateImport = async (req, res, next) => {
  try {
    const parent = await parentFor(req.params.parentId),
      parsed = await parsePrivateWorkbook(req.body);
    let fileName = 'Private courses.xlsx';
    try {
      fileName = decodeURIComponent(req.headers['x-file-name'] || fileName).slice(0, 200);
    } catch {}
    await preview(req, res, {
      userId: req.user.id,
      parentId: parent.id,
      parsed,
      fileName,
      aud: 'private-course-import'
    });
  } catch (error) {
    next(error);
  }
};

const studentFieldsEditable = ['name', 'mobile', 'amount'];
const cycleFieldsEditable = ['startDate', 'endDate', 'hours', 'branch', 'hourlyRate', 'clearEndDate', 'subCourseName'];

export const reviewPrivateImport = async (req, res, next) => {
  try {
    const claim = claimFor(req);
    await parentFor(claim.parentId);
    const { edits = {}, numbers = {} } = req.body;
    if (
      !edits ||
      typeof edits !== 'object' ||
      Array.isArray(edits) ||
      typeof numbers !== 'object' ||
      Array.isArray(numbers)
    )
      throw importError('Review the edited rows first.');
    claim.parsed.rows = claim.parsed.rows.map(row => {
      const edit = edits[row.id] || {};
      const allowed = [...studentFieldsEditable, ...cycleFieldsEditable];
      return { ...row, ...Object.fromEntries(allowed.filter(k => Object.hasOwn(edit, k)).map(k => [k, edit[k]])) };
    });
    claim.numbers = Object.fromEntries(
      Object.entries(numbers)
        .filter(([id, value]) => claim.parsed.rows.some(r => r.groupId === id) && value !== '' && value != null)
        .map(([id, value]) => [id, Number(value)])
    );
    await preview(req, res, claim);
  } catch (error) {
    next(error);
  }
};

export const commitPrivateImport = atomic(
  async (req, res, next) => {
    try {
      const claim = claimFor(req),
        parent = await parentFor(claim.parentId);
      req.auditFileName = claim.fileName;
      const ids = req.body.rowIds;
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 500 ||
        new Set(ids).size !== ids.length ||
        ids.some(id => !claim.parsed.rows.some(r => r.id === id))
      )
        throw importError('Select valid private course entries.');
      const numbers = req.body.numbers && typeof req.body.numbers === 'object' ? req.body.numbers : {};
      const selectedRows = claim.parsed.rows.filter(r => ids.includes(r.id));
      const { groups } = await planGroups(parent.id, selectedRows, numbers);
      for (const group of groups) {
        const whole = claim.parsed.rows.filter(r => r.groupId === group.id);
        if (whole.length !== group.members.length)
          throw importError(
            `${group.sheet}, rows ${whole.map(r => r.sourceRow).join(', ')} study together. Select all of them or none.`
          );
        const problems = [
          ...group.errors,
          ...group.members.flatMap(r => studentErrors(r).map(e => `${r.name || 'Row ' + r.sourceRow}: ${e}`))
        ];
        if (problems.length)
          throw importError(`${group.sheet}, row ${group.sourceRows.join('/')}: ${problems.join(' ')}`);
        if (group.alreadyImported)
          throw importError('One or more selected cycles were already imported. Review the file again.', 409);
        if (!Object.hasOwn(numbers, group.id) || Number(numbers[group.id]) !== group.cycleNumber)
          throw importError('Cycle levels changed since the preview. Review the file again.', 409);
      }
      const students = await prisma.student.findMany({ select: studentFields }),
        choices = req.body.students || {},
        sheetChoices = req.body.employees || {},
        newSubCourses = req.body.newSubCourses || {},
        assigned = new Map();
      for (const row of selectedRows)
        if (JSON.stringify(snapshot(match(row, students))) !== JSON.stringify(claim.studentVersions[row.id]))
          throw importError(`Student matches changed for ${row.name}. Review the workbook again.`, 409);
      // Resolve each sheet once. Its selected employee owns all of that sheet's assignments.
      for (const sheet of claim.parsed.sheets.filter(s => selectedRows.some(r => r.sheetId === s.id))) {
        const choice = sheetChoices[sheet.id];
        if (!choice || !['existing', 'new'].includes(choice.mode))
          throw importError(`Choose an existing or new employee for ${sheet.name}.`);
        let employee;
        if (choice.mode === 'existing') {
          employee = await prisma.instructor.findUnique({ where: { id: choice.employeeId || '' } });
          if (!employee || employee.archivedAt) throw importError(`Choose an active employee for ${sheet.name}.`, 409);
        } else {
          const name = employeeName(choice.name),
            employeeId = employeeNumber(choice.employeeId);
          if (!name || name.length > 160 || employeeId.length > 80)
            throw importError('Enter a valid new employee name and ID.');
          const branches = employeeBranches(groups.filter(g => g.sheetId === sheet.id).map(g => g.members[0].branch));
          employee = await prisma.instructor.create({
            data: { name, employeeId: employeeId || null, branches: branches.join(',') }
          });
        }
        assigned.set(sheet.id, { employee });
      }
      // Sub-umbrellas: reuse existing ones; create missing ones with the reviewer's book price.
      const subByName = new Map(
        (await prisma.subCourse.findMany({ where: { parentCourseId: parent.id } })).map(s => [s.name, s])
      );
      const createdSubCourses = [];
      for (const name of [...new Set(groups.map(g => g.subCourseName))]) {
        const existing = subByName.get(name);
        if (existing) {
          if (existing.archivedAt) throw importError(`Restore the ${name} sub-umbrella before importing into it.`, 409);
          continue;
        }
        const settings = newSubCourses[name] || {};
        const sub = await prisma.subCourse.create({
          data: {
            parentCourseId: parent.id,
            name,
            bookPrice: Number(moneyMinor(settings.bookPrice ?? 0, `${name} book price`)) / 100
          }
        });
        subByName.set(name, sub);
        createdSubCourses.push(name);
      }
      let created = 0,
        reused = 0;
      const cycles = [],
        selectedByPhone = new Map();
      for (const group of groups) {
        const lead = group.members[0],
          sub = subByName.get(group.subCourseName);
        const enrolled = [];
        for (const row of group.members) {
          const candidates = match(row, students);
          let student;
          const selected = choices[row.id];
          if (selected) {
            student = candidates.find(s => s.id === selected);
            if (!student || student.deletedAt)
              throw importError(`Select an active matching student for ${row.name}.`, 409);
          } else if (candidates.length === 1 && !candidates[0].deletedAt) student = candidates[0];
          else if (candidates.length)
            throw importError(`Choose a matching student for ${row.name}; archived profiles must be restored first.`);
          else {
            student = await prisma.student.create({
              data: {
                name: row.name.trim(),
                englishName: row.name.trim(),
                mobile: row.mobile.trim(),
                registrationNumber: null
              }
            });
            students.push(student);
            created++;
          }
          const phones = phoneNumbers(row.mobile),
            previous = phones.map(p => selectedByPhone.get(p)).filter(Boolean);
          if (previous.some(id => id !== student.id))
            throw importError(`The same phone was assigned to different students in this import. Review ${row.name}.`);
          if (enrolled.some(e => e.student.id === student.id))
            throw importError(`${row.name} appears twice in the same group. Review the workbook.`);
          phones.forEach(p => selectedByPhone.set(p, student.id));
          if (candidates.length) reused++;
          enrolled.push({ row, student });
        }
        const { employee } = assigned.get(group.sheetId),
          hourlyRate = Number(moneyMinor(lead.hourlyRate, 'Cycle employee hourly rate')) / 100,
          isFinished = importedCycleFinished(lead.endDate);
        // The standard fee is the highest amount in the group; lower amounts are fully paid discounts.
        const fee = Number(moneyMinor(group.fee)) / 100;
        const cycleId = randomUUID();
        const cycle = await prisma.cycle.create({
          data: {
            id: cycleId,
            chainId: cycleId,
            chainStart: new Date(lead.startDate + 'T00:00:00Z'),
            parentCourseId: parent.id,
            subCourseId: sub.id,
            numberingKey: sub.id,
            cycleNumber: group.cycleNumber,
            ...(await namedCycle({
              prefix: sub.name,
              numberingKey: sub.id,
              branch: lead.branch,
              level: group.cycleNumber,
              startDate: new Date(lead.startDate + 'T00:00:00Z')
            })),
            branch: lead.branch,
            startDate: new Date(lead.startDate + 'T00:00:00Z'),
            endDate: lead.endDate ? new Date(lead.endDate + 'T00:00:00Z') : null,
            isFinished,
            totalHours: numberValue(lead.hours),
            courseFee: fee
          }
        });
        const batch = await prisma.importBatch.create({
          data: {
            fingerprint: groupFingerprint(parent.id, group.members),
            fileName: claim.fileName,
            parentCourseId: parent.id,
            cycleId: cycle.id,
            recordedBy: req.user.username,
            studentCount: enrolled.length
          }
        });
        for (const [index, { row, student }] of enrolled.entries()) {
          const amount = Number(moneyMinor(row.amount)) / 100;
          const enrollment = await prisma.enrollment.create({
            data: {
              courseId: cycle.id,
              studentId: student.id,
              customFee: amount === 0 ? 0 : amount === fee ? null : amount
            }
          });
          if (amount > 0)
            await appendPayment(enrollment, cycle, student, req.user, {
              amountMinor: moneyMinor(amount),
              kind: 'PAYMENT',
              note: group.sharedAmount
                ? `Paid tuition imported from private course workbook (share of ${group.sharedAmount.total} EGP for ${group.sharedAmount.students} students).`
                : 'Paid tuition imported from private course workbook.',
              paymentMethod: 'UNSPECIFIED',
              paymentDateKnown: false,
              idempotencyKey: `private-import:${batch.id}:${index}`,
              importBatchId: batch.id
            });
        }
        await prisma.courseInstructor.create({
          data: {
            courseId: cycle.id,
            instructorId: employee.id,
            hourlyRate,
            hoursTaught: isFinished ? Number(lead.hours) : null
          }
        });
        if (isFinished) await savePayrollRecord(cycle.id);
        cycles.push({ id: cycle.id, name: cycle.name, students: enrolled.length });
      }
      const audit = auditContext.getStore();
      if (audit)
        audit.records = selectedRows.map(row => ({
          ...row,
          selectedStudent: choices[row.id] || null,
          employee: assigned.get(row.sheetId).employee.id
        }));
      res.status(201).json({
        cycles,
        created,
        reused,
        enrolled: selectedRows.length,
        createdSubCourses,
        message: `Imported ${cycles.length} private cycles for ${selectedRows.length} students.`
      });
    } catch (error) {
      next(error);
    }
  },
  { timeout: 120000 }
);
