import 'dotenv/config';
import prisma from './db/prisma.js';
import { ensureMainAdmin } from './utils/bootstrapAdmin.js';

try {
  await ensureMainAdmin();
  console.log('Permanent administrator ready. Existing passwords are preserved.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
