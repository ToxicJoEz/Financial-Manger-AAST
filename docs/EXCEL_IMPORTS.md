# Registration roster imports

Open a course umbrella, then choose **Import cycle from Excel**. The workbook is read automatically as soon as it is selected. One `.xlsx` roster creates one cycle. At confirmation, an end date on or before the current Cairo calendar date marks it completed; a future end date leaves it active. Required fields have red stars; missing required details are listed beside the create button. The umbrella is locked to the current page. Choose a unique cycle number, branch and standard fee. Dates are extracted from the registration header and remain reviewable. Teaching hours, description and an instructor are optional.

## Review and matching

Registration number is the identity key. Whitespace-normalized Arabic names must match existing records. A differing name, deleted student, duplicate registration in the workbook or unknown payment method blocks confirmation. Correct these in the student directory/source, then upload again. Matching names with different registration numbers require an explicit acknowledgement. Existing profile data may be kept, filled only where empty, or explicitly updated from provided values. A student changed after preview requires a new preview.

Payments below the standard fee require an explicit choice: partial payment, a manager-confirmed discounted fee, or exemption when the payment is zero. Managers can use **Discount all lower payments** to set every below-standard applicable fee to the amount already paid (including zero), leaving no remaining balance. Individual choices remain editable. Imported payments cannot exceed the applicable fee. `م` means ONLINE, `غ` means CASH. The amount column is actual money received. رقم الحافظة is stored as a reference on the payment, never used as the student identity or presumed globally unique.

Payment dates are absent from the source. Leave the optional date empty unless known; the opening entry then displays its import date and explicitly marks its actual payment date as unknown. A supplied payment date applies to all entries in that file. Differing actual payment dates should be left unknown rather than guessed.

All authenticated staff can import; existing restrictions on discounts and instructor compensation still apply. Junior instructor selections create approval requests. Date-based completion never marks instructor payroll paid or invents taught hours/payroll allocations. Those remain subject to the existing instructor-payroll validation. Reopening remains available for teaching-team corrections.

## Integrity and limits

Preview is read-only, signed for the current user/course and expires after 30 minutes. Confirmation rechecks identities and cycle numbers in one transaction. Any failure rolls back the entire import. A successful roster fingerprint prevents repeat imports even after rows are reordered or the print date changes. Workbooks are not stored; ImportBatch and audit logs retain successful-import provenance. This workflow creates cycles; it does not synchronize later revisions into an existing cycle.

Only a single worksheet, up to 1,000 students, 2 MB compressed and 20 MB inflated is accepted. Values-only roster data in EGP is required. ZIP entry counts, declared and actual expanded sizes are checked before workbook parsing. No macros or formulas are executed. Imported personal data stays in the configured database; sample user files are not committed or copied into the project.

## Existing databases

Stop local services, take an external backup and run the additive upgrade once:

```powershell
python scripts/upgrade-excel-import.py --database backend/prisma/dev.db --backup-directory C:/path/outside/project/backups
node backend/node_modules/prisma/build/index.js generate --schema backend/prisma/schema.prisma
```

The upgrade creates another backup itself and verifies all original user, student, payment, enrollment and course/cycle fields are unchanged. It is safe to rerun. Restart services afterwards. The bundled synthetic demo fixture is upgraded with the feature; private local operational data and uploaded workbooks are never bundled for deployment.
