import { copyFileSync, existsSync, mkdtempSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

let runtimePath;
// Called before constructing any Prisma client. One writable copy per process.
export function prepareRuntimeDatabase() {
  if (process.env.VERCEL !== '1') return null;
  if (process.env.VERCEL_SQLITE_DEMO !== '1') throw new Error('Vercel requires explicit disposable SQLite demo mode.');
  if (runtimePath) return runtimePath;
  const source = fileURLToPath(new URL('../../demo/demo.db', import.meta.url));
  if (!existsSync(source)) throw new Error('Bundled synthetic demo database is missing.');
  const directory = mkdtempSync(join(tmpdir(), 'aast-finance-demo-'));
  const destination = join(directory, 'demo.db');
  copyFileSync(source, destination);
  chmodSync(destination, 0o600);
  process.env.DATABASE_URL = 'file:' + destination.split(sep).join('/');
  runtimePath = destination;
  return runtimePath;
}
