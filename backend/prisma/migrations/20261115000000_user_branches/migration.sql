-- Users see only the branches assigned to them (comma-separated); none until assigned.
ALTER TABLE "User" ADD COLUMN "branches" TEXT;
