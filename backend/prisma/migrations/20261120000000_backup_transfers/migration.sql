-- Temporary storage for backup files sent in parts (download and restore).
CREATE TABLE "BackupTransfer" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "sha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BackupTransfer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BackupChunk" (
    "transferId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    CONSTRAINT "BackupChunk_pkey" PRIMARY KEY ("transferId","index")
);
ALTER TABLE "BackupChunk" ADD CONSTRAINT "BackupChunk_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "BackupTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
