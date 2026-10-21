import { cycleSchedule } from '../utils/cycleSchedule.js';
import { savePayrollRecord } from '../utils/payrollRecord.js';
import { importedCycleFinished } from '../utils/academyDate.js';
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma, { atomic } from '../db/prisma.js';
import { isManager } from '../utils/courseView.js';
import { parseStudentsWorkbook, importError, normalizedName } from '../utils/importWorkbook.js';
import { profileFields } from '../utils/studentProfile.js';
import { appendPayment } from '../utils/paymentLedger.js';
import { moneyMinor, numberValue } from '../utils/numbers.js';
import { logAction } from '../utils/logger.js';
const previewKey = () => createHmac('sha256', process.env.JWT_SECRET).update('aast-cycle-import-preview-v1').digest('hex');
const fields = ['englishName', 'mobile', 'dateOfBirth', 'nationality', 'placeOfBirth'];
const dateOnly = value => value instanceof Date ? value.toISOString().slice(0, 10) : value;
async function inspect(parsed, user) {
  const students = await prisma.student.findMany({
    where: {
      OR: [{
        registrationNumber: {
          in: parsed.rows.map(r => r.registrationNumber)
        }
      }, {
        name: {
          in: parsed.rows.map(r => r.name)
        }
      }]
    }
  });
  const seen = new Set();
  return parsed.rows.map(row => {
    const existing = students.find(s => s.registrationNumber === row.registrationNumber);
    const issues = [];
    if (seen.has(row.registrationNumber)) issues.push('Duplicate registration number inside this workbook.');
    seen.add(row.registrationNumber);
    if (row.paymentMethod === 'UNSPECIFIED') issues.push(`Unknown payment-method code: ${row.methodCode || '(blank)'}. Correct the source workbook.`);
    if (existing?.deletedAt) issues.push('This registration number belongs to a deleted student. Ask a manager to resolve the record before importing.');else if (existing && normalizedName(existing.name) !== normalizedName(row.name)) issues.push('Registration number already belongs to a different student name. Correct the source or student directory first.');
    const differences = existing && !existing.deletedAt ? fields.filter(key => existing[key] && row[key] && normalizedName(dateOnly(existing[key])) !== normalizedName(row[key])).map(key => ({
      field: key,
      existing: dateOnly(existing[key]),
      incoming: row[key]
    })) : [];
    const sameName = students.some(s => !s.deletedAt && normalizedName(s.name) === normalizedName(row.name) && s.registrationNumber !== row.registrationNumber);
    return {
      ...row,
      existing: existing ? {
        id: existing.id,
        name: existing.deletedAt && !isManager(user) ? 'Deleted student' : existing.name,
        updatedAt: existing.updatedAt.toISOString()
      } : null,
      differences,
      sameName,
      issues
    };
  });
}
async function parentFor(id) {
  const parent = await prisma.course.findUnique({
    where: {
      id
    }
  });
  if (!parent || parent.archivedAt) throw importError('Choose an available course umbrella.', 404);
  return parent;
}
export const previewImport = async (req, res, next) => {
  try {
    const parent = await parentFor(req.params.parentId);
    const parsed = await parseStudentsWorkbook(req.body);
    const prior = await prisma.importBatch.findUnique({
      where: {
        fingerprint: parsed.fingerprint
      }
    });
    if (prior) throw importError('This roster has already been imported. Open the existing cycle instead.', 409);
    const rows = await inspect(parsed, req.user);
    const rawName = req.headers['x-file-name'];
    let fileName = 'Student roster.xlsx';
    try {
      if (typeof rawName === 'string') fileName = decodeURIComponent(rawName).slice(0, 200);
    } catch {}
    const previewToken = jwt.sign({
      purpose: 'cycle-import',
      userId: req.user.id,
      parentId: parent.id,
      parsed,
      fileName,
      studentVersions: Object.fromEntries(rows.map(r => [r.registrationNumber, r.existing ? {
        id: r.existing.id,
        updatedAt: r.existing.updatedAt
      } : null]))
    }, previewKey(), {
      expiresIn: '30m',
      algorithm: 'HS256',
      audience: 'cycle-import'
    });
    res.json({
      ...parsed,
      rows,
      previewToken,
      courseMismatch: parsed.courseCode !== parent.code,
      parent: {
        id: parent.id,
        name: parent.name,
        code: parent.code
      }
    });
  } catch (error) {
    res.status(error.status || 400).json({
      error: error.message || 'Workbook could not be inspected.'
    });
  }
};
export const commitImport = atomic(async (req, res, next) => {
  try {
    let claim;
    try {
      claim = jwt.verify(req.body.previewToken, previewKey(), {
        algorithms: ['HS256'],
        audience: 'cycle-import'
      });
    } catch {
      throw importError('The preview expired or is invalid. Upload the workbook again.');
    }
    if (claim.purpose !== 'cycle-import' || claim.userId !== req.user.id || claim.parentId !== req.params.parentId) throw importError('This preview belongs to another user or course.', 403);
    const parent = await parentFor(claim.parentId),
      parsed = claim.parsed;
    if (parsed.courseCode !== parent.code) throw importError(`File code ${parsed.courseCode || '(missing)'} does not match ${parent.code}. Correct the course or source workbook.`);
    const prior = await prisma.importBatch.findUnique({
      where: {
        fingerprint: parsed.fingerprint
      }
    });
    if (prior) return res.status(409).json({
      error: 'This roster was already imported.',
      cycleId: prior.cycleId
    });
    const number = numberValue(req.body.cycleNumber, 'Cycle number', {
      positive: true
    });
    if (!Number.isInteger(number) || number > 2147483647) throw importError('Cycle number must be a positive whole number up to 2,147,483,647.');
    if (await prisma.cycle.findUnique({
      where: {
        parentCourseId_cycleNumber: {
          parentCourseId: parent.id,
          cycleNumber: number
        }
      }
    })) throw importError('That cycle number is already used under this course, including archived cycles.', 409);
    const branch = req.body.branch;
    if (!['MIAMI', 'FOUAD', 'ABU-QEER', 'PORT-SAID', 'ASWAN', 'SMART', 'SHERATON', 'ALAMEEN'].includes(branch)) throw importError('Choose a valid branch.');
    const fee = Number(moneyMinor(req.body.courseFee, 'Standard tuition fee')) / 100;
    const hours = req.body.totalHours === '' || req.body.totalHours == null ? null : numberValue(req.body.totalHours, 'Total hours', {
      positive: true
    });
    const startDate = req.body.startDate || parsed.startDate,
      endDate = req.body.endDate || parsed.endDate;
    for (const value of [startDate, endDate]) if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw importError('Choose valid cycle dates.');
    if (endDate < startDate) throw importError('End date cannot precede start date.');
    const rows = await inspect(parsed, req.user);
    if (rows.some(r => r.issues.length)) return res.status(409).json({
      error: 'Student conflicts must be resolved before importing. Refresh the preview.',
      rows
    });
    for (const row of rows) {
      const previous = claim.studentVersions[row.registrationNumber];
      if ((previous?.id || null) !== (row.existing?.id || null) || (previous?.updatedAt || null) !== (row.existing?.updatedAt || null)) throw importError('A student record changed after this preview. Upload again to review the latest details.', 409);
    }
    const choices = req.body.choices;
    if (!choices || typeof choices !== 'object' || Array.isArray(choices)) throw importError('Review the student rows before confirming.');
    const paymentDate = req.body.paymentDate || null;
    if (paymentDate && (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !Number.isFinite(Date.parse(paymentDate)) || new Date(paymentDate).toISOString().slice(0, 10) !== paymentDate || paymentDate > new Date().toISOString().slice(0, 10))) throw importError('Actual payment date must be valid and not in the future.');
    if (req.body.details != null && (typeof req.body.details !== 'string' || req.body.details.length > 2000)) throw importError('Description must be text of up to 2,000 characters.');
    const instructorId = req.body.instructorId || null;
    if (instructorId && !(await prisma.instructor.findUnique({
      where: {
        id: instructorId
      }
    }))) throw importError('Selected instructor no longer exists.');
    const rate = instructorId && isManager(req.user) ? numberValue(req.body.hourlyRate, 'Hourly rate') : null;
    // Validate every row before writing; atomic() also rolls back all work on errors.
    for (const row of rows) {
      const c = choices[row.registrationNumber];
      if (!c || !['keep', 'fill', 'replace'].includes(c.profile)) throw importError(`Review student details for registration ${row.registrationNumber}.`);
      if (row.sameName && c.confirmSameName !== true) throw importError(`Review the matching name with another registration number for ${row.registrationNumber}.`);
      if (row.amount > fee) throw importError(`Registration ${row.registrationNumber}: the course fee is ${fee} EGP; you cannot record ${row.amount} EGP paid.`);
      if (row.amount < fee && !['partial', 'discount', 'exempt'].includes(c.feeMode)) throw importError(`Registration ${row.registrationNumber}: choose partial payment or a discounted fee.`);
      if (c.feeMode === 'discount' && !isManager(req.user)) throw importError('Only admins and mods can confirm discounted fees. Ask a manager to import this roster, or record it as partial payment.', 403);
      if (c.feeMode === 'exempt' && row.amount !== 0) throw importError('An exempt student cannot have a positive payment.');
      const custom = c.feeMode === 'exempt' ? 0 : c.feeMode === 'discount' ? Number(moneyMinor(c.customFee, 'Discounted fee')) / 100 : null;
      if (custom !== null && (custom < row.amount || custom > fee)) throw importError(`Registration ${row.registrationNumber}: discounted fee must be between the payment and standard fee.`);
    }
    const isFinished = importedCycleFinished(endDate);
    const cycle = await prisma.cycle.create({
      data: {
        ...cycleSchedule(req.body),
        parentCourseId: parent.id,
        cycleNumber: number,
        name: `${parent.name} ${number}`,
        branch,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isFinished,
        courseFee: fee,
        totalHours: hours,
        details: req.body.details || null
      }
    });
    const batch = await prisma.importBatch.create({
      data: {
        fingerprint: parsed.fingerprint,
        fileName: claim.fileName,
        parentCourseId: parent.id,
        cycleId: cycle.id,
        recordedBy: req.user.username,
        studentCount: rows.length
      }
    });
    let created = 0;
    for (const row of rows) {
      const choice = choices[row.registrationNumber];
      const incoming = {
        name: row.name,
        registrationNumber: row.registrationNumber,
        mobile: row.mobile,
        ...profileFields(row)
      };
      let student;
      if (!row.existing) {
        student = await prisma.student.create({
          data: incoming
        });
        created++;
      } else {
        student = await prisma.student.findUnique({
          where: {
            id: row.existing.id
          }
        });
        const data = {};
        if (choice.profile !== 'keep') for (const key of fields) if (incoming[key] && (choice.profile === 'replace' || !student[key])) data[key] = incoming[key];
        if (Object.keys(data).length) student = await prisma.student.update({
          where: {
            id: student.id
          },
          data
        });
      }
      const customFee = choice.feeMode === 'exempt' ? 0 : choice.feeMode === 'discount' ? Number(moneyMinor(choice.customFee)) / 100 : null;
      const enrollment = await prisma.enrollment.create({
        data: {
          courseId: cycle.id,
          studentId: student.id,
          customFee
        }
      });
      if (row.amount > 0) await appendPayment(enrollment, cycle, student, req.user, {
        amountMinor: moneyMinor(row.amount),
        kind: 'PAYMENT',
        note: 'Opening payment imported from the registration roster. ' + (paymentDate ? 'Actual payment date supplied during import.' : 'Actual payment date not provided by the source.'),
        paymentMethod: row.paymentMethod,
        receiptNumber: row.receiptNumber,
        paymentDateKnown: Boolean(paymentDate),
        occurredAt: paymentDate ? new Date(paymentDate) : new Date(),
        idempotencyKey: `import:${batch.id}:${row.registrationNumber}`,
        importBatchId: batch.id
      });
    }
    if (instructorId) {
      if (isManager(req.user)) await prisma.courseInstructor.create({
        data: {
          courseId: cycle.id,
          instructorId,
          hourlyRate: rate,
          hoursTaught: isFinished && cycle.totalHours > 0 ? cycle.totalHours : null
        }
      });else {
        const pending = await prisma.pendingAssignment.create({
          data: {
            courseId: cycle.id,
            instructorId,
            submittedById: req.user.id,
            type: 'ASSIGN'
          }
        });
        const managers = await prisma.user.findMany({
          where: {
            role: {
              in: ['admin', 'mod']
            },
            isActive: true,
            isBanned: false
          },
          select: {
            id: true
          }
        });
        if (managers.length) await prisma.notification.createMany({
          data: managers.map(m => ({
            userId: m.id,
            title: 'Imported cycle: instructor approval',
            message: 'An instructor assignment requested during Excel import needs approval.',
            type: 'ASSIGNMENT_REQUEST',
            relatedId: pending.id
          }))
        });
      }
    }
    if (isFinished && instructorId && cycle.totalHours > 0) await savePayrollRecord(cycle.id);
    await logAction('IMPORT_CYCLE', `Imported ${cycle.name} from ${claim.fileName}: ${rows.length} enrollments, ${created} new students. Import ${batch.id}. Status: ${isFinished ? "finished automatically from end date" : "active"}.`, req.user.username);
    res.status(201).json({
      cycleId: cycle.id,
      cycleName: cycle.name,
      isFinished,
      importId: batch.id,
      enrolled: rows.length,
      created,
      reused: rows.length - created
    });
  } catch (error) {
    next(error);
  }
}, {
  timeout: 45000
});
