import prisma from '../db/prisma.js';
import { ensureMainAdmin } from './bootstrapAdmin.js';
let initialization;
export function initialize() {
  if (!initialization) initialization = (async () => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32 || secret === 'supersecretjwtkey') throw new Error('JWT_SECRET must contain at least 32 characters.');
    if (process.env.SSO_JWT_SECRET && process.env.SSO_JWT_SECRET === secret) throw new Error('Local and SSO signing keys must be different.');
    await prisma.$connect();
    await ensureMainAdmin();
    if (process.env.VERCEL === '1') {
      // Fixture users have no passwords; never bundle usable credentials or hashes.
      const hash = process.env.MAIN_ADMIN_PASSWORD_HASH;
      if (!hash) throw new Error('MAIN_ADMIN_PASSWORD_HASH is required for the disposable demo.');
      await prisma.user.updateMany({ where: { username: { in: ['demo-mod', 'demo-user'] }, password: null }, data: { password: hash } });
    }
  })().catch(error => { initialization = undefined; throw error; });
  return initialization;
}
