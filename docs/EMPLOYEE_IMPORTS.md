# Employee directory and Excel import

Open Employees, then Import Excel. Manual additions remain available. Select one or more branches for the file and choose an .xlsx workbook. Reading starts immediately once both are present. SMART is selected explicitly for Smart Village lists; no branch is inferred from a filename. ALAMEEN is available alongside the existing branches.

The importer detects Arabic name / employee ID headers (including الاسم and ألرقم الوظيفي) or English equivalents, even when the table begins away from A1. It ignores row numbering and blank rows. IDs are text, preserving leading zeros and normalizing Arabic/Persian digits; names have whitespace cleaned. Formula cells, oversized/ambiguous workbooks and missing values are rejected or flagged. Limit: 2 MB compressed, 20 MB expanded, 2,000 employees per file.

Matching uses employee ID. Same ID + same cleaned name adds only missing selected branches to the existing record, preserving mobile/contact details, assignments and payroll. An employee who already belongs to all selected branches is a duplicate error. Same ID/different name is an identity conflict. Repeated IDs in the source file must be corrected. Different IDs can have matching names.

Preview displays clickable All rows, New, Branch additions and Errors filters. Search combines with the active filter; hidden valid selections remain selected. Valid rows are selected by default; users may deselect rows or import the valid subset. Error rows cannot be selected. Source row numbers, existing branches, per-row messages, search and pagination help review large lists.

Only admins/moderators can import or modify employees. A signed 20-minute preview is tied to the reviewing account and selected branches. Commit rechecks identity and record versions, then applies all selected changes and audit records in one serializable transaction. Stale previews, duplicate commits and concurrent conflicts roll back without partial imports. Source files are not stored.

The PostgreSQL employee-ID uniqueness migration also protects manual creation/editing. Blank IDs on manually added employees remain null and can be assigned later. The existing Instructor model/relation names and /api/instructors URLs remain compatibility details; /api/employees exposes the same directory. The old /instructors page redirects to /employees. Employee-facing labels now use Employees throughout the UI.

No new job-role categories or automatic course assignments/payments are introduced by this feature. Workbook verification and full import/merge tests use isolated schemas; the supplied staff file was not imported into the working database automatically.


## Employee browsing
The directory uses /api/employees/directory with server-side name/ID/mobile search, any-of branch filters, teaching-status filters, deterministic sorting and 24-row pagination. Ongoing counts exclude archived cycles and archived umbrellas; completed counts retain completed history. Only the card/list preference is remembered; filters reset after leaving the page. Legacy employee/assignment picker endpoints retain their response shape.

Employee profiles load /api/employees/:id/details on demand, with explicit non-financial fields, grouped course assignments, ongoing/completed filters, branch selection and cycle search. Opening an existing read-only cycle detail view and going back preserves the employee profile filters and scroll position. Directory/profile endpoints require admin/mod access. Financial actions and reports remain in Finance.
