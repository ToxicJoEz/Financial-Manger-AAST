import prisma from '../db/prisma.js';

// @desc    Get all system logs
// @route   GET /api/logs
// @access  Private/AdminOnly
export const getSystemLogs = async (req, res, next) => {
  try {
    const logs = await prisma.systemLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { role: true, avatar: true } }
      }
    });
    res.json(logs);
  } catch (error) {
    next(error);
  }
};
