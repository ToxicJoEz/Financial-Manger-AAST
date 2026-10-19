import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../db/prisma.js';
import { ensureMainAdmin } from '../utils/bootstrapAdmin.js';

// Pipe the password through standard input; never supply it as a command argument.
try {
  if (process.stdin.isTTY) throw new Error('Provide the new password through standard input. See prisma/upgrades/README.md.');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 1024) throw new Error('Password input is too long.');
  }
  const password = input.replace(/\r?\n$/, '');
  if (!password || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Password must contain 1 to 72 UTF-8 bytes.');
  await ensureMainAdmin({ passwordHash: await bcrypt.hash(password, 12), resetPassword: true });
  console.log('Permanent administrator password updated. Only its bcrypt hash was stored.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
