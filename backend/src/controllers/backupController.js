import { createHash } from 'node:crypto';
import { rawPrisma } from '../db/prisma.js';
import { createBackup, readBackup, restoreBackup } from '../utils/backup.js';
import { logAction } from '../utils/logger.js';

// Hosting limits each request to a few MB, so backup files travel in parts of up to 3 MB.
// (Tests set BACKUP_CHUNK_BYTES smaller to exercise files of many parts.)
export const CHUNK = Number(process.env.BACKUP_CHUNK_BYTES) || 3 * 1024 * 1024;
const MAX_FILE = 200 * 1024 * 1024;
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
// Parts left behind by an interrupted download or upload are cleared after six hours.
const clearOld = () =>
  rawPrisma.backupTransfer.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 6 * 3600 * 1000) } } });
async function transferFor(req, kind) {
  const transfer = await rawPrisma.backupTransfer.findUnique({ where: { id: String(req.params.id) } });
  if (!transfer || transfer.kind !== kind || transfer.userId !== req.user.id) fail('Backup transfer not found.', 404);
  return transfer;
}

// 1. Download: the server builds the whole backup at once (a consistent snapshot) and keeps it in parts.
export const startBackup = async (req, res, next) => {
  try {
    await clearOld();
    const { file, summary } = await createBackup(rawPrisma, req.user);
    const totalChunks = Math.max(1, Math.ceil(file.length / CHUNK));
    const fileName = `aast-finance-backup-${stamp()}.json.gz`;
    const transfer = await rawPrisma.backupTransfer.create({
      data: {
        kind: 'DOWNLOAD',
        userId: req.user.id,
        fileName,
        size: file.length,
        totalChunks,
        sha256: createHash('sha256').update(file).digest('hex')
      }
    });
    for (let i = 0; i < totalChunks; i++)
      await rawPrisma.backupChunk.create({
        data: { transferId: transfer.id, index: i, data: file.subarray(i * CHUNK, (i + 1) * CHUNK) }
      });
    await logAction(
      'DOWNLOAD_BACKUP',
      `Created a full backup (${fileName}, ${(file.length / 1024).toFixed(0)} KB): ${summary.counts.User} accounts, ${summary.counts.Cycle} cycles, ${summary.counts.Student} students, ${summary.counts.SystemLog} log entries.`,
      req.user.username
    );
    res.status(201).json({
      id: transfer.id,
      fileName,
      size: file.length,
      totalChunks,
      sha256: transfer.sha256,
      counts: summary.counts
    });
  } catch (error) {
    next(error);
  }
};
export const backupChunk = async (req, res, next) => {
  try {
    const transfer = await transferFor(req, 'DOWNLOAD');
    const chunk = await rawPrisma.backupChunk.findUnique({
      where: { transferId_index: { transferId: transfer.id, index: Number(req.params.index) } }
    });
    if (!chunk) fail('Backup part not found.', 404);
    res.set('Content-Type', 'application/octet-stream').send(Buffer.from(chunk.data));
  } catch (error) {
    next(error);
  }
};
export const finishTransfer = async (req, res, next) => {
  try {
    const transfer = await rawPrisma.backupTransfer.findUnique({ where: { id: String(req.params.id) } });
    if (transfer && transfer.userId === req.user.id)
      await rawPrisma.backupTransfer.delete({ where: { id: transfer.id } });
    res.json({ message: 'Done.' });
  } catch (error) {
    next(error);
  }
};

// 2. Restore: the file is uploaded in parts, checked, then restored in one step.
export const startUpload = async (req, res, next) => {
  try {
    await clearOld();
    const size = Number(req.body?.size),
      fileName = String(req.body?.fileName || 'backup.json.gz').slice(0, 200);
    if (!Number.isInteger(size) || size < 1 || size > MAX_FILE) fail('Choose a backup file smaller than 200 MB.');
    const transfer = await rawPrisma.backupTransfer.create({
      data: { kind: 'UPLOAD', userId: req.user.id, fileName, size, totalChunks: Math.ceil(size / CHUNK) }
    });
    res.status(201).json({ id: transfer.id, chunkSize: CHUNK, totalChunks: transfer.totalChunks });
  } catch (error) {
    next(error);
  }
};
export const uploadChunk = async (req, res, next) => {
  try {
    const transfer = await transferFor(req, 'UPLOAD');
    const index = Number(req.params.index);
    if (!Number.isInteger(index) || index < 0 || index >= transfer.totalChunks) fail('Invalid backup part.');
    if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > CHUNK) fail('Invalid backup part.');
    await rawPrisma.backupChunk.upsert({
      where: { transferId_index: { transferId: transfer.id, index } },
      create: { transferId: transfer.id, index, data: req.body },
      update: { data: req.body }
    });
    res.json({ received: index + 1, of: transfer.totalChunks });
  } catch (error) {
    next(error);
  }
};
async function uploadedFile(transfer) {
  const chunks = await rawPrisma.backupChunk.findMany({
    where: { transferId: transfer.id },
    orderBy: { index: 'asc' }
  });
  if (chunks.length !== transfer.totalChunks || chunks.some((c, i) => c.index !== i))
    fail('The backup file did not finish uploading. Try again.');
  const file = Buffer.concat(chunks.map(c => Buffer.from(c.data)));
  if (file.length !== transfer.size) fail('The backup file did not finish uploading. Try again.');
  return file;
}
// What the uploaded backup contains, shown before the person confirms the restore.
export const checkUpload = async (req, res, next) => {
  try {
    const transfer = await transferFor(req, 'UPLOAD');
    const data = readBackup(await uploadedFile(transfer));
    res.json({ createdAt: data.createdAt, createdBy: data.createdBy, schema: data.schema, counts: data.counts });
  } catch (error) {
    next(error);
  }
};
export const restoreUpload = async (req, res, next) => {
  try {
    if (req.body?.confirm !== true) fail('Confirm that the backup replaces all current data.');
    const transfer = await transferFor(req, 'UPLOAD');
    const file = await uploadedFile(transfer);
    const data = await restoreBackup(rawPrisma, file);
    await rawPrisma.backupTransfer.deleteMany({ where: { id: transfer.id } });
    // This request's own log entry is written after the restore, so the restored history ends with it.
    await logAction(
      'RESTORE_BACKUP',
      `Restored the full backup ${transfer.fileName} made ${data.createdAt} by ${data.createdBy}: ${data.counts.User} accounts, ${data.counts.Cycle} cycles, ${data.counts.Student} students, ${data.counts.SystemLog} log entries. All earlier data was replaced.`,
      req.user.username
    );
    res.json({ message: 'Backup restored. Sign in again to continue.', counts: data.counts });
  } catch (error) {
    next(error);
  }
};
