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
      // Account identities are bundled; their existing password hashes stay private.
      if (!process.env.MAIN_ADMIN_PASSWORD_HASH) throw new Error('MAIN_ADMIN_PASSWORD_HASH is required for the disposable demo.');
      let passwords;
      try { passwords = JSON.parse(process.env.DEMO_USER_PASSWORD_HASHES || '{}'); }
      catch { throw new Error('DEMO_USER_PASSWORD_HASHES must be a JSON object.'); }
      if (!passwords || typeof passwords !== 'object' || Array.isArray(passwords)) throw new Error('DEMO_USER_PASSWORD_HASHES must be a JSON object.');
      for (const [username, hash] of Object.entries(passwords)) {
        if (username === 'main-admin') continue; // Recovery admin is configured separately.
        if (typeof hash !== 'string' || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) throw new Error('A demo account password hash is invalid.');
        await prisma.user.updateMany({ where: { username, password: null }, data: { password: hash } });
      }
    }
  })().catch(error => { initialization = undefined; throw error; });
  return initialization;
}
