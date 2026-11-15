import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Prisma } from '../db/prisma.js';

// A full backup: every table (accounts, umbrellas, cycles, students, money, payroll, checks, notifications and
// the activity log) in one gzip-compressed JSON file. Restoring it on the same version of the app, here or on
// another host, picks up exactly where the backup was taken.
export const BACKUP_FORMAT = 'aast-finance-backup';
const VERSION = 1;
// Temporary storage for files in transit is never backed up or restored.
const SKIPPED = new Set(['BackupTransfer', 'BackupChunk']);
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

const models = () => Prisma.dmmf.datamodel.models.filter(m => !SKIPPED.has(m.name));
const table = model => model.dbName || model.name;
const delegate = (client, model) => client[model.name[0].toLowerCase() + model.name.slice(1)];

// Tables in an order that respects foreign keys: a table comes after the tables it points to.
// Links from a table to itself (a cycle's previous level, a payment's reversal) are filled in afterwards.
function insertOrder() {
  const list = models(),
    byName = new Map(list.map(m => [m.name, m]));
  const deps = new Map(
    list.map(m => [
      m.name,
      new Set(
        m.fields
          .filter(f => f.kind === 'object' && f.relationFromFields?.length && f.type !== m.name && byName.has(f.type))
          .map(f => f.type)
      )
    ])
  );
  const order = [],
    done = new Set();
  while (order.length < list.length) {
    const next = list.find(m => !done.has(m.name) && [...deps.get(m.name)].every(d => done.has(d)));
    if (!next) fail('The database tables have a circular link that backup cannot order.', 500);
    order.push(next);
    done.add(next.name);
  }
  return order;
}
const selfLinks = model =>
  model.fields
    .filter(f => f.kind === 'object' && f.relationFromFields?.length && f.type === model.name)
    .flatMap(f => f.relationFromFields);

// The newest database change applied, so a backup is only restored onto the same version of the app.
async function schemaVersion(client) {
  const [row] = await client.$queryRawUnsafe(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1'
  );
  return row?.migration_name || 'unknown';
}

const encode = (key, value) =>
  typeof value === 'bigint' ? value.toString() : Buffer.isBuffer(value) ? value.toString('base64') : value;
function revive(model, row) {
  const out = {};
  for (const field of model.fields.filter(f => f.kind !== 'object')) {
    if (!Object.hasOwn(row, field.name)) continue;
    const value = row[field.name];
    if (value === null || value === undefined) out[field.name] = value === undefined ? undefined : null;
    else if (field.type === 'DateTime') out[field.name] = new Date(value);
    else if (field.type === 'BigInt') out[field.name] = BigInt(value);
    else if (field.type === 'Bytes') out[field.name] = Buffer.from(value, 'base64');
    else if (field.type === 'Json') out[field.name] = value;
    else out[field.name] = value;
  }
  return out;
}

export async function createBackup(client, actor) {
  const tables = {},
    counts = {};
  for (const model of insertOrder()) {
    const rows = await delegate(client, model).findMany();
    tables[model.name] = rows;
    counts[model.name] = rows.length;
  }
  const body = JSON.stringify(tables, encode);
  const payload = {
    format: BACKUP_FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    createdBy: actor?.username || 'system',
    schema: await schemaVersion(client),
    counts,
    sha256: createHash('sha256').update(body).digest('hex')
  };
  // Header first, then the tables, so the file can be checked before anything is restored.
  const file = gzipSync(Buffer.from(JSON.stringify(payload).slice(0, -1) + ',"tables":' + body + '}'), { level: 9 });
  return { file, summary: payload };
}

// Reads and checks a backup file without changing anything.
export function readBackup(buffer) {
  let data;
  try {
    data = JSON.parse(gunzipSync(buffer).toString('utf8'));
  } catch {
    fail('This is not a backup file from this app, or it is damaged.');
  }
  if (data?.format !== BACKUP_FORMAT || !data.tables || typeof data.tables !== 'object')
    fail('This is not a backup file from this app.');
  if (data.version > VERSION) fail('This backup was made by a newer version of the app. Update the app first.');
  const body = JSON.stringify(data.tables);
  if (createHash('sha256').update(body).digest('hex') !== data.sha256)
    fail('This backup file is damaged (its contents do not match its checksum).');
  return data;
}

// Replaces everything in the database with the backup, in one transaction: if anything fails, nothing changes.
export async function restoreBackup(client, buffer, { timeout = 300000 } = {}) {
  const data = readBackup(buffer);
  const current = await schemaVersion(client);
  if (data.schema !== current)
    fail(
      `This backup was made on another version of the app (database version ${data.schema}; this app is on ${current}). Restore it on the same version.`,
      409
    );
  const order = insertOrder();
  const names = order.map(m => `"${table(m)}"`).join(', ');
  await client.$transaction(
    async tx => {
      // The activity log is protected against changes; the restore lifts that only inside this transaction.
      await tx.$executeRawUnsafe('ALTER TABLE "SystemLog" DISABLE TRIGGER USER');
      await tx.$executeRawUnsafe(`TRUNCATE ${names} CASCADE`);
      for (const model of order) {
        const rows = (data.tables[model.name] || []).map(row => revive(model, row));
        const later = selfLinks(model);
        const first = later.length ? rows.map(r => ({ ...r, ...Object.fromEntries(later.map(k => [k, null])) })) : rows;
        for (let i = 0; i < first.length; i += 500)
          await delegate(tx, model).createMany({ data: first.slice(i, i + 500) });
        for (const row of later.length ? rows : [])
          if (later.some(k => row[k] != null))
            await delegate(tx, model).update({
              where: { id: row.id },
              data: Object.fromEntries(later.map(k => [k, row[k]]))
            });
      }
      await tx.$executeRawUnsafe('ALTER TABLE "SystemLog" ENABLE TRIGGER USER');
    },
    { timeout, maxWait: 20000 }
  );
  return data;
}
