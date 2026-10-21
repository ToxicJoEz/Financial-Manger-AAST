import {employeeName,employeeNumber,employeeBranches} from '../utils/employees.js';
import { hidePayroll } from '../utils/courseView.js';
import prisma, { atomic, Prisma } from '../db/prisma.js';
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
      return res.status(400).json({ error: 'Employee name is required.' });
    }
    
    // Store branches exactly as uppercase strings
    if (Array.isArray(branches)) {
      branches = branches.map(b => b.toUpperCase()).join(',');
    } else {
      branches = branches ? branches.toUpperCase() : branches;
    }

    const cleanName=employeeName(name),cleanId=employeeNumber(employeeId);
    if(!cleanName || cleanName.length>160 || cleanId.length>80 || (employeeId!=null && !['string','number'].includes(typeof employeeId)))return res.status(400).json({error:'Enter a valid employee name and employee ID (maximum 80 characters).'});
    const inst = await prisma.instructor.create({
      data: { name: cleanName, branches: employeeBranches(branches).join(','), employeeId: cleanId || null, mobile }
    });

    await logAction('CREATE_INSTRUCTOR', `Created instructor ${inst.name}`, req.user.username);
    res.status(201).json(inst);
  } catch (error) {
    res.status(error.code === 'P2002' ? 409 : 400).json({ error: error.code === 'P2002' ? 'This employee ID already exists. Edit that employee to add another branch.' : error.message });
  }
});

export const updateInstructor = atomic(async (req, res) => {
  try {
    const { id } = req.params;
    let { name, branches, employeeId, mobile } = req.body;

    const existing = await prisma.instructor.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    if (Array.isArray(branches)) {
      branches = branches.map(b => b.toUpperCase()).join(',');
    } else if (branches) {
      branches = branches.toUpperCase();
    }

    if(employeeName(name ?? existing.name).length>160 || (name!==undefined && !employeeName(name)) || employeeNumber(employeeId ?? existing.employeeId).length>80)return res.status(400).json({error:'Enter a valid employee name and employee ID.'});
    const updateData = {};
    if (name) updateData.name = employeeName(name);
    if (branches !== undefined) updateData.branches = employeeBranches(branches).join(',');
    if (employeeId !== undefined) updateData.employeeId = employeeNumber(employeeId) || null;
    if (mobile !== undefined) updateData.mobile = mobile;
    
    const inst = await prisma.instructor.update({
      where: { id },
      data: updateData
    });

    await logAction('UPDATE_INSTRUCTOR', `Updated instructor ${inst.name}`, req.user.username);
    res.json(inst);
  } catch (error) {
    res.status(error.code === 'P2002' ? 409 : 400).json({ error: error.code === 'P2002' ? 'This employee ID already exists. Edit that employee to add another branch.' : error.message });
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
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Protect historical payroll: block deletion if assigned to any completed or paid course
    if (await prisma.payrollEarning.count({ where: { instructorId: id } })) return res.status(409).json({ error: 'This instructor has recorded earnings. Their payroll history must be preserved.' });
    const completedAssignments = instructor.courseAssignments.filter(ca => ca.course.isFinished);
    if (completedAssignments.length > 0) {
      const courseNames = [...new Set(completedAssignments.map(ca => ca.course.name))].join(', ');
      return res.status(400).json({
        error: `Cannot delete instructor '${instructor.name}'. They have completed payroll history on course(s): ${courseNames}. Deleting them would destroy historical payroll and accounting records.`
      });
    }

    await prisma.instructor.delete({ where: { id } });
    await logAction('DELETE_INSTRUCTOR', `Deleted instructor ${instructor.name}`, req.user.username);
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    res.status(error.code === 'P2002' ? 409 : 400).json({ error: error.code === 'P2002' ? 'This employee ID already exists. Edit that employee to add another branch.' : error.message });
  }
});

// Separate, paginated directory: legacy assignment pickers keep their existing API.
export const getEmployeeDirectory = async (req,res) => {
 try {
  const page=Number(req.query.page ?? 1),limit=24;
  if(!Number.isInteger(page)||page<1||page>100000)return res.status(400).json({error:'Invalid directory page.'});
  const search=String(req.query.search||'').trim().slice(0,160);
  const branches=req.query.branches ? employeeBranches(req.query.branches) : [];
  const status=String(req.query.status||'all'),sort=String(req.query.sort||'name');
  if(!['all','active','inactive'].includes(status)||!['name','employeeId','active'].includes(sort))return res.status(400).json({error:'Invalid directory filter.'});
  const directory=Prisma.sql`WITH directory AS (
   SELECT i.id,i.name,i."employeeId",i.mobile,i.branches,
    COUNT(c.id) FILTER (WHERE NOT c."isFinished" AND c."archivedAt" IS NULL AND p."archivedAt" IS NULL)::int AS "activeCount",
    COUNT(c.id) FILTER (WHERE c."isFinished")::int AS "completedCount"
   FROM "Instructor" i LEFT JOIN "CourseInstructor" a ON a."instructorId"=i.id
   LEFT JOIN "Cycle" c ON c.id=a."courseId" LEFT JOIN "Course" p ON p.id=c."parentCourseId"
   WHERE (${search}='' OR strpos(lower(i.name),lower(${search}))>0 OR strpos(lower(COALESCE(i."employeeId",'')),lower(${search}))>0 OR strpos(COALESCE(i.mobile,''),${search})>0)
   AND (${branches.length===0} OR string_to_array(i.branches,',') && string_to_array(${branches.join(',')},','))
   GROUP BY i.id
  )`;
  const condition=status==='active'?Prisma.sql`"activeCount">0`:status==='inactive'?Prisma.sql`"activeCount"=0`:Prisma.sql`TRUE`;
  const order=sort==='active'?Prisma.sql`"activeCount" DESC,name ASC,id ASC`:sort==='employeeId'?Prisma.sql`"employeeId" ASC NULLS LAST,name ASC,id ASC`:Prisma.sql`name ASC,id ASC`;
  const [rows,counts]=await prisma.$transaction([
   prisma.$queryRaw(Prisma.sql`${directory} SELECT * FROM directory WHERE ${condition} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page-1)*limit}`),
   prisma.$queryRaw(Prisma.sql`${directory} SELECT COUNT(*)::int AS total FROM directory WHERE ${condition}`)
  ]);
  res.json({rows,total:counts[0].total,page,pageSize:limit});
 }catch(error){res.status(error.status||500).json({error:error.status?error.message:'Employee directory could not be loaded.'});}
};
export const getEmployeeDetails = async (req,res) => {
 try {
  const employee=await prisma.instructor.findUnique({where:{id:req.params.id},select:{id:true,name:true,employeeId:true,mobile:true,branches:true,
   courseAssignments:{orderBy:{course:{startDate:'desc'}},select:{id:true,hoursTaught:true,course:{select:{id:true,name:true,branch:true,startDate:true,endDate:true,isFinished:true,archivedAt:true,venue:true,classStartTime:true,classEndTime:true,parentCourse:{select:{id:true,name:true,code:true,archivedAt:true}}}}}}
  }});
  if(!employee)return res.status(404).json({error:'Employee not found.'});
  res.json(employee);
 }catch{res.status(500).json({error:'Employee details could not be loaded.'});}
};
