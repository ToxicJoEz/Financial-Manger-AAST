import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

const availableColors = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink',
  'rose', 'slate', 'gray', 'zinc'
];

router.get('/colors', async (req, res) => {
  try {
    const branches = await prisma.branchColor.findMany();
    const map = {};
    branches.forEach(b => { map[b.name] = b.color; });
    res.json(map);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/colors', async (req, res) => {
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
      const colorToAssign = unusedColors.length > 0 
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
});

export default router;
