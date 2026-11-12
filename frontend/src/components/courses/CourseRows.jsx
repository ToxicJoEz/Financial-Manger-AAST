import PrivateBadge from '../PrivateBadge';
import { ChevronDown, Users, GraduationCap } from 'lucide-react';
import { initials } from '../WorkspaceUI';
import { getBranchColor } from '../../utils/branchColors';
import CycleDetailsModal from './CycleDetailsModal';

import StudentHit from './StudentHit';
export default function CourseRows(props) {
 const {
  course,
  isSelected,
  onToggleSelect,
  expanded,
  onExpand
}=props;
  const date = value => value ? new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  }) : 'Not set';
  const studentCount = course.totalEnrolled ?? course.enrollments?.length ?? 0;
  return <>

    <tr className={expanded ? 'expanded-row' : ''}>
      <td className="select-column">{onToggleSelect && <input type="checkbox" aria-label={`Select ${course.name}`} checked={Boolean(isSelected)} onChange={onToggleSelect} />}</td>
      <td>
        <button className="table-title course-name" onClick={onExpand} aria-expanded={expanded}>{course.name}<PrivateBadge record={course}/></button>
        <small>{course.startDate ? date(course.startDate) : 'Dates not set'}{course.endDate ? ' — ' + date(course.endDate) : ''}</small>
        <StudentHit course={course} query={props.studentQuery} />
        {(course.isPrivate || course.parentCourse?.isPrivate) && (
          <div className="course-private-students">
            <Users size={12} className="shrink-0" />
            <span className="student-names">👤 {course.privateStudents?.length ? course.privateStudents.join(', ') : (course.enrollments?.map(e => e.student?.name).filter(Boolean).join(', ') || 'No students enrolled')}</span>
          </div>
        )}
      </td>

      <td><span className="branch-chip" style={{ '--branch-color': getBranchColor(course.branch) }}>{course.branch}</span></td>

      <td>{course.instructors.length ? <span className="instructor-cell"><span className="mini-avatar">{initials(course.instructors[0].instructor.name)}</span><span>{course.instructors[0].instructor.name}{course.instructors.length > 1 && <small>+{course.instructors.length - 1} additional employee</small>}</span></span> : <span className="muted">Unassigned</span>}</td>

      <td>

        <span className="course-table-students">

          <GraduationCap size={13} />

          <span>{studentCount}</span>

        </span>

      </td>

      <td className="tabular">{course.totalHours || '—'}<span className="muted"> h</span></td>

      <td><span className={'status-badge ' + (course.isFinished ? 'status-complete' : 'status-active')}><span />{course.isFinished ? 'Completed' : 'Active'}</span>{course.pendingAssignments?.length > 0 && <small className="pending-label">{course.pendingAssignments.length} pending approval</small>}</td>

      <td><button className={'icon-button expand-button ' + (expanded ? 'expanded' : '')} aria-label={'Details for ' + course.name} aria-expanded={expanded} onClick={onExpand}><ChevronDown size={18} /></button></td>

    </tr>

    <CycleDetailsModal {...props} />

  </>;
}
