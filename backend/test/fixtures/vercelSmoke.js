import assert from 'node:assert/strict';
import express from 'express';
import handler from '../../../api/index.js';
import prisma from '../../src/db/prisma.js';
import { prepareRuntimeDatabase } from '../../src/utils/runtimeDatabase.js';

const api = express();
api.use((req, res) => handler(req, res));
const server = api.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/index`;
let token;
async function request(route, method = 'GET', body, overrideToken = token) {
  const response = await fetch(base + '?__route=' + route, { method, headers: { 'Content-Type': 'application/json', ...(overrideToken ? { Authorization: 'Bearer ' + overrideToken } : {}), Origin: 'https://arbitrary-test-origin.invalid' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
try {
  const health = await request('health');
  assert.equal(health.status, 200, JSON.stringify(health.data));
  assert.equal(health.headers.get('access-control-allow-origin'), '*');
  assert.equal(health.data.database, 'postgresql');
  assert.equal(prepareRuntimeDatabase(), process.env.DATABASE_URL);
  const login = await request('auth/login', 'POST', { username: 'main-admin', password: 'IsolatedDemoTest!123' });
  assert.equal(login.status, 200, JSON.stringify(login.data)); token = login.data.token;
  const adminAccount = await request('auth/login', 'POST', { username: 'Joe-admin', password: 'IsolatedDemoTest!123' });
  assert.equal(adminAccount.status, 200); assert.equal(adminAccount.data.user.role, 'admin');
  const catalog = await request('courses'); assert.equal(catalog.status, 200); assert.equal(catalog.data.length, 3);
  const courses = await request('cycles'); assert.equal(courses.status, 200); assert.equal(courses.data.length, 7);
  const roster = await request('students'); assert.equal(roster.status, 200);
  const picker = await request('students&pickerCourseId=cycle-ket-12'); assert.equal(picker.status, 200);
  assert(picker.data.students.length<=20);
  const alreadyEnrolled=await prisma.enrollment.findMany({where:{courseId:'cycle-ket-12'},select:{studentId:true}});
  assert(picker.data.students.every(s=>!alreadyEnrolled.some(e=>e.studentId===s.id)));
  const specific=await request('students&pickerCourseId=cycle-ket-12&search=demo-s005');
  assert.equal(specific.status,200);assert.equal(specific.data.students.length,1);assert.equal(specific.data.students[0].registrationNumber,'DEMO-S005');

  assert.equal(await prisma.student.count(), 8);
  const report = await request('exports', 'POST', { sheets: { courses: ['course', 'collected'], tuition: ['student', 'paid'], payroll: ['instructor', 'earned'] }, filters: { from: '2026-10-01', to: '2026-10-31' } });
  assert.equal(report.status, 200, JSON.stringify(report.data)); assert.equal(report.data.sheets[0].rows.length, 6); assert.equal(report.data.sheets[2].rows.length, 4);
  const junior = await request('auth/login', 'POST', { username: 'Joe', password: 'IsolatedDemoTest!123' }); assert.equal(junior.status, 200);
  for (const route of ['finances', 'finances/income?month=2026-10']) {
    const [path, query] = route.split('?');
    const response = await request(path + (query ? '&' + query : ''), 'GET', undefined, junior.data.token);
    assert.equal(response.status, 403);
  }
  assert.equal((await request('finances/overview&year=2026','GET',undefined,junior.data.token)).status,403);
  assert.equal((await request('finances/overview&year=invalid')).status,400);
  const yearlyCycle=await prisma.cycle.findUnique({where:{id:'cycle-ket-13'}});
  const yearlyEarning=await prisma.payrollEarning.findFirst({where:{courseId:yearlyCycle.id},include:{batch:true}});
  await prisma.cycle.update({where:{id:yearlyCycle.id},data:{startDate:new Date('2025-12-31T00:00:00Z')}});
  await prisma.instructorPaymentBatch.update({where:{id:yearlyEarning.batchId},data:{actualPaymentDate:new Date('2026-01-01T00:00:00Z')}});
  const priorYear=await request('finances/overview&year=2025');assert.equal(priorYear.status,200);assert.equal(priorYear.data.income.total,800);assert.equal(priorYear.data.payroll.totalPaid,0);
  const currentYear=await request('finances/overview&year=2026');assert.equal(currentYear.status,200);assert.equal(currentYear.data.payroll.totalPaid,1500);
  assert.equal(currentYear.data.income.total,currentYear.data.income.tuition+currentYear.data.income.books);
  await prisma.instructorPaymentBatch.update({where:{id:yearlyEarning.batchId},data:{actualPaymentDate:new Date('2027-01-01T00:00:00Z')}});
  assert.equal((await request('finances/overview&year=2026')).data.payroll.totalPaid,0);
  assert.equal((await request('finances/overview&year=2027')).data.payroll.totalPaid,1500);
  await prisma.cycle.update({where:{id:yearlyCycle.id},data:{startDate:yearlyCycle.startDate}});
  await prisma.instructorPaymentBatch.update({where:{id:yearlyEarning.batchId},data:{actualPaymentDate:null}});
  const studentDetails=await request('students/demo-student-7');assert.equal(studentDetails.status,200);assert.equal(studentDetails.data.enrollments.length,2);
  const juniorDetails=await request('students/demo-student-7','GET',undefined,junior.data.token);assert.equal(juniorDetails.status,200);assert.equal(juniorDetails.data.enrollments.length,1);assert(!JSON.stringify(juniorDetails.data).includes('hourlyRate'));
  const oneCycle=await request('cycles/cycle-ket-12','GET',undefined,junior.data.token);assert.equal(oneCycle.status,200);assert(!JSON.stringify(oneCycle.data).includes('hourlyRate'));
  assert.equal((await request('cycles/cycle-pet-3','GET',undefined,junior.data.token)).status,404);
  assert.equal((await request('students/missing-student','GET',undefined,junior.data.token)).status,404);
  await prisma.student.update({where:{id:'demo-student-7'},data:{deletedAt:new Date()}});
  assert.equal((await request('students/demo-student-7','GET',undefined,junior.data.token)).status,404);
  assert.equal((await request('students/demo-student-7')).status,200);
  await prisma.student.update({where:{id:'demo-student-7'},data:{deletedAt:null}});
  const publicCourses = await request('cycles', 'GET', undefined, junior.data.token); assert(!JSON.stringify(publicCourses.data).includes('hourlyRate'));
  assert.equal((await request('exports', 'POST', { sheets: { payroll: ['rate'] } }, junior.data.token)).status, 403);
  const jwt = (await import('jsonwebtoken')).default;
  const rootToken = jwt.sign({ username: 'main-admin', role: 'admin', jti: 'isolated-root-rejection' }, process.env.SSO_JWT_SECRET, { expiresIn: 20 });
  assert.equal((await request('auth/sso', 'POST', { token: rootToken })).status, 403);
  if(process.env.PERSISTENCE_PHASE === 'write') await prisma.student.update({where:{id:'demo-student-8'},data:{englishName:'Survives a new API process'}});
  else assert.equal((await prisma.student.findUnique({where:{id:'demo-student-8'}})).englishName,'Survives a new API process');
  console.log('PASS: PostgreSQL initialization and persistence, API rewrite, login, open CORS, privacy, SSO root isolation, October exports.');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
}
