import express from 'express';
import { loginUser, registerUser, getUserProfile, ssoLogin } from '../controllers/authController.js';
import { protect, modOrAbove } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public route: Anyone can try to login
router.post('/login', loginUser);

// Public route: SSO Portal verification
router.post('/sso', ssoLogin);

// Private route: Must be logged in (protect) AND be a mod/admin (modOrAbove) to create a user
router.post('/register', protect, modOrAbove, registerUser);

// Private route: Get currently logged in user's profile info
router.get('/me', protect, getUserProfile);

export default router;
