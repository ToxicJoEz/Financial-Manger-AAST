# Management corrections and student identity

## Student identity
- Student.id remains the UUID primary key used by enrollments and all relationships.
- Registration number is optional (database NULL for blank values), unique when supplied, and never fabricated for exempt students.
- Manual creation, editing, enrollment pickers, student details, search and roster import tolerate missing registration numbers.
- Missing-number roster rows use source row keys for preview choices. Reuse requires a unique matching name and mobile/date-of-birth identity; unresolved same-name cases need explicit review.
- Inline create-and-enroll is atomic. Standard staff submit one combined request; approving it creates both records together. Failed enrollment validation rolls the new student back.

## Archive and deletion
- Student and employee archive/restore controls are manager-only. Archived records have separate directory views and stay out of active pickers. Archiving preserves income and payroll.
- Students may be permanently deleted; their enrollments disappear but financial snapshots, original tuition ledger entries and activity history survive.
- Employees with paid or processing payroll cannot be permanently deleted. Unpaid earnings and assignments can be removed explicitly with the employee; archiving preserves them instead.
- Enrollment removal is manager-only and permanent. The user specifies KEEP, REFUND or CORRECTION, confirmation.
- Tuition and book reductions are separately bounded by collected amounts. Partial or full reductions are allowed. Retained amounts are kept in RetainedEnrollmentIncome, attached to the original cycle, and remain in start-month income, yearly income, course totals and course exports without retaining an active enrollment.
- Student-level permanent deletion preserves income by default. Process refunds/corrections on individual enrollments first when required.
- Original PaymentEntry rows detach via SetNull; refund/correction entries and retained book purchase snapshots record the financial effect. Logs cannot be edited or deleted through the app.

## Payroll
- Managers can return selected processing earning items to unpaid across employees/courses. Entire processing day groups and individual employee payments can be selected too.
- Reasons are not required for rollback. Server-side version and status checks prevent stale, duplicate or concurrent rollback. Paid items are never reversed by this action.
- Empty processing batches become CANCELLED historical records. Partial batches retain their remaining items and dates. New payment initiations create new batches.
- Salary totals and batch amounts derive from current earning membership; monthly paid reports remain based only on actual payment dates.
- Batch PDF and Word are available from processing and remain available after payment. Batch reports cover the batch; monthly reports continue to cover confirmed payments in the selected month.
- The undated legacy filter/group is removed. Historical paid earnings remain protected and visible in employee lifetime paid history.
- Employee details expose paid earnings and a lifetime PDF to managers only; unpaid and processing earnings are excluded from that history.

## UI
- Employee selectors are searchable inputs for cycle creation, assignment/replacement and roster import, matching Arabic names or employee IDs.
- Arabic initials use spaces globally for employees and students.
- The optional actual-payment-date roster field is removed.

## Settled enrollment policy
New manual and inline enrollments have only FULL, DISCOUNTED or EXEMPT tuition. Full payment is the default. A discounted payment equals its discounted fee; exempt tuition is zero. No unpaid or partial enrollment can be submitted, including through normal-staff approval requests. Roster imports likewise require a fully settled discounted fee or exemption when paid amounts are below standard tuition. Historical balances are preserved rather than rewritten.

## Later refunds and flexible payroll dates
Managers can open Removed enrollments inside a cycle’s student roster and record a later full/partial tuition or book refund/correction. Only retained balances can be reduced. Reviewed-balance checks and serializable transactions prevent stale or duplicate refunds. Income and course exports immediately reflect the retained remainder, while the original payment ledger and adjustment history survive.
Payroll initiation and actual-payment dates default to today but accept any valid past/future date. Report headings use only تقرير المدفوعات لشهر followed by the month and year; batch spreadsheets have been removed, while monthly Excel remains available.
