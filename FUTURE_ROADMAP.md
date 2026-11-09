# Future roadmap

Headline items to plan and discuss later.

## Security hardening
- Store login lockouts and SSO token replay checks in the database (shared across servers)
- Shorter sessions with server-side sign-out and revocation
- Password policy for local accounts

## Backups and recovery
- Scheduled database backups
- Documented, tested restore procedure

## Branches
- Manage branches as database records instead of hardcoded lists

## Performance
- API-enforced pagination for cycles, students and payroll
- Compute totals in the database instead of in the browser

## Money storage
- Store every amount as whole piasters (integers) instead of decimals

## Testing and quality
- Frontend and end-to-end tests
- Lint checks in CI

## Monitoring
- Production error tracking and alerts

## Scope
- Decide whether expenses / budgeting beyond tuition, books and payroll belong in the app
