# Private courses

- New umbrellas default to Group. Admins/moderators can choose Private; the type is fixed after the first cycle exists (including archived cycles).
- Group naming, shared numbering across branches and umbrella book prices are unchanged.
- Private cycles have a required custom name (up to 200 characters) and their own nonnegative book price. The umbrella retains its shared course code. Internal sequence numbers identify cycles but are hidden in private forms.
- A private cycle can be created empty and supports multiple employees. It accepts at most one enrolled student. Enrollment and approval use Serializable transactions, including inline student creation, to reject conflicting concurrent requests without partial changes.
- Private workbook imports read all employee sheets and create one cycle per named student row. Merged values are copied in full to each row. Rates, Payment and Books columns are ignored. Duration supports H:MM and ignores rates. Dates are day-first; unambiguous duplicated-year digits (20226 → 2026) are corrected visibly. Other invalid dates require review. Each sheet must map to an existing employee or an explicitly named new one, with a separate manual hourly rate on each cycle assignment. No rate is stored on the employee profile or applied automatically across the sheet. Phone numbers determine student identity; ambiguous/archived matches require review. Signed, expiring previews and per-source-row replay guards protect atomic imports.
- Book payments capture the current private cycle price when marked paid. Later price changes affect new purchases only; existing payment history is preserved.
- Private labels appear in course cards/details, student and employee histories, income, payroll, requests and course-bearing exports. All financial totals remain combined.
- Existing umbrellas remain Group; names containing “Private” do not automatically convert existing data.

## Validation
One isolated private workflow covers custom names, umbrella edits, one-seat approval/concurrency, inline-create rollback, book price history, multi-employee payroll, income/export metadata, and one-row versus multi-row imports. Existing group-cycle/import regression workflows and a browser check cover the UI and unchanged group behavior.

Visible dates and date-entry fields use DD/MM/YY. Calendar values and API/storage dates remain ISO. Inputs also accept four-digit years for clarity.
