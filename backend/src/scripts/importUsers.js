import 'dotenv/config';
import { readFileSync } from 'node:fs';
import prisma from '../db/prisma.js';
const filename = process.argv[2];
if (!filename) throw new Error('Usage: npm run db:import-users -- /private/path/users.json');
const accounts = JSON.parse(readFileSync(filename, 'utf8'));
if (!Array.isArray(accounts) || !accounts.length) throw new Error('No accounts provided.');
const dateFields = ['createdAt','updatedAt','lastLogin'];
const flags = ['isActive','isBanned'];
const fields = new Set(['id','username','password','role','email','firstName','lastName','avatar',...dateFields,...flags]);
try {
  await prisma.$transaction(async tx => {
    if(await tx.user.count()) throw new Error('Account import requires an empty User table. No existing accounts were changed.');
    for(const account of accounts) {
      if(!account.id || !account.username || !['admin','mod','user'].includes(account.role)) throw new Error('Invalid account identity or role.');
      const data = Object.fromEntries(Object.entries(account).filter(([key])=>fields.has(key)));
      for(const field of dateFields) if(data[field] != null) { data[field] = new Date(typeof data[field] === 'number' ? data[field] : /^\d+$/.test(String(data[field])) ? Number(data[field]) : data[field]); if(!Number.isFinite(data[field].getTime())) throw new Error('Invalid account date.'); }
      for(const field of flags) if(data[field]!=null) data[field] = Boolean(data[field]);
      await tx.user.create({data});
    }
  });
  console.log(`Imported ${accounts.length} accounts with existing password hashes and profile settings. No business data was created.`);
} finally { await prisma.$disconnect(); }
