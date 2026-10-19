import 'dotenv/config';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const version = '20261019_tuition_ledger';
try {
  await prisma.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "ApplicationUpgrade" ("version" TEXT PRIMARY KEY, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const applied = await prisma.$queryRawUnsafe('SELECT version FROM "ApplicationUpgrade" WHERE version = ?', version);
  if (applied.length) console.log('Tuition ledger upgrade already applied.');
  else {
    const invalidBalances = await prisma.$queryRawUnsafe('SELECT id FROM "Enrollment" WHERE amountPaid < 0 OR abs(amountPaid * 100 - ROUND(amountPaid * 100)) > 0.00001 OR amountPaid * 100 > 9007199254740991');
    if (invalidBalances.length) throw new Error('Existing enrollment balances need review before conversion to integer piasters. No financial records were changed.');
    const sql = await fs.readFile(new URL('../../prisma/upgrades/20261019_tuition_ledger.sql', import.meta.url), 'utf8');
    await prisma.$transaction(async tx => {
      for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      await tx.$executeRawUnsafe('INSERT INTO "ApplicationUpgrade" (version) VALUES (?)', version);
    });
    console.log('Student soft deletion and tuition ledger upgraded; existing balances preserved as legacy entries.');
  }
} finally { await prisma.$disconnect(); }
