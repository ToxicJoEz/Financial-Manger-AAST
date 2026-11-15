-- Branches become data managed by admins and the main mod (they were a fixed list in the code).
CREATE TABLE "Branch" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Branch_pkey" PRIMARY KEY ("code")
);
INSERT INTO "Branch" ("code", "name", "color", "sortOrder") VALUES
  ('MIAMI', 'Miami', '#2563eb', 1),
  ('FOUAD', 'Fouad', '#7c3aed', 2),
  ('PORT-SAID', 'Port Said', '#c2620a', 3),
  ('ASWAN', 'Aswan', '#dc2626', 4),
  ('SMART', 'Smart', '#0e7f99', 5),
  ('ONLINE', 'Online', '#05875f', 6),
  ('DOKKI', 'Dokki', '#be185d', 7);
