import prisma from '../db/prisma.js';
import { ensureMainAdmin } from './bootstrapAdmin.js';
let initialization;
export function initialize() {
  if (!initialization) initialization = (async () => {
    let stage='authentication-configuration';
    try {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32 || secret === 'supersecretjwtkey') throw new Error('JWT_SECRET must contain at least 32 characters.');
    if (process.env.SSO_JWT_SECRET && process.env.SSO_JWT_SECRET === secret) throw new Error('Local and SSO signing keys must be different.');
    stage='database-connect';
    await prisma.$connect();
    // Fail clearly when a new deployment has not received its migrations.
    stage='database-schema';
    await prisma.user.count();
    stage='administrator-bootstrap';
    await ensureMainAdmin();
    } catch(error) { error.startupStage=stage; throw error; }

  })().catch(error => { initialization = undefined; throw error; });
  return initialization;
}
