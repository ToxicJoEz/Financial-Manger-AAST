# AAST Finance Manager

React/Vite frontend and Express/Prisma backend in one repository. Tuition is available to staff; instructor compensation is restricted to admins/mods. Includes instructor request approvals, student enrollment, append-only tuition history, durable completed-payroll snapshots, outstanding-payment tabs, and configurable Excel exports.

## Vercel: disposable demo

Import this repository with **Root Directory set to the repository root**. `vercel.json` explicitly declares the Vite frontend and Express backend as two services. Each service installs and builds in its own folder; API routing and SPA refresh handling are declared in that configuration. Node.js 22 is required (use a current 22.x release).

Set these private Vercel environment variables for the deployment environments you intend to use:

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | A private random value of at least 32 characters; generate 32 random bytes or more. |
| `MAIN_ADMIN_PASSWORD_HASH` | Bcrypt hash for the separate local recovery admin. Never use a publicly known default. |
| `DEMO_USER_PASSWORD_HASHES` | Private JSON object mapping existing local usernames to their bcrypt hashes; restores their existing passwords in each demo instance. |
| `SSO_JWT_SECRET` | Optional; copy the portal's shared SSO signing key. Must differ from `JWT_SECRET`. Without it, local login works and SSO reports unavailable. |
| `SSO_AUDIENCE` | Optional recipient validation. Enable only after the portal issues tokens with the matching audience. |

`VERCEL_SQLITE_DEMO=1` is explicitly set in `vercel.json`. Do **not** point `DATABASE_URL` to a working database on Vercel. The application selects its temporary database automatically. Redeploy after changing environment variables.

The fixture retains the approved local account identities from `backend/demo/accounts.json`, including `Joe`, `Joe-admin`, and `main-admin`, with their IDs, roles, and account status. Passwords, email addresses, avatars, and login history are excluded from the bundled database.

Set `DEMO_USER_PASSWORD_HASHES` privately in Vercel to restore the existing non-root password hashes. The local export file `backend/.env.vercel-users.local` contains the assignment; paste **only the JSON value after `=`** into the Vercel variable. That file is ignored by Git and Vercel uploads. Accounts that previously used only SSO remain SSO-only unless explicitly assigned a password hash. `main-admin` continues using `MAIN_ADMIN_PASSWORD_HASH`; this separate setting is not overridden by the user map. No existing local passwords are reset.

### Generate private values

From `backend`, generate a signing secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Paste it directly into Vercel's private environment configuration.

To generate a bcrypt hash without putting the password in terminal command history, use PowerShell from `backend`:

```powershell
$demoSecret = Read-Host 'New private demo password' -AsSecureString
try {
    $demoCredential = [System.Management.Automation.PSCredential]::new('demo', $demoSecret)
    $demoCredential.GetNetworkCredential().Password | node src/scripts/hashPassword.js
} finally {
    $demoSecret.Dispose()
    Remove-Variable demoCredential, demoSecret -ErrorAction SilentlyContinue
}
```

Paste the resulting hash into `MAIN_ADMIN_PASSWORD_HASH`. Do not add secrets to Git or `VITE_*` variables.

### Database behavior

`backend/demo/demo.db` is an intentionally tracked demo fixture generated from an empty schema and the approved local account snapshot. It retains the requested account identities but excludes usable credentials and private contact details. Teaching and financial demo records are synthetic, and all student and instructor names are Arabic. It includes three umbrella courses, seven cycles, eight students, completed paid/unpaid payroll, active tuition, partial payments, and exemption. Use October **2026** to exercise reports.

On each Vercel process's first initialization, the fixture is copied once to an isolated temporary writable directory. Repeated requests in that process reuse the same copy. Different instances do not share writes, and replacements start again from the fixture. **Changes may disappear between requests, not only after redeployment.** This is not persistent database hosting or production support for SQLite on Vercel. In-memory lockouts and SSO replay tracking are also instance-local.

Regenerate only the synthetic fixture from `backend` with `npm run demo:generate -- --replace`. It never reads the working database. Changes to the Prisma schema require regenerating the fixture before deployment.

### URL routing and SSO

- `/`, `/courses`, `/students`, etc. serve React; direct links and refreshes work.
- `/api/*` reaches Express through the Express service entry `backend/src/vercel.js`. API responses disable caching.
- `/api/health` verifies successful initialization. A 503 indicates missing/invalid deployment configuration or a missing fixture.
- Frontend requests default to same-origin `/api`; local Vite development proxies those requests to port 5000.
- CORS intentionally permits any origin, as requested. Bearer-token authentication and role checks still apply.
- Point the portal's application URL at `https://YOUR-DOMAIN/sso`. Finance also accepts `/sso-login`. Portal changes are managed separately.
- SSO callback tokens are removed from the browser address immediately, and navigation replaces callback history. The local recovery admin cannot be accessed through SSO.
- Optional `VITE_API_URL` supports a separate API host. It is public configuration, never a secret.

### Verification

Install dependencies separately inside `backend` and `frontend` with `npm ci`. From the repository root run:

```text
npm test
npm run build
```

Deployment tests create temporary copies of the synthetic database and check startup, password login, broad CORS, API rewrites, junior privacy, root SSO isolation, October exports, fixture immutability, and a fresh instance losing earlier writes. They do not change the local working database. A GitHub workflow runs tests and builds on pushes and pull requests.

Runtime dependency audits (`npm audit --omit=dev`) passed for both packages at preparation time. Development tooling still has upstream advisories; no forced breaking downgrades were applied.

Actual Vercel function packaging, Linux execution, and deployed routing must additionally be checked after importing the repository. Do not interpret a passing local build as a completed live deployment.

## Local development and later Linux VM

1. Install dependencies in both folders using `npm ci`.
2. Create `backend/.env` from `.env.example`, configure private keys, and supply your local SQLite database. Existing local databases are excluded from Git.
3. For an empty local database, run `npx prisma db push` from `backend` to create the schema. For an existing older database, back it up and follow `backend/prisma/upgrades/README.md` instead.
4. Run `npm run dev` in `backend`, then in `frontend` (ports 5000 and 5175 by default). If the backend port changes, update the Vite development proxy.
5. On a VM, keep the SQLite file on persistent storage and do not set `VERCEL=1`. Serve the built frontend with your web server and proxy `/api` to Express. The relative frontend API paths remain unchanged.

No Docker, Railway, or external database is required by this repository. The working `.env`, local databases, backups, temporary scripts, and unrelated embedded frontend project are excluded from Git. Only the demo fixture and approved account-identity snapshot are intentionally included; password hashes are supplied privately at runtime.

## Courses and cycles

`Course` stores the umbrella name and unique code. `Cycle` owns branch, dates, tuition, instructors, enrollments, and payroll. Cycle numbers are positive integers (up to 2,147,483,647), unique per parent across branches, including archived cycles. Suggestions use the highest reserved number plus one and remain editable. `/api/courses` manages umbrellas; `/api/cycles` manages operations, optionally filtered by `parentCourseId`. Existing operational relation fields named `courseId` refer to cycle IDs for compatibility; `Cycle.parentCourseId` always refers to the umbrella. Financial snapshots keep their original names when current course/cycle labels change.

The October 2026 fixture includes KET, PET, and IELTS with Arabic student/instructor names. The local reset preserves complete User rows and requires an external backup. It is not an automatic startup migration and must never run as part of Vercel deployment.
