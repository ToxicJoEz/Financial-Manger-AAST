# AAST Finance Manager

React/Vite frontend and Express/Prisma backend using PostgreSQL in every environment.

## Local development

1. Install dependencies: `npm ci --prefix backend` and `npm ci --prefix frontend`.
2. Configure `backend/.env` using `backend/.env.example`. Keep credentials private.
3. Start PostgreSQL, apply migrations, then launch the API and frontend. On this Windows laptop, `start_app.bat` does these steps automatically.

```powershell
npm --prefix backend run db:start
npm --prefix backend run db:deploy
npm --prefix backend run dev
npm --prefix frontend run dev
```

Frontend: http://localhost:5175. API: http://localhost:5000/api. Requests use relative `/api` paths, with Vite proxying locally.

The optional portable PostgreSQL setup is configured in the ignored `backend/.local-postgres.json`. It binds to 127.0.0.1 on port 55432 and uses password authentication. Its data and binaries live outside the repository. Start/stop it with `npm --prefix backend run db:start` / `db:stop`. Existing system PostgreSQL installations and Linux deployments do not need this file; use your normal database service.

## Database configuration

- `DATABASE_URL`: application connection. Use Neon's pooled PostgreSQL URL on Vercel, with a modest Prisma `connection_limit` (for example 5).
- `DIRECT_URL`: direct PostgreSQL URL for Prisma migrations. Locally it can equal DATABASE_URL; on Neon use the direct non-pooler connection.
- `TEST_DATABASE_URL`: separate database whose name ends in `_test`. Integration tests never fall back to the working database.
- `JWT_SECRET`: at least 32 characters.
- `SSO_JWT_SECRET`: optional, separate from JWT_SECRET; must match the SSO portal when used.
- `MAIN_ADMIN_PASSWORD_HASH`: private bcrypt bootstrap hash for a new main-admin account. Existing passwords are not overwritten on startup.
- `SSO_AUDIENCE`: optional SSO recipient validation.

Never expose these values through VITE_ variables or commit `.env`, account transfer files, or database backups.

## Vercel and Neon

The repository deploys two services through `vercel.json`: the Vite frontend and Express API. `/api` requests route to the backend; frontend routes fall back to index.html for page refreshes. CORS remains open as requested.

Create/connect Neon through the Vercel Marketplace, then configure DATABASE_URL and DIRECT_URL for the backend build/runtime. Keep your existing signing keys and bootstrap hash. Backend build regenerates Prisma and runs `prisma migrate deploy` using DIRECT_URL. A failed migration prevents that deployment from building successfully. Do not run schema migrations inside request handlers.

The old `VERCEL_SQLITE_DEMO` and `DEMO_USER_PASSWORD_HASHES` settings are no longer used and may be removed from Vercel. There is no bundled database, temporary copy, automatic seed, or reset on cold start/redeployment. Neon stores shared persistent data.

A brand-new database contains only the main-admin account initialized from MAIN_ADMIN_PASSWORD_HASH on first API initialization. To transfer existing accounts with unchanged IDs, password hashes and profiles, apply migrations and import a private account snapshot **before** starting the API:

```powershell
npm --prefix backend run db:import-users -- C:/private/users.json
```

This refuses to import into a nonempty User table and runs atomically. No teaching/student/payment data is imported. Transfer files contain sensitive hashes and profile information; keep them outside Git and Vercel uploads. SSO-only accounts remain SSO-only.

## Production Linux VM later

Use PostgreSQL on the VM and update DATABASE_URL / DIRECT_URL. The Prisma schema and application code are the same as local and Neon. Apply `npm --prefix backend run db:deploy` before starting Express. Serve `frontend/dist` with the web server and proxy `/api` to Express. Database contents can be transferred with PostgreSQL backup/restore tools. Choose explicit environments rather than reusing the employee testing database.

## Verification

`npm --prefix backend test` runs unit tests and isolated PostgreSQL integration workflows: login, roles/SSO, concurrent mutations, course hierarchy, tuition/books, Excel imports/exports, approvals, payroll, and permanent deletion. Configure TEST_DATABASE_URL; each workflow uses a random schema in the test database and removes that schema afterward. Tests cannot run against a database whose name does not end in `_test`.

`npm run build` regenerates Prisma and builds the frontend. `npm --prefix backend run db:status` checks migration status. Subsequent schema changes should create a new versioned Prisma migration; do not edit the applied PostgreSQL baseline.

The local working database now includes the manually requested sample set described in TEST-DATA.md. The sample generator never runs automatically. Integration fixtures remain isolated from the working database.

Authentication lockout/replay trackers are still process-local; PostgreSQL persistence does not change those existing mechanisms.
