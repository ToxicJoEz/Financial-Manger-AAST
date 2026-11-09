-- Student approvals were retired; staff now manage students directly.
DELETE FROM "Notification" WHERE "type" IN ('STUDENT_REQUEST', 'STUDENT_APPROVED', 'STUDENT_REJECTED');
DROP TABLE IF EXISTS "StudentRequest";
