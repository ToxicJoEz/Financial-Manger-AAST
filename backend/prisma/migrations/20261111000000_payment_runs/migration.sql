-- Numbered payment batches ("Payment batch 2 · October 2026"), one per initiation, numbered within the initiation month.
CREATE TABLE "PaymentRun" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "initiatedDate" TIMESTAMP(3) NOT NULL,
    "initiatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentRun_year_month_number_key" ON "PaymentRun"("year", "month", "number");

ALTER TABLE "InstructorPaymentBatch" ADD COLUMN "runId" TEXT;

-- Existing payments: one run per initiation day (as they were shown before), numbered by date within each month.
CREATE TEMP TABLE run_days AS
SELECT DISTINCT date_trunc('day', COALESCE("initiatedDate", "createdAt")) AS day
FROM "InstructorPaymentBatch";
INSERT INTO "PaymentRun" ("id", "year", "month", "number", "initiatedDate", "updatedAt")
SELECT gen_random_uuid()::text,
       EXTRACT(YEAR FROM day)::int,
       EXTRACT(MONTH FROM day)::int,
       ROW_NUMBER() OVER (PARTITION BY date_trunc('month', day) ORDER BY day)::int,
       day,
       CURRENT_TIMESTAMP
FROM run_days;
UPDATE "InstructorPaymentBatch" b SET "runId" = r."id"
FROM "PaymentRun" r
WHERE r."initiatedDate" = date_trunc('day', COALESCE(b."initiatedDate", b."createdAt"));
DROP TABLE run_days;

ALTER TABLE "InstructorPaymentBatch" ALTER COLUMN "runId" SET NOT NULL;
CREATE INDEX "InstructorPaymentBatch_runId_idx" ON "InstructorPaymentBatch"("runId");
ALTER TABLE "InstructorPaymentBatch" ADD CONSTRAINT "InstructorPaymentBatch_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PaymentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
