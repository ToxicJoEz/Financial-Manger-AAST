# Database upgrades

PostgreSQL schema changes now live in `../migrations/` and are applied with `npm --prefix backend run db:deploy`.

The 20261021000000_postgresql_baseline migration creates the complete current schema, including cycle venue/times, student approvals, tuition ledger, instructor salary/payment batches and book payments. SQLite-specific startup DDL/backfills have been retired. The previous SQLite file and upgrade scripts were backed up privately outside the project during migration.

Runtime startup only connects, validates required configuration/tables and initializes the recovery administrator when needed. It never copies a database, seeds business records or changes tables. Account-only transfer is handled by `db:import-users` against an empty User table.
