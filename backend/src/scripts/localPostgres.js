import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const path = new URL('../../.local-postgres.json', import.meta.url);
if (!existsSync(path)) {
  console.log('No portable local PostgreSQL configured; using the database in DATABASE_URL.');
  process.exit(0);
}
const config = JSON.parse(readFileSync(path, 'utf8'));
const executable = join(config.binDir, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
const ready = spawnSync(join(config.binDir, process.platform === 'win32' ? 'pg_isready.exe' : 'pg_isready'), ['-h','127.0.0.1','-p',String(config.port)], { encoding:'utf8', windowsHide:true });
const result = { status: ready.status };
if (ready.error) throw ready.error;
if (process.argv[2] === 'stop') {
  if (result.status === 0) { const stopped = spawnSync(executable, ['-D',config.dataDir,'-m','fast','-w','stop'],{stdio:'inherit',windowsHide:true}); process.exit(stopped.status || 0); }
} else if (result.status === 0) console.log('Local PostgreSQL is already running.');
else {
  const started=spawnSync(executable,['-D',config.dataDir,'-l',config.logFile,'-o',`-h 127.0.0.1 -p ${config.port}`,'-w','start'],{stdio:'inherit',windowsHide:true});
  if(started.error) throw started.error;
  process.exit(started.status || 0);
}
