import express from 'express';
import exportRoutes from './routes/exportRoutes.js';
import cors from 'cors';
import helmet from 'helmet';
import testRoutes from './routes/testRoutes.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import logRoutes from './routes/logRoutes.js';
import instructorRoutes from './routes/instructorRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import branchRoutes from './routes/branchRoutes.js';
import assignmentRoutes from './routes/assignmentRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import financeRoutes from './routes/financeRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';

const app = express();

// Security Middlewares
app.use(helmet()); // Secures HTTP headers
app.use(cors());
app.use(express.json());
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/api/health', (req, res) => res.json({ status: 'ok', demo: process.env.VERCEL === '1' }));

// Routes
app.use('/api', testRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/instructors', instructorRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/finances', financeRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/students', studentRoutes);

// Global Error Handlers (Must be placed AFTER all routes)
app.use(notFound);
app.use(errorHandler);

export default app;