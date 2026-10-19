import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function run(args, env = process.env, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(['backend/node_modules/prisma/build/index.js', 'generate', '--schema=backend/prisma/schema.prisma']);
run([fileURLToPath(new URL('../frontend/node_modules/vite/bin/vite.js', import.meta.url)), 'build'], { ...process.env, VITE_DEMO_MODE: process.env.VERCEL === '1' ? 'true' : 'false' }, fileURLToPath(new URL('../frontend/', import.meta.url)));
