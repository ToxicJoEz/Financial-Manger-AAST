import { readFileSync } from 'node:fs';
const date = value => new Date(value + 'T12:00:00Z');
export async function seedFixture(client, passwordHash) {
  await client.$transaction(async tx => {
    const accounts = JSON.parse(readFileSync(new URL('../../demo/accounts.json', import.meta.url), 'utf8'));
    for (const account of accounts) await tx.user.create({ data: { ...account, password: passwordHash, email: null, avatar: null, lastLogin: null } });
    const teacherNames = ['أحمد حسن إبراهيم', 'سارة محمد علي', 'محمود عادل مصطفى'];
    const studentNames = ['عمر أحمد حسن', 'سلمى محمود علي', 'يوسف محمد إبراهيم', 'مريم خالد حسن', 'علي مصطفى عادل', 'نور أحمد محمود', 'كريم حسن محمد', 'هنا وليد إبراهيم'];
    for (const [id,name,code] of [['course-ket','KET','1T1036'],['course-pet','PET','1T1037'],['course-ielts','IELTS','1T1038']]) await tx.course.create({ data: { id,name,code } });
    const teachers = [];
    for (let n = 1; n <= 3; n++) teachers.push(await tx.instructor.create({ data: { id: 'demo-instructor-' + n, name: teacherNames[n - 1], employeeId: 'DEMO-I' + n, branches: 'MIAMI,FOUAD', mobile: null } }));
    const students = [];
    for (let n = 1; n <= 8; n++) students.push(await tx.student.create({ data: { id: 'demo-student-' + n, name: studentNames[n - 1], registrationNumber: 'DEMO-S' + String(n).padStart(3, '0'), mobile: null } }));
    const specs = [
      { id: 'cycle-ket-12', parentCourseId: 'course-ket', cycleNumber: 12, name: 'KET 12', branch: 'MIAMI', startDate: date('2026-10-01'), endDate: date('2026-10-15'), totalHours: 24, courseFee: 1000, isFinished: true, isPaid: false, allocations: [[0,12,250],[1,12,300]], enrollments: [[0,1000,null],[1,400,null],[2,0,null],[3,0,0]] },
      { id: 'cycle-ket-13', parentCourseId: 'course-ket', cycleNumber: 13, name: 'KET 13', branch: 'FOUAD', startDate: date('2026-10-02'), endDate: date('2026-10-16'), totalHours: 10, courseFee: 800, isFinished: true, isPaid: true, allocations: [[2,10,150]], enrollments: [[4,800,null]] },
      { id: 'cycle-ket-14', parentCourseId: 'course-ket', cycleNumber: 14, name: 'KET 14', branch: 'MIAMI', startDate: date('2026-10-05'), endDate: date('2026-11-20'), totalHours: 30, courseFee: 1200, isFinished: false, isPaid: false, allocations: [[0,null,250]], enrollments: [[5,300,null],[6,0,null]] },
      { id: 'cycle-pet-1', parentCourseId: 'course-pet', cycleNumber: 1, name: 'PET 1', branch: 'FOUAD', startDate: null, endDate: null, totalHours: 12, courseFee: 600, isFinished: false, isPaid: false, allocations: [], enrollments: [[7,0,null]] },
      { id: 'cycle-pet-2', parentCourseId: 'course-pet', cycleNumber: 2, name: 'PET 2', branch: 'MIAMI', startDate: date('2026-10-01'), endDate: date('2026-10-18'), totalHours: 16, courseFee: 800, isFinished: true, isPaid: false, allocations: [[1,16,180]], enrollments: [[0,200,null],[1,800,null]] },
      { id: 'cycle-pet-3', parentCourseId: 'course-pet', cycleNumber: 3, name: 'PET 3', branch: 'FOUAD', archivedAt: date('2026-10-19'), archivedBy: 'main-admin', startDate: date('2026-10-01'), endDate: date('2026-10-12'), totalHours: 8, courseFee: 500, isFinished: true, isPaid: true, allocations: [[2,8,160]], enrollments: [[6,500,null]] },
      { id: 'cycle-ielts-1', parentCourseId: 'course-ielts', cycleNumber: 1, name: 'IELTS 1', branch: 'SMART', startDate: date('2026-10-15'), endDate: date('2026-11-30'), totalHours: 40, courseFee: 1800, isFinished: false, isPaid: false, allocations: [[2,null,300]], enrollments: [[1,0,null],[2,0,null]] }
    ];
    for (const spec of specs) {
      const { allocations, enrollments, ...data } = spec;
      const course = await tx.cycle.create({ data: { ...data, details: 'Synthetic fixture for disposable testing only.', createdAt: date('2026-10-01') } });
      for (const [index, hoursTaught, hourlyRate] of allocations) await tx.courseInstructor.create({ data: { courseId: course.id, instructorId: teachers[index].id, hoursTaught, hourlyRate } });
      if (course.isFinished) {
        const instructors = await tx.courseInstructor.findMany({ where: { courseId: course.id }, include: { instructor: true } });
        await tx.payrollRecord.create({ data: { courseId: course.id, name: course.name, branch: course.branch, totalHours: course.totalHours, isPaid: course.isPaid, instructors: JSON.stringify(instructors) } });
        for (const assignment of instructors) {
          const batch = course.isPaid ? await tx.instructorPaymentBatch.create({data:{instructorId:assignment.instructorId,instructorName:assignment.instructor.name,status:'PAID',legacy:true}}) : null;
          await tx.payrollEarning.create({data:{courseId:course.id,instructorId:assignment.instructorId,cycleName:course.name,branch:course.branch,instructorName:assignment.instructor.name,employeeId:assignment.instructor.employeeId,hours:assignment.hoursTaught,rate:assignment.hourlyRate,amountMinor:BigInt(Math.round(assignment.hoursTaught*assignment.hourlyRate*100)),batchId:batch?.id}});
        }

      }
      for (const [index, amountPaid, customFee] of enrollments) {
        const enrollment = await tx.enrollment.create({ data: { courseId: course.id, studentId: students[index].id, amountPaid, customFee, enrolledAt: date('2026-10-06') } });
        if (amountPaid) await tx.paymentEntry.create({ data: { enrollmentId: enrollment.id, courseId: course.id, studentId: students[index].id, courseName: course.name, studentName: students[index].name, amountMinor: BigInt(amountPaid * 100), kind: 'PAYMENT', note: 'Synthetic demo payment; no real money.', recordedBy: 'main-admin', occurredAt: date('2026-10-06'), idempotencyKey: 'demo-' + enrollment.id } });
      }
    }
    const requester = await tx.user.findUnique({ where: { username: 'Joe' } });
    if (requester) {
      const pending = await tx.pendingAssignment.create({ data: { courseId: 'cycle-ket-14', instructorId: teachers[1].id, submittedById: requester.id, type: 'ASSIGN' } });
      const admins = await tx.user.findMany({ where: { role: { in: ['admin','mod'] } } });
      for (const admin of admins) await tx.notification.create({ data: { userId: admin.id, title: 'Teaching request · KET 14', message: 'A demo instructor assignment is ready for review.', type: 'ASSIGNMENT_REQUEST', relatedId: pending.id } });
    }
    await tx.systemLog.create({ data: { action: 'DEMO_FIXTURE', actorUsername: 'main-admin', description: 'Local account identities retained; teaching data is synthetic. No password hashes or private contact details are bundled.' } });
  });
}
