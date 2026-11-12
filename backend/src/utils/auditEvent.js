import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { auditSnapshot } from './mutationContext.js';
const secret = /password|token|secret|authorization|cookie|previewToken|confirmationName/i;
export function safeAudit(value, depth = 0) {
  if (depth > 14) return '[Nested data omitted]';
  if (value == null) return value;
  if (Buffer.isBuffer(value)) return { fileBytes: value.length };
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    let text = value;
    for (const [key, v] of Object.entries(process.env))
      if (/SECRET|PASSWORD|TOKEN|DATABASE_URL|DIRECT_URL|PGHOST|PGUSER/i.test(key) && v && v.length >= 5)
        text = text.split(v).join('[REDACTED]');
    return text
      .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[REDACTED_DATABASE_URL]')
      .replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTED_HASH]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]')
      .replace(
        /((?:current|new)?password|passwordHash|authorization|access[_-]?token|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
        '$1: [REDACTED]'
      )
      .slice(0, 12000);
  }
  if (Array.isArray(value)) return value.map(v => safeAudit(v, depth + 1));
  if (typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !secret.test(key))
        .map(([key, v]) => [
          key,
          key === 'avatar' && v
            ? {
                type: 'Profile image',
                characters: String(v).length,
                fingerprint: createHash('sha256').update(String(v)).digest('hex').slice(0, 16)
              }
            : safeAudit(v, depth + 1)
        ])
    );
  return value;
}
// [method, path after /api/, action, how it reads in the log]. ':id' stands for any id.
const ROUTE_ACTIONS = [
  ['POST', 'auth/login', 'LOGIN_LOCAL', 'Password sign-in'],
  ['POST', 'auth/sso', 'LOGIN_SSO', 'AAST SSO sign-in'],
  ['POST', 'auth/logout', 'LOGOUT', 'Signed out'],
  ['POST', 'auth/register', 'CREATE_ACCOUNT', 'Create account'],
  ['PUT', 'users/profile', 'UPDATE_PROFILE', 'Update own profile'],
  ['PUT', 'users/:id/status', 'CHANGE_ACCOUNT_STATUS', 'Ban or unban account'],
  ['PUT', 'users/:id/role', 'CHANGE_ROLE', 'Change account role'],
  ['PUT', 'users/:id/permissions', 'CHANGE_PERMISSIONS', 'Change account permissions'],
  ['PUT', 'users/:id/branch-scope', 'CHANGE_MOD_BRANCH', 'Change branch mod’s branch'],
  ['PUT', 'users/:id/branches', 'CHANGE_USER_BRANCHES', 'Change user’s branches'],
  ['POST', 'users/:id/unlock', 'UNLOCK_ACCOUNT', 'Unlock account'],
  ['POST', 'courses/?', 'CREATE_UMBRELLA', 'Create umbrella'],
  ['PUT', 'courses/:id/branches', 'CHANGE_UMBRELLA_BRANCHES', 'Change umbrella branches'],
  ['PUT', 'courses/:id', 'UPDATE_UMBRELLA', 'Update umbrella'],
  ['DELETE', 'courses/:id/permanent', 'PERMANENT_DELETE_UMBRELLA', 'Permanently delete umbrella'],
  ['DELETE', 'courses/:id', 'ARCHIVE_UMBRELLA', 'Archive umbrella'],
  ['POST', 'courses/:id/restore', 'RESTORE_UMBRELLA', 'Restore umbrella'],
  ['POST', 'cycles/?', 'CREATE_CYCLE', 'Create cycle'],
  ['POST', 'cycles/bulk-archive', 'BULK_ARCHIVE_CYCLES', 'Archive several cycles'],
  ['POST', 'cycles/bulk-delete', 'BULK_DELETE_CYCLES', 'Permanently delete several cycles'],
  ['PUT', 'cycles/:id', 'UPDATE_CYCLE', 'Update cycle'],
  ['DELETE', 'cycles/:id', 'ARCHIVE_CYCLE', 'Archive cycle'],
  ['DELETE', 'cycles/:id/permanent', 'PERMANENT_DELETE_CYCLE', 'Permanently delete cycle'],
  ['POST', 'cycles/:id/restore', 'RESTORE_CYCLE', 'Restore cycle'],
  ['POST', 'cycles/:id/finish', 'COMPLETE_CYCLE', 'Complete cycle'],
  ['POST', 'cycles/:id/revert', 'REOPEN_CYCLE', 'Reopen cycle'],
  ['POST', 'cycles/:id/instructors', 'ASSIGN_EMPLOYEE', 'Assign employee to cycle'],
  ['DELETE', 'cycles/:id/instructors/:id', 'REMOVE_EMPLOYEE', 'Remove employee from cycle'],
  ['POST', 'cycles/:id/instructors/:id/replace', 'REPLACE_EMPLOYEE', 'Replace employee in cycle'],
  ['POST', 'cycles/:id/instructors/:id/close', 'CLOSE_HOURS', 'Close employee hours early'],
  ['POST', 'cycles/:id/instructors/:id/reopen', 'REOPEN_HOURS', 'Reopen closed employee hours'],
  ['POST', 'cycles/:id/enrollments', 'ENROLL_STUDENT', 'Enroll student'],
  ['PUT', 'cycles/:id/enrollments/:id', 'CHANGE_TUITION', 'Change student tuition'],
  ['DELETE', 'cycles/:id/enrollments/:id', 'REMOVE_STUDENT', 'Remove student from cycle'],
  ['POST', 'cycles/:id/enrollments/:id/settle', 'SETTLE_TUITION', 'Mark tuition paid'],
  ['POST', 'cycles/:id/enrollments/:id/payments', 'RECORD_PAYMENT', 'Record tuition payment'],
  ['POST', 'cycles/:id/enrollments/:id/payments/:id/reverse', 'REVERSE_PAYMENT', 'Reverse tuition payment'],
  ['POST', 'cycles/:id/enrollments/:id/books', 'CHANGE_BOOKS', 'Change book status'],
  ['POST', 'cycles/:id/removed-enrollments/:id/adjust', 'ADJUST_REMOVED_STUDENT', 'Adjust removed student’s money'],
  ['POST', 'students/?', 'CREATE_STUDENT', 'Create student'],
  ['PUT', 'students/:id', 'UPDATE_STUDENT', 'Update student'],
  ['DELETE', 'students/:id', 'DELETE_STUDENT', 'Delete student'],
  ['POST', 'students/:id/archive', 'ARCHIVE_STUDENT', 'Archive student'],
  ['DELETE', 'students/:id/permanent', 'PERMANENT_DELETE_STUDENT', 'Permanently delete student'],
  ['POST', 'students/bulk-archive', 'BULK_ARCHIVE_STUDENTS', 'Archive several students'],
  ['POST', 'students/bulk-delete', 'BULK_DELETE_STUDENTS', 'Permanently delete several students'],
  ['POST', '(employees|instructors)/?', 'CREATE_EMPLOYEE', 'Create employee'],
  ['PUT', '(employees|instructors)/:id', 'UPDATE_EMPLOYEE', 'Update employee'],
  ['DELETE', '(employees|instructors)/:id', 'DELETE_EMPLOYEE', 'Delete employee'],
  ['POST', '(employees|instructors)/:id/archive', 'ARCHIVE_EMPLOYEE', 'Archive employee'],
  ['POST', '(employees|instructors)/bulk-archive', 'BULK_ARCHIVE_EMPLOYEES', 'Archive several employees'],
  ['POST', '(employees|instructors)/bulk-delete', 'BULK_DELETE_EMPLOYEES', 'Permanently delete several employees'],
  ['POST', '(employees|instructors)/import/preview', 'PREVIEW_IMPORT', 'Read employee workbook'],
  ['POST', '(employees|instructors)/import/commit', 'IMPORT_EMPLOYEES', 'Import employees'],
  ['POST', 'imports/private/(preview|review)', 'PREVIEW_IMPORT', 'Read private courses workbook'],
  ['POST', 'imports/private/commit', 'IMPORT_PRIVATE_COURSES', 'Import private courses'],
  ['POST', 'imports/:id/preview', 'PREVIEW_IMPORT', 'Read cycle workbook'],
  ['POST', 'imports/:id/commit', 'IMPORT_CYCLE', 'Import cycle from Excel'],
  ['POST', 'assignments/:id/approve', 'APPROVE_REQUEST', 'Approve request'],
  ['POST', 'assignments/:id/reject', 'REJECT_REQUEST', 'Reject request'],
  ['DELETE', 'assignments/:id', 'WITHDRAW_REQUEST', 'Withdraw request'],
  ['POST', 'finances/checks', 'MARK_MONEY_CHECKED', 'Mark money as checked'],
  ['POST', 'finances/checks/uncheck', 'UNMARK_MONEY_CHECKED', 'Undo money check'],
  ['POST', 'finances/batches', 'START_PAYMENT_BATCH', 'Start employee payment batch'],
  ['POST', 'finances/selected-payments', 'START_PAYMENT_BATCH', 'Start employee payment batch'],
  ['POST', 'finances/course-payments', 'START_PAYMENT_BATCH', 'Start cycle payment batch'],
  ['POST', 'finances/course-payments/pay', 'MARK_PAYMENTS_PAID', 'Mark cycle payments paid'],
  ['POST', 'finances/batches/:id/pay', 'MARK_PAYMENTS_PAID', 'Mark employee payment paid'],
  ['POST', 'finances/runs/:id/pay', 'MARK_PAYMENTS_PAID', 'Mark payment batch paid'],
  ['POST', 'finances/return-to-unpaid', 'RETURN_TO_UNPAID', 'Return payments to unpaid'],
  ['POST', 'finances/return-to-processing', 'RETURN_TO_PROCESSING', 'Return payments to processing'],
  ['POST', 'exports/?', 'PREPARE_EXCEL_EXPORT', 'Prepare Excel report'],
  ['POST', 'exports/events', 'EXPORT_REPORT', 'Generate report'],
  ['PUT', 'notifications/read-all', 'READ_ALL_NOTIFICATIONS', 'Mark all notifications read'],
  ['PUT', 'notifications/:id/read', 'READ_NOTIFICATION', 'Mark notification read'],
  ['POST', 'branches/colors', 'CHANGE_BRANCH_COLOR', 'Change branch colour'],
  ['POST', 'activity-events', 'BROWSER_REPORT', 'Browser-reported problem']
];
export const summarizeAction = req => {
  const path = req.originalUrl.split('?')[0].replace(/^\/api\/?/, '');
  const category = path.startsWith('auth')
    ? 'authentication'
    : path.startsWith('users')
      ? 'accounts'
      : path.includes('import')
        ? 'imports'
        : path.startsWith('exports')
          ? 'exports'
          : path.startsWith('finances')
            ? 'payroll'
            : path.startsWith('student-requests') || path.startsWith('assignments')
              ? 'approvals'
              : path.startsWith('students')
                ? 'students'
                : /^(employees|instructors)/.test(path)
                  ? 'employees'
                  : path.startsWith('courses')
                    ? 'courses'
                    : path.startsWith('cycles')
                      ? 'cycles'
                      : path.startsWith('notifications')
                        ? 'notifications'
                        : path.startsWith('branches')
                          ? 'settings'
                          : 'system';
  // Each kind of request gets its own action name, so the log says exactly what was done (also when it failed).
  const id = '[^/]+';
  const rule = ROUTE_ACTIONS.find(
    ([method, pattern]) => method === req.method && new RegExp('^' + pattern.replaceAll(':id', id) + '$').test(path)
  );
  const [action, phrase] = rule
    ? [rule[2], rule[3]]
    : req.method === 'GET'
      ? [
          'READ',
          'Open ' +
            ({
              courses: 'course',
              cycles: 'cycle',
              students: 'student',
              employees: 'employee',
              accounts: 'account',
              approvals: 'request',
              payroll: 'payroll',
              notifications: 'notifications',
              system: 'page'
            }[category] || 'page')
        ]
      : [
          { POST: 'CREATE', PUT: 'UPDATE', PATCH: 'UPDATE', DELETE: 'DELETE' }[req.method] || req.method,
          'Change ' + category
        ];
  const target = typeof req.body?.name === 'string' ? ' ' + req.body.name.slice(0, 120) : '';
  const description = phrase + (/^(Create|Update|Archive|Restore|Delete|Permanently)/.test(phrase) ? target : '');
  return { category, action, description, named: Boolean(rule) };
};
// What kind of failure this was, so the activity log can tell rule-based refusals from real errors.
const UNEXPECTED =
  /Cannot read prop|is not a function|is not defined|is not iterable|Invalid `|prisma\.|Unexpected token|Maximum call stack|ECONN|ETIMEDOUT|timed out|Transaction already closed/i;
export function failureKind({ status, message, cause, previewErrors, client }) {
  if (client) return 'BROWSER';
  if (previewErrors) return 'INVALID_FILE_DATA';
  if (status >= 500 || UNEXPECTED.test(message || '') || UNEXPECTED.test(cause?.message || '')) return 'UNEXPECTED';
  if (cause?.code && /^P20/.test(cause.code)) return 'CONFLICT';
  return (
    {
      400: 'INVALID_INPUT',
      401: 'NOT_SIGNED_IN',
      403: 'NOT_ALLOWED',
      404: 'NOT_FOUND',
      409: 'BLOCKED_BY_RULE',
      413: 'TOO_LARGE',
      422: 'INVALID_INPUT',
      429: 'TOO_MANY_ATTEMPTS'
    }[status] || 'REJECTED'
  );
}
// One name per kind of action, whether it worked or failed. A request sent for approval keeps "_REQUESTED".
// Browser reports and report exports keep the specific name the app gave them.
const NOTE_NAMED = new Set(['BROWSER_REPORT', 'EXPORT_REPORT']);
function logActionName(route, primary) {
  if (!route.named || NOTE_NAMED.has(route.action)) return primary?.action || route.action;
  return /_PENDING$/.test(primary?.action || '') ? route.action + '_REQUESTED' : route.action;
}
export async function auditData(client, audit, req, status, body) {
  const route = summarizeAction(req);
  let actor = audit.actor;
  if (!actor && !/\/auth\/(login|sso)$/.test(req.originalUrl.split('?')[0])) {
    try {
      const header = req.headers.authorization;
      if (typeof header === 'string' && header.startsWith('Bearer ')) {
        const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
        actor = await client.user.findUnique({
          where: { id: decoded.id },
          select: { id: true, username: true, role: true }
        });
        if (actor) {
          audit.verified = true;
          audit.authMethod = decoded.authMethod || audit.authMethod;
        }
      }
    } catch {}
  }
  if (!actor && /\/auth\/(login|sso)$/.test(req.originalUrl.split('?')[0])) {
    const username = audit.notes.find(n => /^LOGIN_/.test(n.action))?.actorUsername || req.body?.username;
    if (typeof username === 'string')
      actor = await client.user.findUnique({ where: { username }, select: { id: true, username: true, role: true } });
  }
  const previewErrors = Array.isArray(body?.rows)
    ? body.rows.filter(row => row.action === 'ERROR' || row.issues?.length || row.errors?.length)
    : [];
  const failed = status >= 400 || previewErrors.length > 0 || audit.clientResult === 'FAILURE';
  const notes = audit.notes,
    primary = notes.at(-1);
  const submitted = Buffer.isBuffer(req.body) ? { fileBytes: req.body.length } : safeAudit(req.body || {});
  const fileName = req.auditFileName || audit.fileName;
  const result = {};
  for (const key of [
    'message',
    'created',
    'updated',
    'enrolled',
    'reused',
    'cycleName',
    'cycleId',
    'importId',
    'membershipsAdded'
  ])
    if (body?.[key] !== undefined) result[key] = body[key];
  if (previewErrors.length)
    result.validationErrors = previewErrors.map(r => ({
      row: r.rowNumber,
      name: r.name,
      employeeId: r.employeeId,
      issues: r.issues || r.errors
    }));
  // The exact reason for a failure: the message given back, a browser-reported problem, or the file's row errors.
  const shown = typeof (body?.error || body?.message) === 'string' ? body.error || body.message : '';
  const clientNote = audit.clientResult === 'FAILURE' ? notes.at(-1)?.description : '';
  const errorMessage = !failed
    ? null
    : (status >= 400 && shown) ||
      clientNote ||
      (previewErrors.length
        ? `${previewErrors.length} row(s) in the file have problems: ` +
          previewErrors
            .slice(0, 5)
            .map(r => `row ${r.rowNumber ?? '?'}: ${[].concat(r.issues || r.errors || []).join('; ')}`)
            .join(' | ')
        : '') ||
      audit.cause?.message ||
      'The action failed.';
  const errorKind = failed
    ? failureKind({
        status,
        message: errorMessage,
        cause: audit.cause,
        previewErrors: status < 400 && previewErrors.length > 0,
        client: Boolean(clientNote)
      })
    : null;
  const details = safeAudit({
    identityVerified: Boolean(req.user || audit.verified || audit.notes.some(n => /^LOGIN_/.test(n.action))),
    importedRows: audit.records,
    submitted,
    query: req.query,
    fileName,
    notes,
    changes: audit.changes,
    committed: !failed,
    result,
    error: failed
      ? {
          status,
          kind: errorKind,
          message: errorMessage,
          // The underlying error when it differs from what the person was shown.
          ...(audit.cause && audit.cause.message !== errorMessage ? { cause: audit.cause } : {}),
          ...(audit.cause?.code ? { code: audit.cause.code } : {})
        }
      : undefined,
    method: req.method,
    path: req.originalUrl.split('?')[0]
  });
  let description = primary?.description || route.description;
  if (fileName && !description.includes(fileName)) description += ' · ' + fileName;
  if (failed) description = 'Failed: ' + description;
  // Always say why it failed, even when the action had already described itself.
  if (failed && errorMessage && !description.includes(errorMessage.slice(0, 60)))
    description += ' · ' + errorMessage.slice(0, 300);
  return {
    requestId: audit.id,
    recordCount: audit.changes.reduce(
      (n, c) => n + Math.max(c.before?.length || 0, Array.isArray(c.after) ? c.after.length : 1),
      0
    ),
    actorId: actor?.id || null,
    actorUsername: actor?.username || 'Unknown account',
    actorRole: actor?.role || null,
    authMethod:
      audit.authMethod ||
      (/auth\/sso/.test(req.originalUrl) ? 'SSO' : /auth\/login/.test(req.originalUrl) ? 'PASSWORD' : null),
    action: logActionName(route, primary),
    category: audit.category || route.category,
    outcome: failed ? 'FAILURE' : 'SUCCESS',
    errorKind,
    errorMessage: errorMessage ? safeAudit(errorMessage).slice(0, 4000) : null,
    description: safeAudit(description).slice(0, 1500),
    targetUsername: primary?.targetUsername || null,
    statusCode: status,
    durationMs: Date.now() - audit.started,
    details
  };
}
export function snapshotChange(entity, operation, before, after) {
  return auditSnapshot({ entity, operation, before, after });
}
