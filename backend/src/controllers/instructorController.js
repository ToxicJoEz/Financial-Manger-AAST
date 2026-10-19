import { hidePayroll } from '../utils/courseView.js';
import prisma, { atomic } from '../db/prisma.js';
import { logAction } from '../utils/logger.js';

export const getInstructors = async (req, res) => {
  try {
    const isJunior = req.user.role === 'user';
    const instructors = await prisma.instructor.findMany({
      include: {
        courseAssignments: {
          include: { course: true }
        },
        pendingAssignments: {
          where: { status: 'PENDING' },
          include: {
            course: true,
            submittedBy: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                avatar: true,
                role: true
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    if (isJunior) {
      const sanitized = instructors.map(inst => ({
        ...inst,
        courseAssignments: inst.courseAssignments.map(({ hourlyRate, ...rest }) => rest)
      }));
      return res.json(hidePayroll(sanitized, req.user));
    }

    res.json(instructors);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const createInstructor = atomic(async (req, res) => {
  try {
    let { name, branches, employeeId, mobile } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Instructor name is required.' });
    }
    
    // Store branches exactly as uppercase strings
    if (Array.isArray(branches)) {
      branches = branches.map(b => b.toUpperCase()).join(',');
    } else {
      branches = branches ? branches.toUpperCase() : branches;
    }

    const inst = await prisma.instructor.create({
      data: { name: name.trim(), branches, employeeId, mobile }
    });

    await logAction('CREATE_INSTRUCTOR', `Created instructor ${inst.name}`, req.user.username);
    res.status(201).json(inst);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export const updateInstructor = atomic(async (req, res) => {
  try {
    const { id } = req.params;
    let { name, branches, employeeId, mobile } = req.body;

    const existing = await prisma.instructor.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Instructor not found' });
    }
    
    if (Array.isArray(branches)) {
      branches = branches.map(b => b.toUpperCase()).join(',');
    } else if (branches) {
      branches = branches.toUpperCase();
    }

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (branches !== undefined) updateData.branches = branches;
    if (employeeId !== undefined) updateData.employeeId = employeeId;
    if (mobile !== undefined) updateData.mobile = mobile;
    
    const inst = await prisma.instructor.update({
      where: { id },
      data: updateData
    });

    await logAction('UPDATE_INSTRUCTOR', `Updated instructor ${inst.name}`, req.user.username);
    res.json(inst);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export const deleteInstructor = atomic(async (req, res) => {
  try {
    const { id } = req.params;
    const instructor = await prisma.instructor.findUnique({
      where: { id },
      include: {
        courseAssignments: {
          include: { course: true }
        }
      }
    });

    if (!instructor) {
      return res.status(404).json({ error: 'Instructor not found' });
    }

    // Protect historical payroll: block deletion if assigned to any completed or paid course
    const completedAssignments = instructor.courseAssignments.filter(ca => ca.course.isFinished || ca.course.isPaid);
    if (completedAssignments.length > 0) {
      const courseNames = [...new Set(completedAssignments.map(ca => ca.course.name))].join(', ');
      return res.status(400).json({
        error: `Cannot delete instructor '${instructor.name}'. They have completed payroll history on course(s): ${courseNames}. Deleting them would destroy historical payroll and accounting records.`
      });
    }

    await prisma.instructor.delete({ where: { id } });
    await logAction('DELETE_INSTRUCTOR', `Deleted instructor ${instructor.name}`, req.user.username);
    res.json({ message: 'Instructor deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
