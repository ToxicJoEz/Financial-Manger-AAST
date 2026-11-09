-- Private umbrellas gain sub-umbrellas (e.g. KET, PET) that own cycle numbering, names and book price.
CREATE TABLE "SubCourse" (
    "id" TEXT NOT NULL,
    "parentCourseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bookPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "archivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubCourse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubCourse_parentCourseId_name_key" ON "SubCourse"("parentCourseId", "name");
ALTER TABLE "SubCourse" ADD CONSTRAINT "SubCourse_parentCourseId_fkey" FOREIGN KEY ("parentCourseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Cycle" ADD COLUMN "subCourseId" TEXT, ADD COLUMN "numberingKey" TEXT;

-- Existing private cycles move into a GENERAL sub-umbrella per private umbrella, keeping their numbers.
-- Its book price is the most common price those cycles used; past book payments keep their own amounts.
INSERT INTO "SubCourse" ("id", "parentCourseId", "name", "bookPrice", "updatedAt")
SELECT gen_random_uuid()::text, c."parentCourseId", 'GENERAL',
       COALESCE(mode() WITHIN GROUP (ORDER BY c."bookPrice"), 0), CURRENT_TIMESTAMP
FROM "Cycle" c JOIN "Course" p ON p."id" = c."parentCourseId"
WHERE p."isPrivate" = true
GROUP BY c."parentCourseId";
UPDATE "Cycle" c SET "subCourseId" = s."id"
FROM "SubCourse" s WHERE s."parentCourseId" = c."parentCourseId" AND s."name" = 'GENERAL';

UPDATE "Cycle" SET "numberingKey" = COALESCE("subCourseId", "parentCourseId");
ALTER TABLE "Cycle" ALTER COLUMN "numberingKey" SET NOT NULL;
DROP INDEX "Cycle_parentCourseId_cycleNumber_key";
CREATE UNIQUE INDEX "Cycle_numberingKey_cycleNumber_key" ON "Cycle"("numberingKey", "cycleNumber");
CREATE INDEX "Cycle_subCourseId_idx" ON "Cycle"("subCourseId");
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_subCourseId_fkey" FOREIGN KEY ("subCourseId") REFERENCES "SubCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Book prices now live on the sub-umbrella.
ALTER TABLE "Cycle" DROP COLUMN "bookPrice";
