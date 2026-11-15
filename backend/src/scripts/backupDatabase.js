// Full backup from the command line (for when the website itself is unavailable):
//   npm run db:backup -- [output-file]
// Uses DATABASE_URL. The file is the same as the "Download backup" button's and restores the same way.
import { writeFileSync } from 'node:fs';
import { rawPrisma } from '../db/prisma.js';
import { createBackup } from '../utils/backup.js';

const out =
  process.argv[2] || `aast-finance-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json.gz`;
try {
  const { file, summary } = await createBackup(rawPrisma, { username: 'command-line' });
  writeFileSync(out, file);
  console.log(`Backup saved: ${out} (${(file.length / 1024).toFixed(0)} KB)`);
  console.log(JSON.stringify(summary.counts));
} finally {
  await rawPrisma.$disconnect();
}
