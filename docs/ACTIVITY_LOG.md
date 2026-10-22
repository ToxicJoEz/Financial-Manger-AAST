# Activity log

## Access and immutable history
- Standard users have no log access. Moderators can read only events whose role snapshot was `user`, excluding their own earlier activity. Admins can read all entries, including legacy records and unknown-account attempts.
- List, detail, search/filter options, and expanded records apply the same server-side scope. Actor ID, username, role, method and affected records are snapshots; no foreign key links audit retention to an account or course.
- Existing history remains intact. Historical roles cannot be reconstructed reliably, so legacy entries with no role snapshot are admin-only.
- PostgreSQL triggers reject UPDATE, DELETE and TRUNCATE on SystemLog. The application exposes no edit/delete API. A database owner can still administer the database outside the website; this is not an external tamper-proof storage system.

## Recorded actions
API mutations record one main event with nested model changes and action notes. Includes account/profile/password changes, password/SSO login, explicit sign-out, student/enrollment/employee/course/cycle changes, approvals, archives/restoration/permanent deletion, tuition/books, salary processing/payment confirmation, notification changes, imports and export preparation. Successful reads/page navigation/polling are omitted. Failed API requests (including access/validation failures and rolled-back writes) are recorded outside the failed transaction. Unknown sign-in identities are never assigned a trusted role; a supplied known username on a failed login is marked identityVerified=false.

Imports retain file names and selected input rows plus record changes. Reports generated in the browser record start/result events; file validation failures and authenticated form validation failures are client-reported entries, distinct from authoritative database mutations. No password hashes, passwords, authentication/preview tokens, cookies or database URLs are stored. Profile image data is represented as metadata rather than embedding image bytes.

## Durability and limits
Successful transactional mutations and their audit record commit together. If logging fails, that mutation rolls back. Failure and non-mutating report events are awaited before responding, avoiding serverless after-response work. If PostgreSQL itself is unavailable, an audit database write cannot succeed: the API returns 503 and emits an AUDIT_WRITE_FAILED infrastructure log with request reference, method and status. Network failures while offline, browser termination and crashes before a request reaches the backend cannot be guaranteed as database audit entries. Closing a tab/session expiry is not treated as explicit logout. Events reported by a browser describe what the client reported; they do not prove a physical download completed.

## Interface
Settings → Activity log, with search/user/action/category/outcome/date filters, 25-entry pagination, Cairo dates, explicit success/failure labels, readable summaries and expandable details. Before/after changes are paginated 20 at a time; large nested inputs expand progressively. Filters reset when leaving the page.

## Deployment and verification
Apply the append-only audit Prisma migration and regenerate the client before starting the updated API. Vercel's existing backend build applies migrations automatically once these changes are explicitly pushed. Local migration preserves existing accounts and business data. The cloud database is not changed until deployment.

The isolated audit workflow checks rollback retention, account deletion, immutable rows, role changes, direct-detail/filter access, credentials redaction, SSO/password login, logout and report failures. Browser checks cover sidebar navigation, filters, expanded differences, role visibility and mobile layout.
