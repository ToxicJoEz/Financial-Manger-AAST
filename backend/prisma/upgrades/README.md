# Student soft deletion and tuition payment history

This additive upgrade preserves existing students, enrollments, and collected totals.

1. Back up the SQLite database while coordinating with any writers.
2. Run `npx prisma generate` from `backend` after updating the source.
3. Run `node src/scripts/upgradeTuitionLedger.js` from `backend`, using the intended `DATABASE_URL`.
4. Run `node src/scripts/upgradeEnrollmentPolicies.js` from `backend` for enrollment archival and durable payroll snapshots.
5. Restart the backend so it loads the new Prisma client and controllers.

The upgrade is transactional and records its version in `ApplicationUpgrade`. Repeating it is safe. It rejects existing negative balances, fractional piasters, or balances beyond the supported safe range rather than silently rounding them.

Existing enrollment totals become `LEGACY_BALANCE` entries, explicitly marked as imported totals. Their original receipt dates and individual payments cannot be reconstructed. New enrollments default to unpaid. An explicitly received initial payment creates a `PAYMENT` entry; exemption waives the fee without recording cash. New cumulative payments cannot exceed the student's effective fee. Legacy overpayments remain visible and can be corrected without erasing history.

Payment history is append-only through the API. Payments, refunds, corrections, and reversal entries retain the actor and timestamps. Amounts are signed integer piasters; `Enrollment.amountPaid` is a compatibility cache updated inside the same transaction. Existing enrollment-edit callers must use the payment-entry endpoints instead of overwriting that cache. Request keys prevent duplicate entries on retry. History uses cursor pagination and indexed enrollment/date lookups.

Soft deletion sets `Student.deletedAt` and `deletedBy`. Admins/mods retain directory and course access to these records. Juniors cannot see the deleted student's records or payment history. Student and enrollment removal require explicit confirmation and a choice to retain financial records in current totals or archive them from those totals. Neither choice refunds money or deletes ledger entries. Archived financial records remain readable to managers and cannot receive new entries.

Course deletion archives the course and preserves its relationships. Managers can restore it. Completion stores an independent `PayrollRecord`, including instructor allocations and rates. Reopening retains payment status, payroll month, teaching hours, tuition, and report visibility. Changing an already-paid payroll allocation or month requires explicitly marking it unpaid first; audit history preserves the previous values. The second upgrade backfills existing completed/paid payroll snapshots transactionally and is safe to repeat.

Mutation controllers use `atomic()` from `src/db/prisma.js`. The request context binds all database calls, notifications, semantic audit events, and sanitized before/after audit records to one transaction. Responses are sent after commit; an audit failure rolls back the business change. Nested callback transactions reuse the request transaction.

## Permanent administrator

`MAIN_ADMIN_PASSWORD_HASH` in the private backend `.env` holds a bcrypt bootstrap hash, including its salt. No default plaintext password is embedded in the setup source. The bootstrap hash is used only when `main-admin` does not exist or has no password. Ordinary startup preserves existing passwords, and initialization errors stop startup rather than silently leaving the root account unavailable. The old seeder now initializes the same root account instead of creating another default administrator.

To explicitly recover the local root password, run the following in PowerShell from `backend`. The password prompt is masked; the password is passed through standard input rather than a command argument or a saved file. Only the bcrypt hash is saved to the database. This does not change SSO accounts or signing keys.

```powershell
$adminRecoverySecret = Read-Host 'New root administrator password' -AsSecureString
try {
    $adminRecoveryCredential = [System.Management.Automation.PSCredential]::new('main-admin', $adminRecoverySecret)
    $adminRecoveryCredential.GetNetworkCredential().Password | node src/scripts/resetAdminPassword.js
} finally {
    $adminRecoverySecret.Dispose()
    Remove-Variable adminRecoveryCredential, adminRecoverySecret -ErrorAction SilentlyContinue
}
```

Recovery updates the account's current password. The private bootstrap hash remains the initial-account fallback and never resets an existing account on restart.
