import prisma from '../db/prisma.js';

// A bootstrap hash is used only for a new account or an account without a password.
// Routine startup must never overwrite an existing password.
export const ensureMainAdmin = async ({ passwordHash = process.env.MAIN_ADMIN_PASSWORD_HASH, resetPassword = false } = {}) => {
  const existing = await prisma.user.findUnique({ where: { username: 'main-admin' } });
  const needsPassword = !existing?.password || resetPassword;
  if (needsPassword && !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash || '')) {
    throw new Error('Configure MAIN_ADMIN_PASSWORD_HASH with a bcrypt hash before initializing the root administrator, or use the local admin password recovery script.');
  }
  if (!existing) {
    return prisma.user.create({ data: {
      username: 'main-admin', password: passwordHash, role: 'admin',
      firstName: 'Root', lastName: 'Administrator', isActive: true, isBanned: false
    } });
  }
  const data = {};
  if (existing.role !== 'admin') data.role = 'admin';
  if (!existing.isActive) data.isActive = true;
  if (existing.isBanned) data.isBanned = false;
  if (needsPassword) data.password = passwordHash;
  if (Object.keys(data).length) return prisma.user.update({ where: { id: existing.id }, data });
  return existing;
};
