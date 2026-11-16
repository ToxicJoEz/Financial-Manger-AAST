// Deletes everything except user accounts and the branch list, from the command line:
//   npm run db:wipe-all-but-accounts -- --confirm
// Uses DATABASE_URL. Irreversible: take a backup first (npm run db:backup).
import { rawPrisma } from '../db/prisma.js';
import { wipeAllButAccounts } from '../utils/wipeData.js';

if (!process.argv.includes('--confirm')) {
  console.error(
    'Usage: npm run db:wipe-all-but-accounts -- --confirm   (deletes all data except accounts and branches)'
  );
  process.exit(1);
}
try {
  const { accounts, wiped } = await wipeAllButAccounts(rawPrisma, 'command-line');
  console.log(`Wiped ${wiped.length} tables. ${accounts} user accounts kept.`);
} finally {
  await rawPrisma.$disconnect();
}
