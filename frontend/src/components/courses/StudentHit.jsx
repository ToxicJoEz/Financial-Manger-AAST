import { Search } from 'lucide-react';

// When a cycle search matches a student's name or phone number, say who matched.
export function matchingStudents(course, query) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const phone = /^[+\d\s()-]{3,}$/.test(q) ? q.replace(/[^\d+]/g, '') : '';
  return (course.enrollments || [])
    .filter(e => !e.deletedAt && e.student && !e.student.deletedAt)
    .map(e => e.student)
    .filter(s => `${s.name || ''} ${s.englishName || ''}`.toLowerCase().includes(q) || (phone && String(s.mobile || '').replace(/[^\d+]/g, '').includes(phone)));
}

export default function StudentHit({ course, query }) {
  const hits = matchingStudents(course, query);
  if (!hits.length) return null;
  return <span className="cycle-student-hit"><Search size={12} aria-hidden="true" />Student: <strong>{hits.slice(0, 3).map(s => s.name).join(', ')}</strong>{hits.length > 3 ? ` +${hits.length - 3}` : ''}</span>;
}
