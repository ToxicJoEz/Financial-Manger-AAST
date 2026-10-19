import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma, { atomic } from '../db/prisma.js';
import generateToken from '../utils/generateToken.js';
import { logAction } from '../utils/logger.js';
import { isAccountLocked, recordFailedAttempt, recordSuccessfulLogin, getRemainingLockMinutes } from '../utils/loginRateLimiter.js';

export const loginUser = atomic(async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400);
      throw new Error('Please provide both username and password.');
    }

    // Check if account is temporarily locked (15 failed attempts in 10 minutes)
    if (isAccountLocked(username)) {
      const remainingMinutes = getRemainingLockMinutes(username);
      res.status(429);
      throw new Error(`Account temporarily locked due to too many failed login attempts (15 in 10 minutes). Please contact an administrator or moderator to unlock your account, or wait ${remainingMinutes} minute(s).`);
    }
    
    const user = await prisma.user.findUnique({ where: { username } });

    if (user && user.password && (await bcrypt.compare(password, user.password))) {
      // Check Enterprise Security Flags
      if (user.isBanned) {
        res.status(403);
        throw new Error('Your account has been banned.');
      }
      if (!user.isActive) {
        res.status(403);
        throw new Error('Your account has been deactivated.');
      }

      // Successful login clears any failed attempts
      recordSuccessfulLogin(username);

      // Record lastLogin timestamp
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() }
      });

      // Log the action
      await logAction('LOGIN_LOCAL', 'User logged in via local password authentication', user.username);

      res.json({
        success: true,
        message: 'Login successful!',
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          isActive: user.isActive,
          isBanned: user.isBanned
        },
        token: generateToken(user.id)
      });
    } else {
      // Record failed attempt
      recordFailedAttempt(username);
      res.status(401);
      throw new Error('Invalid username or password');
    }
  } catch (error) {
    next(error);
  }
});

export const registerUser = atomic(async (req, res, next) => {
  try {
    const { username, password, role } = req.body;

    const ALLOWED_ROLES = ['admin', 'mod', 'user'];
    if (role && !ALLOWED_ROLES.includes(role)) {
      res.status(400);
      throw new Error(`Invalid role specified. Allowed roles are: ${ALLOWED_ROLES.join(', ')}`);
    }

    // Enforce creation hierarchy
    let assignedRole = 'user';
    if (role && role !== 'user') {
      if (req.user.role === 'mod') {
        res.status(403);
        throw new Error('Mods can only create standard Users.');
      }
      if (req.user.role === 'admin') {
        assignedRole = role; // Admins can create mods or admins
      }
    }

    const userExists = await prisma.user.findUnique({ where: { username } });
    if (userExists) {
      res.status(400);
      throw new Error('Username is already taken');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role: assignedRole 
      }
    });

    await logAction('USER_CREATED', `Created new account with role: ${assignedRole}`, req.user.username, user.username);

    res.status(201).json({
      success: true,
      message: `User ${user.username} was created successfully!`,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

export const getUserProfile = async (req, res, next) => {
  try {
    if (req.user) {
      res.json({
        success: true,
        user: req.user // req.user is safely fetched and stripped of password by the middleware
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    next(error);
  }
};

// In-memory store for used JTIs to prevent replay attacks
const usedJtis = new Set();

export const ssoLogin = atomic(async (req, res, next) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      res.status(400);
      throw new Error('No SSO token provided');
    }

    // 1. Verify Signature & Expiry using the SSO-specific secret
    if (!process.env.SSO_JWT_SECRET) return res.status(503).json({ error: 'SSO is not configured for this deployment.' });
    const decoded = jwt.verify(token, process.env.SSO_JWT_SECRET, { algorithms: ['HS256'], ...(process.env.SSO_AUDIENCE ? { audience: process.env.SSO_AUDIENCE } : {}) });
    if (typeof decoded.username !== 'string' || !decoded.username.trim() || decoded.username.length > 100) return res.status(400).json({ error: 'Invalid SSO account identity.' });
    if (decoded.username.trim().toLowerCase() === 'main-admin') return res.status(403).json({ error: 'The local recovery administrator cannot sign in through SSO.' });

    // 2. Prevent Replay Attacks using JTI
    if (!decoded.jti) {
      res.status(400);
      throw new Error('Invalid SSO token payload (missing jti)');
    }
    
    if (usedJtis.has(decoded.jti)) {
      res.status(403);
      throw new Error('SSO token has already been used (Replay Attack Prevented)');
    }
    usedJtis.add(decoded.jti);

    // Automatically clean up the JTI after 30 seconds to prevent memory leaks
    setTimeout(() => {
      usedJtis.delete(decoded.jti);
    }, 30000);

    const { username, email, role } = decoded;

    const ALLOWED_ROLES = ['admin', 'mod', 'user'];
    const validRole = (role && ALLOWED_ROLES.includes(role)) ? role : 'user';
    const effectiveRole = username === 'main-admin' ? 'admin' : validRole;

    // 3. Auto-Provisioning & Sync
    let user = await prisma.user.findUnique({ where: { username } });

    if (!user) {
      // User doesn't exist, auto-provision them instantly!
      user = await prisma.user.create({
        data: {
          username,
          email: email || null,
          role: effectiveRole,
          // password remains null since they are authenticating via SSO
        }
      });
    } else {
      // User exists, sync their data (ensure Finance Manager respects SSO portal role, but protect main-admin)
      const updateData = {
        email: email || user.email,
        role: username === 'main-admin' ? 'admin' : (role && ALLOWED_ROLES.includes(role) ? role : user.role)
      };
      if (username === 'main-admin') {
        updateData.isActive = true;
        updateData.isBanned = false;
      }
      user = await prisma.user.update({
        where: { username },
        data: updateData
      });
    }

    // 4. Generate Local Session (same as normal login)
    if (user.isBanned) {
      res.status(403);
      throw new Error('Your account has been banned.');
    }
    if (!user.isActive) {
      res.status(403);
      throw new Error('Your account has been deactivated.');
    }

    // Update lastLogin timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    // Log the action
    await logAction('LOGIN_SSO', 'User logged in via AAST SSO Portal', user.username);

    res.json({
      success: true,
      message: 'SSO Login successful!',
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        isBanned: user.isBanned
      },
      token: generateToken(user.id) // Issue a standard local token!
    });

  } catch (error) {
    res.status(401);
    next(new Error(error.message || 'SSO Authentication Failed'));
  }
});
