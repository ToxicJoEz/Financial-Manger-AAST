import prisma from '../db/prisma.js';
export const privateName=value=>{
 if(typeof value!=='string'||!value.trim()||value.trim().length>200)throw Object.assign(new Error('Enter a private cycle name of 1–200 characters.'),{status:400});
 return value.trim();
};
export async function cycleNumberFor(parent,value){
 if(!parent.isPrivate)return Number(value);
 const {_max}=await prisma.cycle.aggregate({where:{parentCourseId:parent.id},_max:{cycleNumber:true}});
 return (_max.cycleNumber||0)+1;
}
export async function assertPrivateSeat(course){
 if(course.parentCourse?.isPrivate&&await prisma.enrollment.count({where:{courseId:course.id}}))throw Object.assign(new Error('This private cycle already has a student. Remove the existing enrollment before enrolling another student.'),{status:409});
}
export const privateLabel=(name,isPrivate)=>isPrivate?`${name} (Private)`:name;
