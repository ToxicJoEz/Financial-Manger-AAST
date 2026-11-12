import { AsyncLocalStorage } from 'node:async_hooks';
export const auditContext = new AsyncLocalStorage();
export function auditActor(user, authMethod) {
  const audit = auditContext.getStore();
  if (audit) {
    audit.actor = { id: user.id, username: user.username, role: user.role };
    if (authMethod) audit.authMethod = authMethod;
  }
}
// Keeps the real error behind a failed request (its message, code and where it came from), so the activity log
// shows the exact cause even when the person sees a friendlier message. The first cause recorded wins.
export function recordCause(error) {
  const audit = auditContext.getStore();
  if (!audit || !error || audit.cause) return;
  audit.cause = {
    type: error.name || 'Error',
    message: String(error.message || error).slice(0, 2000),
    ...(error.code ? { code: String(error.code) } : {}),
    ...(error.status ? { status: error.status } : {}),
    ...(error.meta ? { meta: error.meta } : {}),
    // Unexpected errors keep the first lines of their trace (no file contents, no data).
    ...(!error.status && error.stack
      ? {
          trace: String(error.stack)
            .split('\n')
            .slice(1, 7)
            .map(l => l.trim())
        }
      : {})
  };
}
