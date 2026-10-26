# Private courses

- New umbrellas default to Group. Admins/moderators can choose Private; the type is fixed after the first cycle exists (including archived cycles).
- Group naming, shared numbering across branches and umbrella book prices are unchanged.
- Private cycles have a required custom name (up to 200 characters) and their own nonnegative book price. The umbrella retains its shared course code. Internal sequence numbers identify cycles but are hidden in private forms.
- A private cycle can be created empty and supports multiple employees. It accepts at most one enrolled student. Enrollment and approval use Serializable transactions, including inline student creation, to reject conflicting concurrent requests without partial changes.
- Private Excel imports require exactly one student. Preview explains this limit and commit validates it again.
- Book payments capture the current private cycle price when marked paid. Later price changes affect new purchases only; existing payment history is preserved.
- Private labels appear in course cards/details, student and employee histories, income, payroll, requests and course-bearing exports. All financial totals remain combined.
- Existing umbrellas remain Group; names containing “Private” do not automatically convert existing data.

## Validation
One isolated private workflow covers custom names, umbrella edits, one-seat approval/concurrency, inline-create rollback, book price history, multi-employee payroll, income/export metadata, and one-row versus multi-row imports. Existing group-cycle/import regression workflows and a browser check cover the UI and unchanged group behavior.
