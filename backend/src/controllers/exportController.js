import prisma from '../db/prisma.js';
import { allowedSheets, buildExport, managerRole } from '../utils/exportData.js';
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const exportOptions = async (req, res, next) => {
  try {
    const courses = await prisma.cycle.findMany({
      where: managerRole(req.user) ? {} : {
        archivedAt: null
      },
      select: {
        id: true,
        parentCourseId: true,
        name: true,
        branch: true,
        archivedAt: true
      },
      orderBy: {
        name: 'asc'
      },
      take: 10001
    });
    if (courses.length > 10000) return res.status(413).json({
      error: 'Too many courses for an interactive export.'
    });
    const snapshots = managerRole(req.user) ? await prisma.payrollEarning.findMany({
      distinct: ['branch'],
      select: {
        branch: true
      }
    }) : [];
    res.set('Cache-Control', 'no-store').json({
      sheets: allowedSheets(req.user),
      courses,
      branches: [...new Set([...courses, ...snapshots].map(row => row.branch))].sort()
    });
  } catch (error) {
    next(error);
  }
};
export const prepareExport = async (req, res, next) => {
  try {
    const {
      sheets,
      filters = {}
    } = req.body || {};
    if (!sheets || typeof sheets !== 'object' || Array.isArray(sheets) || !Object.keys(sheets).length || !filters || typeof filters !== 'object' || Array.isArray(filters)) return res.status(400).json({
      error: 'Select at least one worksheet.'
    });
    const allowed = allowedSheets(req.user);
    for (const [sheet, columns] of Object.entries(sheets)) {
      if (!Object.hasOwn(allowed, sheet)) return res.status(403).json({
        error: 'You cannot export that worksheet.'
      });
      if (!Array.isArray(columns) || !columns.length || new Set(columns).size !== columns.length || columns.some(column => typeof column !== 'string' || !Object.hasOwn(allowed[sheet], column))) return res.status(400).json({
        error: 'Select valid, unique columns for each worksheet.'
      });
    }
    if (Object.keys(filters).some(key => !['branch', 'courseId', 'from', 'to', 'tuitionStatus', 'payrollStatus', 'includeArchived','parentCourseId','payrollDateBasis','salaryMonth'].includes(key)) || ['branch', 'courseId', 'from', 'to', 'tuitionStatus', 'payrollStatus','parentCourseId','payrollDateBasis','salaryMonth'].some(key => filters[key] !== undefined && typeof filters[key] !== 'string') || filters.includeArchived !== undefined && typeof filters.includeArchived !== 'boolean') return res.status(400).json({
      error: 'Invalid export filters.'
    });
    if (filters.salaryMonth !== undefined) {
      if (!managerRole(req.user)) return res.status(403).json({ error: 'Only managers can export salary reports.' });
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.salaryMonth) || Number(filters.salaryMonth.slice(0,4)) < 1900 || Number(filters.salaryMonth.slice(0,4)) > 9998 || Object.keys(sheets).length !== 1 || !sheets.payroll) return res.status(400).json({ error: 'Choose a valid month and the salary worksheet only.' });
      filters.from = filters.salaryMonth + '-01';
      filters.to = new Date(Date.UTC(Number(filters.salaryMonth.slice(0,4)), Number(filters.salaryMonth.slice(5,7)), 0)).toISOString().slice(0,10);
      filters.payrollDateBasis = 'actualPaymentDate';
      filters.payrollStatus = 'PAID';
      filters.includeArchived = true;
    }
    if (filters.includeArchived && !managerRole(req.user)) return res.status(403).json({
      error: 'Only managers can export archived records.'
    });
    if (filters.from && !validDate(filters.from) || filters.to && !validDate(filters.to) || filters.from && filters.to && filters.from > filters.to) return res.status(400).json({
      error: 'Choose a valid date range.'
    });
    if (filters.tuitionStatus && !['PAID', 'PARTIAL', 'UNPAID', 'EXEMPT'].includes(filters.tuitionStatus) || filters.payrollStatus && !['PAID', 'PROCESSING', 'UNPAID'].includes(filters.payrollStatus) || filters.payrollDateBasis && !['recordedAt', 'initiatedDate', 'actualPaymentDate'].includes(filters.payrollDateBasis)) return res.status(400).json({
      error: 'Invalid payment status.'
    });
    const result = await prisma.$transaction(async tx => {
      const where = {
        ...(filters.parentCourseId ? { parentCourseId: filters.parentCourseId } : {}),
        ...(!filters.includeArchived ? {
          archivedAt: null
        } : {}),
        ...(filters.branch ? managerRole(req.user) && Object.hasOwn(sheets, 'payroll') ? {
          OR: [{
            branch: filters.branch
          }, {
            payrollEarnings: {
              some: {
                branch: filters.branch
              }
            }
          }]
        } : {
          branch: filters.branch
        } : {}),
        ...(filters.courseId ? {
          id: filters.courseId
        } : {})
      };
      const count = await tx.cycle.count({
        where
      });
      const enrollmentCount = await tx.enrollment.count({
        where: {
          course: where
        }
      });
      if (count > 10000 || enrollmentCount > 20000) throw Object.assign(new Error('Export is too large. Choose a course or branch to narrow the selection.'), {
        status: 413
      });
      const courses = await tx.cycle.findMany({
        where,
        include: {
          parentCourse: true,
          enrollments: {
            include: {
              student: true,
              bookPayments: { where: { reversedAt: null } },
              payments: { include: { reversal: { select: { id: true } } } }
            },
            orderBy: {
              enrolledAt: 'asc'
            }
          },
          ...(managerRole(req.user) && Object.hasOwn(sheets, 'payroll') ? {
            payrollEarnings: { include: { batch: true } }
          } : {})
        },
        orderBy: [{
          name: 'asc'
        }, {
          id: 'asc'
        }]
      });
      const data = buildExport(courses, req.user, sheets, filters);
      if (data.reduce((sum, sheet) => sum + sheet.rows.length, 0) > 20000) throw Object.assign(new Error('Export exceeds 20,000 rows. Narrow the filters.'), {
        status: 413
      });
      return data.map(sheet => ({
        ...sheet,
        rows: sheet.rows.map(row => Object.fromEntries(sheets[sheet.key].map(column => [column, row[column]])))
      }));
    });
    res.set('Cache-Control', 'no-store').json({
      generatedAt: new Date().toISOString(),
      filters,
      sheets: result
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({
      error: error.message
    });
    next(error);
  }
};
