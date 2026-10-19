import prisma from '../db/prisma.js';
export const logAction = (action, description, actorUsername, targetUsername = null) => prisma.systemLog.create({ data: { action, description, actorUsername, targetUsername } });
