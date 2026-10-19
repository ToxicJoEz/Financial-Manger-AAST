import prisma from '../db/prisma.js';

const sampleStudents = [
  { name: 'أحمد محمد حسن', registrationNumber: '21100101', mobile: '01012345601' },
  { name: 'سارة محمود علي', registrationNumber: '21100102', mobile: '01123456702' },
  { name: 'عمر خالد السيد', registrationNumber: '21100103', mobile: '01234567803' },
  { name: 'مريم طارق إبراهيم', registrationNumber: '21100104', mobile: '01098765404' },
  { name: 'يوسف عمرو مصطفى', registrationNumber: '21100105', mobile: '01551234505' },
  { name: 'نور الدين هشام', registrationNumber: '21100106', mobile: '01187654306' },
  { name: 'سلمى هاني عبد الرحمن', registrationNumber: '21100107', mobile: '01276543207' },
  { name: 'زياد شريف فاروق', registrationNumber: '21100108', mobile: '01065432108' },
  { name: 'ملك كريم سليمان', registrationNumber: '21100109', mobile: '01154321009' },
  { name: 'علي أشرف منصور', registrationNumber: '21100110', mobile: '01243210910' },
  { name: 'فريدة وائل نبيل', registrationNumber: '21100111', mobile: '01032109811' },
  { name: 'مصطفى حازم رضوان', registrationNumber: '21100112', mobile: '01559876512' },
  { name: 'حبيبة وليد فؤاد', registrationNumber: '21100113', mobile: '01121098713' },
  { name: 'كريم بسام زكي', registrationNumber: '21100114', mobile: '01210987614' },
  { name: 'هنا أيمن توفيق', registrationNumber: '21100115', mobile: '01009876515' },
  { name: 'سيف الدين مجدي', registrationNumber: '21100116', mobile: '01198765416' },
  { name: 'ليلى جمال حلمي', registrationNumber: '21100117', mobile: '01287654317' },
  { name: 'حمزة تامر عزت', registrationNumber: '21100118', mobile: '01076543218' },
  { name: 'ريم عصام غنيم', registrationNumber: '21100119', mobile: '01558765419' },
  { name: 'مازن سامح شوقي', registrationNumber: '21100120', mobile: '01165432120' },
  { name: 'جنى ياسر لطفي', registrationNumber: '21100121', mobile: '01254321021' },
  { name: 'مروان حاتم علام', registrationNumber: '21100122', mobile: '01043210922' },
  { name: 'ندى مدحت عثمان', registrationNumber: '21100123', mobile: '01132109823' },
  { name: 'أدهم رامي قاسم', registrationNumber: '21100124', mobile: '01221098724' },
  { name: 'زينة حسام بدوي', registrationNumber: '21100125', mobile: '01010987625' },
  { name: 'فارس علاء كامل', registrationNumber: '21100126', mobile: '01557654326' },
  { name: 'منة عادل شاكر', registrationNumber: '21100127', mobile: '01109876527' },
  { name: 'طارق معتز زهران', registrationNumber: '21100128', mobile: '01298765428' },
  { name: 'لجين باسم رفعت', registrationNumber: '21100129', mobile: '01087654329' },
  { name: 'ياسين محسن فايز', registrationNumber: '21100130', mobile: '01176543230' },
  { name: 'كنزي هشام متولي', registrationNumber: '21100131', mobile: '01265432131' },
  { name: 'يحيى ضياء سالم', registrationNumber: '21100132', mobile: '01556543232' }
];

async function seed() {
  console.log(`Starting to seed/update ${sampleStudents.length} students with Arabic names...`);
  let added = 0;
  let updated = 0;

  for (const student of sampleStudents) {
    const existing = await prisma.student.findUnique({
      where: { registrationNumber: student.registrationNumber }
    });

    if (existing) {
      await prisma.student.update({
        where: { id: existing.id },
        data: {
          name: student.name,
          mobile: student.mobile
        }
      });
      updated++;
    } else {
      await prisma.student.create({
        data: student
      });
      added++;
    }
  }

  const total = await prisma.student.count();
  console.log(`Finished! Added: ${added}, Updated to Arabic: ${updated}, Total in DB: ${total}`);
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
