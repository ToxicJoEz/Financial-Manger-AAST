import prisma from '../db/prisma.js';

// GET /finances?month=YYYY-MM
export const getFinances = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ error: 'Month parameter is required (YYYY-MM)' });
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Month parameter must be in YYYY-MM format (e.g. 2026-09)' });
    }

    const records = await prisma.payrollRecord.findMany({ where: { payrollMonth: month }, include: { course: { include: { parentCourse: true } } } });
    const finishedCourses = records.map(record => ({ ...record, id: record.courseId, instructors: JSON.parse(record.instructors) }));

    let totalPayroll = 0;
    let totalPaid = 0;
    let totalUnpaid = 0;
    const instructorMap = {};
    const branchMap = {};

    const coursesData = [];

    finishedCourses.forEach(course => {
      let courseTotalPayout = 0;
      const instructorNames = [];

      course.instructors.forEach(ci => {
        const hours = (ci.hoursTaught !== null && !isNaN(ci.hoursTaught)) ? ci.hoursTaught : 0;
        const rate = (ci.hourlyRate !== null && !isNaN(ci.hourlyRate)) ? ci.hourlyRate : 0;
        const payout = Math.round(hours * rate * 100) / 100;

        courseTotalPayout = Math.round((courseTotalPayout + payout) * 100) / 100;
        if (ci.instructor?.name) {
          instructorNames.push(ci.instructor.name);
        }

        if (!instructorMap[ci.instructorId] && ci.instructor) {
          instructorMap[ci.instructorId] = {
            id: ci.instructor.id,
            name: ci.instructor.name,
            employeeId: ci.instructor.employeeId,
            mobile: ci.instructor.mobile,
            coursesTaught: 0,
            courseNames: [],
            totalHours: 0,
            totalPayout: 0,
            totalPaid: 0,
            totalUnpaid: 0
          };
        }

        if (instructorMap[ci.instructorId]) {
          instructorMap[ci.instructorId].coursesTaught += 1;
          instructorMap[ci.instructorId].courseNames.push(course.name);
          instructorMap[ci.instructorId].totalHours = Math.round((instructorMap[ci.instructorId].totalHours + hours) * 100) / 100;
          instructorMap[ci.instructorId].totalPayout = Math.round((instructorMap[ci.instructorId].totalPayout + payout) * 100) / 100;
          if (course.isPaid) {
            instructorMap[ci.instructorId].totalPaid = Math.round((instructorMap[ci.instructorId].totalPaid + payout) * 100) / 100;
          } else {
            instructorMap[ci.instructorId].totalUnpaid = Math.round((instructorMap[ci.instructorId].totalUnpaid + payout) * 100) / 100;
          }
        }
      });

      totalPayroll = Math.round((totalPayroll + courseTotalPayout) * 100) / 100;
      if (course.isPaid) {
        totalPaid = Math.round((totalPaid + courseTotalPayout) * 100) / 100;
      } else {
        totalUnpaid = Math.round((totalUnpaid + courseTotalPayout) * 100) / 100;
      }

      if (!branchMap[course.branch]) {
        branchMap[course.branch] = {
          name: course.branch,
          totalPayout: 0,
          totalPaid: 0,
          totalUnpaid: 0
        };
      }
      branchMap[course.branch].totalPayout = Math.round((branchMap[course.branch].totalPayout + courseTotalPayout) * 100) / 100;
      if (course.isPaid) {
        branchMap[course.branch].totalPaid = Math.round((branchMap[course.branch].totalPaid + courseTotalPayout) * 100) / 100;
      } else {
        branchMap[course.branch].totalUnpaid = Math.round((branchMap[course.branch].totalUnpaid + courseTotalPayout) * 100) / 100;
      }

      coursesData.push({
        id: course.id,
        parentCourseId: course.course?.parentCourseId,
        courseCode: course.course?.parentCourse?.code,
        courseName: course.course?.parentCourse?.name,
        cycleNumber: course.course?.cycleNumber,
        name: course.name,
        branch: course.branch,
        instructorNames: instructorNames.join(', '),
        totalHours: course.totalHours,
        totalPayout: courseTotalPayout,
        isPaid: course.isPaid,
        instructors: course.instructors.map(ci => ({
          name: ci.instructor?.name || 'Unknown',
          hoursTaught: ci.hoursTaught,
          hourlyRate: ci.hourlyRate,
          payout: Math.round(((ci.hoursTaught || 0) * ci.hourlyRate) * 100) / 100
        }))
      });
    });

    const instructors = Object.values(instructorMap).sort((a, b) => b.totalPayout - a.totalPayout);
    const branches = Object.values(branchMap).sort((a, b) => b.totalPayout - a.totalPayout);

    const topInstructor = instructors.length > 0 ? instructors[0] : null;
    const topBranch = branches.length > 0 ? branches[0] : null;

    res.json({
      summary: {
        totalPayroll,
        totalPaid,
        totalUnpaid,
        topInstructor,
        topBranch
      },
      instructors,
      branches,
      courses: coursesData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
