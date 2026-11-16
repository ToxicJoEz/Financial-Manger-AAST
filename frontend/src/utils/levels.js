// Exam umbrellas (IELTS, CEPT, TOEFL, PTE), in Group or Private, may run cycles without a level: "IELTS - November 2026".
// Same list as the server (backend/src/utils/privateCourses.js).
const NUMBERLESS_UMBRELLAS = ['IELTS', 'CEPT', 'TOEFL', 'TOEFEL', 'PTE'];
export const allowsNoLevel = name => NUMBERLESS_UMBRELLAS.includes(String(name || '').toUpperCase().replace(/[^A-Z]/g, ''));
