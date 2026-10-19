import express from 'express';
import { testApi } from '../controllers/testController.js';

const router = express.Router();

// Map the /test route to the testApi controller function
router.get('/test', testApi);

export default router;
