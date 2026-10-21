# Local PostgreSQL sample data

Existing seven user accounts were preserved unchanged. No new login accounts were added.

| Umbrella | Code | Current book price EGP |
|---|---|---:|
| FCE | 1T1037 | 1800 |
| KET | 1T1036 | 1500 |
| PET | 1T1033 | 1200 |
| Cambridge Private Courses | 1T1047 | 900 |

28 cycles (7 per umbrella), 64 Arabic students, 8 Arabic instructors, 224 enrollments, 168 book status records, 28 salary items, 16 instructor payment records grouped by initiation date.

Each umbrella has cycles across all seven branches:
1. August completed, salary paid in August.
2. September completed, salary paid in October (income belongs to September).
3. October completed, two instructors, unpaid salary.
4. October completed, payment processing initiated October 20.
5. October active until November, no salary generated yet.
6. September completed, salary paid in September.
7. October completed, unpaid salary for أحمد حسن إبراهيم across umbrellas.

Tuition is fully settled: full, 20% discounted, or exempt. Cash/online/card records include رقم الحافظة. Profiles include mobile, birth date, nationality and birthplace. Cycles have rooms, class times, dates and hours.

Every cycle has book purchases at earlier and current prices, plus unpaid and not-required examples. Pending notifications cover instructor add/remove/replace and student addition.

| Start month | Tuition EGP | Books EGP | Total EGP |
|---|---:|---:|---:|
| August 2026 | 62040 | 17600 | 79640 |
| September 2026 | 124080 | 35200 | 159280 |
| October 2026 | 248160 | 70400 | 318560 |

Generator: from backend run `node src/scripts/seedLocalTestData.js --add-local-test-data`. Local-only, atomic, refuses nonempty business data. Never runs at startup or deployment. Automated integration fixtures remain isolated in the separate test database.
