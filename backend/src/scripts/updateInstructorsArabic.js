import prisma from '../db/prisma.js';

const instructorTranslations = {
  'Dr. Ahmed Khaled': 'د. أحمد خالد',
  'Eng. Sarah Youssef': 'م. سارة يوسف',
  'Dr. Mohamed Tarek': 'د. محمد طارق',
  'Ahmed Khaled': 'أحمد خالد',
  'Sarah Youssef': 'سارة يوسف',
  'Mohamed Tarek': 'محمد طارق'
};

async function updateInstructors() {
  console.log('Checking instructors for English names...');
  const instructors = await prisma.instructor.findMany();
  let updatedCount = 0;

  for (const inst of instructors) {
    if (instructorTranslations[inst.name]) {
      const arabicName = instructorTranslations[inst.name];
      await prisma.instructor.update({
        where: { id: inst.id },
        data: { name: arabicName }
      });
      console.log(`Updated instructor ${inst.name} -> ${arabicName}`);
      updatedCount++;
    } else {
      console.log(`Instructor already in Arabic or custom: ${inst.name}`);
    }
  }

  const all = await prisma.instructor.findMany({ select: { id: true, name: true, employeeId: true } });
  console.log(`Finished updating instructors. Updated: ${updatedCount}. Current instructors:`, all);
}

updateInstructors()
  .catch((err) => {
    console.error('Failed to update instructors:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
