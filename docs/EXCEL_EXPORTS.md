# Customizable Excel exports

The Courses page offers Export Excel to every authenticated staff member. Payroll also offers it to managers, prefilled to the selected payroll month. Existing PDF export is unchanged.

Choose columns in Courses, Student Tuition, and (admins/mods only) Instructor Payroll. Clearing every column removes a worksheet. Filters include branch, course, inclusive dates, tuition status, payroll status, and manager-only inclusion of archives. Empty results show a message instead of downloading an empty report.

## Dates and totals

- Courses use start date, falling back to creation date when no start date is set; tuition uses enrollment date. The displayed start date remains blank when unset. Records with neither applicable date are excluded when a date range is supplied.
- Payroll uses inclusive payroll months, from saved completed-payroll snapshots; reopened courses remain represented. Snapshot branch, instructor name, rate, and hours are preserved.
- Tuition status filters enrollment rows. On the Courses sheet, a course must have at least one matching visible enrollment, but its displayed totals still represent the entire course.
- Removed students/enrollments with retained finances remain in course totals. Juniors cannot export their individual identities. Managers can see these labelled rows.
- Archived finances never count in course totals. Managers can explicitly include their labelled history rows. Do not sum those rows as current revenue.
- Payroll earned values and the existing course-level paid flag are exported. Interim payments are outside this feature.
- Export Notes records generation time, filters, row counts, and these accounting rules.

## Security and performance

GET /api/exports/options supplies role-specific columns and course choices. POST /api/exports validates worksheet/column allowlists and filters, and returns only selected fields. Tampering cannot expose instructor payroll to juniors. No raw Prisma entities are returned. Responses disable caching.

The database reads use one transaction. Exports are bounded to 10,000 courses / 20,000 enrollments and 20,000 output rows, with an instruction to narrow selection. Larger datasets would need a streamed or background export job. ExcelJS is already installed in this project and is dynamically imported only when generating a workbook; normal navigation does not download its large chunk. User-provided text is written as literal strings rather than Excel formulas or hyperlinks. Money remains numeric cells; headers are frozen and filterable.

No database migrations, new packages, environment changes, or SSO changes are required.

## Tests

From backend: `node --test test/exportData.test.js`.

The tests cover junior privacy, selected-field projection, deleted/archived record accounting, snapshot payroll, date boundaries, status filters, and archive opt-in. The proposal was also exercised through authenticated API requests and a desktop/mobile browser with an isolated copied database. The generated workbook was read back with ExcelJS to verify sheet contents, numeric values, Arabic text, and formula-like string safety.
