import jwt from 'jsonwebtoken';
import prisma from '../db/prisma.js';

export const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      if (!process.env.JWT_SECRET) {
        throw new Error('FATAL: JWT_SECRET environment variable is not defined.');
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, username: true, role: true, email: true, firstName: true, lastName: true, isActive: true, isBanned: true }
      });
      
      if (!user) {
        res.status(401);
        throw new Error('User no longer exists');
      }
      
      if (user.isBanned || !user.isActive) {
         res.status(403);
         throw new Error('Account disabled or banned');
      }

      req.user = user;
      next();
    } catch (error) {
      res.status(401);
      next(new Error('Not authorized, token failed or expired'));
    }
  } else {
    res.status(401);
    next(new Error('Not authorized, no token provided'));
  }
};

export const modOrAbove = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'mod')) {
    next(); 
  } else {
    res.status(403);
    next(new Error('Not authorized. This action requires Mod or Admin privileges.'));
  }
};

export const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403);
    next(new Error('Not authorized. This action requires Admin privileges.'));
  }
};
