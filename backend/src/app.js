import { getAttention } from './controllers/attentionController.js';
import express from 'express';
import { clientActivity } from './controllers/clientActivityController.js';
import { protect } from './middlewares/authMiddleware.js';
import { auditMiddleware } from './middlewares/auditMiddleware.js';
import importRoutes from './routes/importRoutes.js';
import exportRoutes from './routes/exportRoutes.js';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import logRoutes from './routes/logRoutes.js';
import instructorRoutes from './routes/instructorRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import catalogRoutes from './routes/catalogRoutes.js';
import subCourseRoutes from './routes/subCourseRoutes.js';
import branchRoutes from './routes/branchRoutes.js';
import assignmentRoutes from './routes/assignmentRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import financeRoutes from './routes/financeRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';

const app = express();

app.use('/api', auditMiddleware);

// Security Middlewares
app.use(helmet()); // Secures HTTP headers
app.use(cors());
app.use(['/api/employees/import', '/api/instructors/import'], express.json({ limit: '3mb' }));
app.use('/api/imports', express.json({ limit: '3mb' }));
app.use(express.json());
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.get('/api/health', (req, res) => res.json({ status: 'ok', database: 'postgresql' }));

app.post('/api/activity-events', protect, clientActivity);
app.get('/api/attention', protect, getAttention);

// Routes
app.use('/api/imports', importRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/instructors', instructorRoutes);
app.use('/api/employees', instructorRoutes);
app.use('/api/cycles', courseRoutes);
app.use('/api/courses', catalogRoutes);
app.use('/api/sub-courses', subCourseRoutes);
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
