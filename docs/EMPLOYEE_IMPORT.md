# Employee workbook import

Managers can upload an `.xlsx` workbook (2 MB maximum). Every worksheet is inspected for name and employee-ID headers in its first 30 rows. Empty or unrecognized worksheets are reported as skipped. The workbook limit is 2,000 source employee rows, 100 columns per sheet and 100 distinct branch labels.

## Branch review

A branch column is optional (`فرع`, `الفرع`, `branch`, `branches`). Explicit Arabic/English aliases produce suggestions; no fuzzy workplace guesses are made. Alexandria suggests MIAMI, FOUAD and ABU-QEER. Extra whitespace and common Arabic alef variations are normalized. Unknown or missing branch values need a manual choice.

The preview groups employees by the original branch label. Every group can be assigned to one or more branches, including recognized groups. A change applies to everyone with that label across the workbook. Empty assignments block those employees; other valid employees can still be selected for import.

## Identity and safety

Matching employee IDs and normalized names merge into one preview employee, combining branches and showing all source sheet/row locations. Disagreeing names for the same ID are errors. Existing employees retain their details and memberships and gain only missing branches. Already-existing memberships are reported as duplicates. No course assignments or payments are created.

Branch edits refresh the server preview using the signed workbook snapshot, without uploading or parsing the file again. Import uses only the signed, reviewed assignments. Stale identities, invalid branches, tampered/expired tokens, unauthorized users and concurrent conflicting changes cannot silently overwrite data. The commit is atomic and is recorded in the activity log with the source filename, selected employees, source rows and added branches.
