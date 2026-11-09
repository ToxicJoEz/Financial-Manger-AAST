import 'dotenv/config';
import assert from 'node:assert/strict';
import prisma from '../db/prisma.js';
import { earningData } from '../utils/payrollRecord.js';
import { EMPLOYEE_BRANCHES as branches } from '../utils/employees.js';
const date = day => new Date(`${day}T12:00:00Z`);
const midnight = day => new Date(`${day}T00:00:00Z`);
if (!process.argv.includes('--add-local-test-data'))
  throw new Error('Use --add-local-test-data to add the local sample set.');
const address = new URL(process.env.DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(address.hostname) || process.env.VERCEL === '1')
  throw new Error('This sample generator only supports local PostgreSQL.');
const usersBefore = await prisma.user.findMany({ orderBy: { id: 'asc' } });
const root = usersBefore.find(user => user.username === 'main-admin');
if (!root) throw new Error('The existing main-admin account is required.');
const actor = root.username;
try {
  await prisma.$transaction(
    async tx => {
      for (const model of [
        'course',
        'subCourse',
        'cycle',
        'student',
        'instructor',
        'enrollment',
        'payrollEarning',
        'bookPayment'
      ])
        if (await tx[model].count())
          throw new Error(
            'Sample data already exists or business records were added. Nothing was deleted or replaced.'
          );
      const courses = [];
      for (const [name, code, bookPrice, fee] of [
        ['FCE', '1T1037', 1800, 2400],
        ['KET', '1T1036', 1500, 1800],
        ['PET', '1T1033', 1200, 2000]
      ])
        courses.push({ ...(await tx.course.create({ data: { name, code, bookPrice } })), fee });
      const privateUmbrella = await tx.course.create({
        data: { name: 'CAMBRIDGE PRIVATE COURSES', code: '1T1047', isPrivate: true }
      });
      const teachers = [];
      for (const [index, name] of [
        'أحمد حسن إبراهيم',
        'سارة محمد علي',
        'محمود عادل مصطفى',
        'منى خالد عبد الله',
        'محمد سامي يوسف',
        'هبة عادل حسن',
        'كريم عمرو محمود',
        'نورا وليد إبراهيم'
      ].entries())
        teachers.push(
          await tx.instructor.create({
            data: {
              name,
              employeeId: 'TEST-I' + String(index + 1).padStart(3, '0'),
              mobile: '010' + String(20000000 + index),
              branches: branches.join(',')
            }
          })
        );
      const first = ['عمر', 'سلمى', 'يوسف', 'مريم', 'علي', 'نور', 'كريم', 'هنا'];
      const family = [
        'أحمد حسن',
        'محمود علي',
        'محمد إبراهيم',
        'خالد عبد الله',
        'مصطفى عادل',
        'وليد حسين',
        'عمرو فتحي',
        'طارق سامي'
      ];
      const students = [];
      for (let n = 0; n < 64; n++)
        students.push(
          await tx.student.create({
            data: {
              name: `${first[n % 8]} ${family[Math.floor(n / 8)]}`,
              registrationNumber: 'TEST-S' + String(n + 1).padStart(4, '0'),
              mobile: '010' + String(10000000 + n),
              dateOfBirth: date(
                `${1995 + (n % 12)}-${String(1 + (n % 12)).padStart(2, '0')}-${String(1 + (n % 27)).padStart(2, '0')}`
              ),
              nationality: n % 11 === 0 ? 'سوداني' : 'مصري',
              placeOfBirth: n % 2 ? 'القاهرة' : 'الإسكندرية'
            }
          })
        );
      const specs = [
        {
          start: '2026-08-02',
          end: '2026-08-20',
          finished: true,
          state: 'PAID',
          init: '2026-08-22',
          paid: '2026-08-25'
        },
        {
          start: '2026-09-03',
          end: '2026-09-24',
          finished: true,
          state: 'PAID',
          init: '2026-10-05',
          paid: '2026-10-10'
        },
        { start: '2026-10-01', end: '2026-10-15', finished: true, state: 'UNPAID', multiple: true },
        { start: '2026-10-02', end: '2026-10-16', finished: true, state: 'PROCESSING', init: '2026-10-20' },
        { start: '2026-10-05', end: '2026-11-15', finished: false, state: 'UNPAID' },
        {
          start: '2026-09-05',
          end: '2026-09-21',
          finished: true,
          state: 'PAID',
          init: '2026-09-25',
          paid: '2026-09-28'
        },
        { start: '2026-10-08', end: '2026-10-18', finished: true, state: 'UNPAID', sharedTeacher: true }
      ];
      const batchCache = new Map();
      // Numbered payment batches: one per initiation date, numbered by date within each month.
      const runs = new Map(),
        runCount = new Map();
      for (const day of [...new Set(specs.filter(s => s.init).map(s => s.init))].sort()) {
        const key = day.slice(0, 7);
        runCount.set(key, (runCount.get(key) || 0) + 1);
        runs.set(
          day,
          await tx.paymentRun.create({
            data: {
              year: Number(day.slice(0, 4)),
              month: Number(day.slice(5, 7)),
              number: runCount.get(key),
              initiatedDate: midnight(day),
              initiatedBy: actor
            }
          })
        );
      }
      const activeCycles = [];
      let receipt = 620000;
      // Creates one cycle with its teaching team, payroll state, enrollments, tuition ledger and books.
      // `roster` lists { student, fee, paid, books } per enrollment; `bookPrice` is the umbrella or sub-umbrella price.
      async function addCycle({ umbrella, sub, number, spec, chosen, roster, courseFee, bookPrice, index }) {
        const cycle = await tx.cycle.create({
          data: {
            parentCourseId: umbrella.id,
            subCourseId: sub?.id ?? null,
            numberingKey: sub?.id ?? umbrella.id,
            cycleNumber: number,
            name: `${sub?.name ?? umbrella.name} ${number}`,
            branch: branches[index % branches.length],
            details: 'بيانات تجريبية لاختبار التسجيل والمصروفات والكتب ورواتب المحاضرين.',
            startDate: date(spec.start),
            endDate: date(spec.end),
            isFinished: spec.finished,
            totalHours: 12,
            courseFee,
            venue: index % 2 ? 'Room A201' : 'Room 501',
            classStartTime: index % 2 ? '15:00' : '10:00',
            classEndTime: index % 2 ? '18:00' : '13:00'
          }
        });
        for (const teacher of chosen) {
          const assignment = await tx.courseInstructor.create({
            data: {
              courseId: cycle.id,
              instructorId: teacher.id,
              hourlyRate: 100 + teachers.findIndex(t => t.id === teacher.id) * 25,
              hoursTaught: spec.finished ? 12 / chosen.length : null
            }
          });
          if (spec.finished) {
            let batchId;
            if (spec.state !== 'UNPAID') {
              const key = teacher.id + ':' + spec.init;
              if (!batchCache.has(key))
                batchCache.set(
                  key,
                  await tx.instructorPaymentBatch.create({
                    data: {
                      runId: runs.get(spec.init).id,
                      instructorId: teacher.id,
                      instructorName: teacher.name,
                      status: spec.state,
                      initiatedDate: midnight(spec.init),
                      actualPaymentDate: spec.paid ? midnight(spec.paid) : null,
                      initiatedBy: actor,
                      paidBy: spec.paid ? actor : null
                    }
                  })
                );
              batchId = batchCache.get(key).id;
            }
            await tx.payrollEarning.create({
              data: {
                ...earningData({ ...cycle, parentCourse: umbrella }, { ...assignment, instructor: teacher }),
                batchId
              }
            });
          }
        }
        if (!spec.finished && !sub) activeCycles.push(cycle);
        for (const [n, { student, paid, fee, books }] of roster.entries()) {
          const customFee = fee === courseFee ? null : fee;
          const enrollment = await tx.enrollment.create({
            data: {
              courseId: cycle.id,
              studentId: student.id,
              customFee,
              amountPaid: paid,
              enrolledAt: date(spec.start)
            }
          });
          if (paid)
            await tx.paymentEntry.create({
              data: {
                enrollmentId: enrollment.id,
                courseId: cycle.id,
                studentId: student.id,
                courseName: cycle.name,
                studentName: student.name,
                amountMinor: BigInt(Math.round(paid * 100)),
                kind: 'PAYMENT',
                paymentMethod: ['CASH', 'ONLINE', 'CARD'][n % 3],
                receiptNumber: String(receipt++),
                recordedBy: actor,
                occurredAt: date(spec.start),
                note: 'دفعة تجريبية للمصروفات',
                idempotencyKey: 'sample-tuition-' + enrollment.id
              }
            });
          if ((books === 'PAID' || books === 'OLD_PRICE') && bookPrice > 0)
            await tx.bookPayment.create({
              data: {
                enrollmentId: enrollment.id,
                activeKey: enrollment.id,
                status: 'PAID',
                amountMinor: BigInt(Math.round((books === 'OLD_PRICE' ? bookPrice - 500 : bookPrice) * 100)),
                recordedAt: date(spec.start),
                recordedBy: actor
              }
            });
          else if (books === 'EXEMPT')
            await tx.bookPayment.create({
              data: {
                enrollmentId: enrollment.id,
                activeKey: enrollment.id,
                status: 'EXEMPT',
                amountMinor: 0n,
                recordedAt: date(spec.start),
                recordedBy: actor
              }
            });
        }
        return cycle;
      }
      // Group courses: 7 cycles each, 8 students per cycle (full, 20% discounted, exempt).
      for (const [courseIndex, course] of courses.entries())
        for (const [index, spec] of specs.entries()) {
          const chosen = spec.sharedTeacher
            ? [teachers[0]]
            : spec.multiple
              ? [teachers[(courseIndex + index) % 8], teachers[(courseIndex + index + 1) % 8]]
              : [teachers[(courseIndex + index) % 8]];
          const roster = Array.from({ length: 8 }, (_, n) => {
            const fee = n === 7 ? 0 : n === 5 || n === 6 ? Math.round(course.fee * 0.8) : course.fee;
            return {
              student: students[(courseIndex * 13 + index * 5 + n) % students.length],
              fee,
              paid: fee,
              books: n < 2 ? 'OLD_PRICE' : n === 2 || n === 5 ? 'PAID' : n === 3 || n === 7 ? 'EXEMPT' : 'UNPAID'
            };
          });
          await addCycle({
            umbrella: course,
            number: index + 1,
            spec,
            chosen,
            roster,
            courseFee: course.fee,
            bookPrice: course.bookPrice,
            index
          });
        }
      // Private umbrella: sub-umbrellas with their own book prices; cycles of 1-3 students.
      const subs = {};
      for (const [name, bookPrice] of [
        ['KET', 900],
        ['PET', 1000],
        ['IELTS', 1200],
        ['CEPT', 0]
      ])
        subs[name] = await tx.subCourse.create({ data: { parentCourseId: privateUmbrella.id, name, bookPrice } });
      const privateStudent = n => students[(40 + n) % students.length];
      const solo = (n, fee, books = 'UNPAID') => ({ student: privateStudent(n), fee, paid: fee, books });
      // Students sharing one fee (e.g. 7000 for 2 students = 3500 each), as merged workbook rows import.
      const shared = (first, total, count) => {
        const share = Math.round((total / count) * 100) / 100;
        return Array.from({ length: count }, (_, i) => ({
          student: privateStudent(first + i),
          fee: share,
          paid: share,
          books: i ? 'UNPAID' : 'PAID'
        }));
      };
      const privatePlan = [
        ['KET', 1, specs[0], [solo(0, 5500, 'PAID')], 5500],
        ['KET', 2, specs[2], shared(1, 15000, 3), 5000],
        ['KET', 3, specs[4], shared(4, 9000, 2), 4500],
        ['PET', 1, specs[1], shared(6, 7000, 2), 3500],
        ['PET', 2, specs[3], [solo(8, 5500)], 5500],
        ['IELTS', 1, specs[5], [solo(9, 6500, 'PAID')], 6500],
        ['IELTS', 2, specs[4], [{ student: privateStudent(10), fee: 0, paid: 0, books: 'EXEMPT' }], 6500],
        ['CEPT', 1, specs[6], shared(11, 7000, 2), 3500]
      ];
      for (const [index, [subName, number, spec, roster, courseFee]] of privatePlan.entries())
        await addCycle({
          umbrella: privateUmbrella,
          sub: subs[subName],
          number,
          spec,
          chosen: [teachers[(index + 2) % 8]],
          roster,
          courseFee,
          bookPrice: subs[subName].bookPrice,
          index
        });
      const requester = usersBefore.find(user => user.role === 'user' && user.isActive && !user.isBanned);
      if (requester) {
        for (const [index, type] of ['ASSIGN', 'REMOVE', 'REPLACE'].entries()) {
          const cycle = activeCycles[index],
            assignment = await tx.courseInstructor.findFirst({ where: { courseId: cycle.id } });
          const replacement = teachers.find(t => t.id !== assignment.instructorId);
          const request = await tx.pendingAssignment.create({
            data: {
              courseId: cycle.id,
              type,
              instructorId: type === 'REMOVE' ? assignment.instructorId : replacement.id,
              submittedById: requester.id,
              ...(type !== 'ASSIGN'
                ? { replacedAssignmentId: assignment.id, replacedInstructorId: assignment.instructorId }
                : {})
            }
          });
          for (const manager of usersBefore.filter(u => ['admin', 'mod'].includes(u.role)))
            await tx.notification.create({
              data: {
                userId: manager.id,
                title: `${type === 'REMOVE' ? 'Remove' : type === 'REPLACE' ? 'Replace' : 'Add'} instructor · ${cycle.name}`,
                message: `@${requester.username} submitted a sample instructor request.`,
                type: 'ASSIGNMENT_REQUEST',
                relatedId: request.id
              }
            });
        }
      }
      await tx.systemLog.create({
        data: {
          action: 'ADD_LOCAL_TEST_DATA',
          actorUsername: actor,
          description:
            'Added 3 group umbrellas (21 cycles), a private umbrella with 4 sub-umbrellas (8 cycles of 1-3 students), 64 Arabic students, 8 Arabic instructors, tuition/book records and salary batches. Existing users untouched.'
        }
      });
      // A partly paid batch: one payment from the October 20 batch was paid on 2 November.
      const partly = await tx.instructorPaymentBatch.findFirst({
        where: { runId: runs.get('2026-10-20').id, status: 'PROCESSING' },
        orderBy: { instructorName: 'asc' }
      });
      if (partly)
        await tx.instructorPaymentBatch.update({
          where: { id: partly.id },
          data: { status: 'PAID', actualPaymentDate: midnight('2026-11-02'), paidBy: actor }
        });
      // A cancelled batch: started, then every payment was returned to unpaid.
      const octoberCount = runCount.get('2026-10') || 0;
      const cancelledRun = await tx.paymentRun.create({
        data: {
          year: 2026,
          month: 10,
          number: octoberCount + 1,
          initiatedDate: midnight('2026-10-26'),
          initiatedBy: actor
        }
      });
      await tx.instructorPaymentBatch.create({
        data: {
          runId: cancelledRun.id,
          instructorId: teachers[3].id,
          instructorName: teachers[3].name,
          status: 'CANCELLED',
          initiatedDate: midnight('2026-10-26'),
          initiatedBy: actor
        }
      });
      assert.deepEqual(await tx.user.findMany({ orderBy: { id: 'asc' } }), usersBefore);
    },
    { timeout: 60000, isolationLevel: 'Serializable' }
  );
  const result = {};
  for (const model of [
    'course',
    'subCourse',
    'cycle',
    'student',
    'instructor',
    'enrollment',
    'bookPayment',
    'payrollEarning',
    'instructorPaymentBatch',
    'paymentRun'
  ])
    result[model] = await prisma[model].count();
  console.log(JSON.stringify(result));
  console.log('All user accounts unchanged. Sample data committed atomically.');
} finally {
  await prisma.$disconnect();
}
