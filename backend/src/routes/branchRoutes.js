import express from 'express';
import prisma, { atomic } from '../db/prisma.js';
import { protect, modOrAbove, managersOnly } from '../middlewares/authMiddleware.js';
import {
  listBranches,
  createBranch,
  updateBranch,
  branchImpact,
  deleteBranch
} from '../controllers/branchController.js';

const router = express.Router();

const availableColors = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'slate',
  'gray',
  'zinc'
];

router.get('/colors', async (req, res) => {
  try {
    const branches = await prisma.branchColor.findMany();
    const map = {};
    branches.forEach(b => {
      map[b.name] = b.color;
    });
    res.json(map);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/colors',
  protect,
  modOrAbove,
  atomic(async (req, res) => {
    try {
      const { name } = req.body;
      const lowerName = name.toLowerCase().trim();

      let branch = await prisma.branchColor.findUnique({
        where: { name: lowerName }
      });

      if (!branch) {
        // Find used colors
        const usedBranches = await prisma.branchColor.findMany();
        const usedColors = new Set(usedBranches.map(b => b.color));

        // Pick random unused color
        const unusedColors = availableColors.filter(c => !usedColors.has(c));
        const colorToAssign =
          unusedColors.length > 0
            ? unusedColors[Math.floor(Math.random() * unusedColors.length)]
            : availableColors[Math.floor(Math.random() * availableColors.length)]; // fallback

        branch = await prisma.branchColor.create({
          data: { name: lowerName, color: colorToAssign }
        });
      }

      res.json(branch);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  })
);

// Branches as data: everyone signed in reads them; admins and the main mod add, rename, recolour and delete.
router.get('/', protect, listBranches);
router.post('/', protect, managersOnly('add branches'), createBranch);
router.get('/:code/impact', protect, managersOnly('delete branches'), branchImpact);
router.put('/:code', protect, managersOnly('change branches'), updateBranch);
router.delete('/:code', protect, managersOnly('delete branches'), deleteBranch);
export default router;
