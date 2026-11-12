-- Private sub-umbrellas become Private umbrellas. Each keeps its id (cycles already number by it), name,
-- book price and archive state, and takes the branches of the umbrella it sat in. Private umbrellas have no code.
ALTER TABLE "Course" ALTER COLUMN "code" DROP NOT NULL;

INSERT INTO "Course" ("id", "isPrivate", "name", "code", "bookPrice", "branches", "archivedAt", "archivedBy", "createdAt", "updatedAt")
SELECT s."id", true, s."name", NULL, s."bookPrice", p."branches",
       COALESCE(s."archivedAt", p."archivedAt"), CASE WHEN s."archivedAt" IS NULL THEN p."archivedBy" ELSE s."archivedBy" END,
       s."createdAt", CURRENT_TIMESTAMP
FROM "SubCourse" s JOIN "Course" p ON p."id" = s."parentCourseId";

UPDATE "Cycle" SET "parentCourseId" = "subCourseId" WHERE "subCourseId" IS NOT NULL;

ALTER TABLE "Cycle" DROP CONSTRAINT "Cycle_subCourseId_fkey";
DROP INDEX "Cycle_subCourseId_idx";
ALTER TABLE "Cycle" DROP COLUMN "subCourseId";
DROP TABLE "SubCourse";

-- The old private containers are now empty; remove them. Every remaining private umbrella has no code.
DELETE FROM "Course" c
WHERE c."isPrivate" = true AND c."code" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Cycle" y WHERE y."parentCourseId" = c."id");
UPDATE "Course" SET "code" = NULL WHERE "isPrivate" = true;

-- Employees' hours can be closed before a course ends.
ALTER TABLE "CourseInstructor" ADD COLUMN "closedAt" TIMESTAMP(3), ADD COLUMN "closedBy" TEXT;
ALTER TABLE "PendingAssignment" ADD COLUMN "hours" DOUBLE PRECISION;
