import express from 'express';
import { protect, modOrAbove, managersOnly } from '../middlewares/authMiddleware.js';
import {
  canUsePlacements,
  listPlacements,
  searchStudents,
  createPlacement,
  updatePlacement,
  deletePlacement,
  testedForCycle,
  canCreateTests
} from '../controllers/placementController.js';

const router = express.Router();
router.use(protect);
// "Pick from tested students" when enrolling places a tested student: admins and the main mod only.
router.get('/for-cycle/:cycleId', managersOnly('place tested students'), testedForCycle);
// The Tests tab: users with the placement tests toggle, admins and the main mod.
router.use((req, res, next) =>
  canUsePlacements(req.user)
    ? next()
    : res.status(403).json({ error: 'Placement tests are for the testing office, admins and the main mod.' })
);
router.get('/', listPlacements);
// Creating a test (and picking or creating its student): admins, the main mod and branch mods.
const createsTests = (req, res, next) =>
  canCreateTests(req.user) ? next() : res.status(403).json({ error: 'Only admins, the main mod and branch mods can create placement tests.' });
router.get('/students', createsTests, searchStudents);
router.post('/', createsTests, createPlacement);
router.put('/:id', updatePlacement);
router.delete('/:id', deletePlacement);

export default router;
