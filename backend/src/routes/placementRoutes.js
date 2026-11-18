import express from 'express';
import { protect, modOrAbove, managersOnly } from '../middlewares/authMiddleware.js';
import {
  canUsePlacements,
  listPlacements,
  searchStudents,
  createPlacement,
  updatePlacement,
  deletePlacement,
  testedForCycle
} from '../controllers/placementController.js';

const router = express.Router();
router.use(protect);
// "Pick from tested students" when enrolling: anyone who can enroll.
router.get('/for-cycle/:cycleId', modOrAbove, testedForCycle);
// The Tests tab: users with the placement tests toggle, admins and the main mod.
router.use((req, res, next) =>
  canUsePlacements(req.user)
    ? next()
    : res.status(403).json({ error: 'Placement tests are for the testing office, admins and the main mod.' })
);
router.get('/', listPlacements);
// Creating a test (and picking or creating its student) is for admins and the main mod.
router.get('/students', managersOnly('create placement tests'), searchStudents);
router.post('/', managersOnly('create placement tests'), createPlacement);
router.put('/:id', updatePlacement);
router.delete('/:id', deletePlacement);

export default router;
