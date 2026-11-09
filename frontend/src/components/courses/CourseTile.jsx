import PrivateBadge from '../PrivateBadge';
import { classTimeLabel } from '../CycleScheduleFields';
import { BookOpen, Clock3, CalendarDays, Users, ChevronRight, GraduationCap, MapPin } from 'lucide-react';
import { Status, initials } from '../WorkspaceUI';
import { getBranchColor } from '../../utils/branchColors';
import CycleDetailsModal from './CycleDetailsModal';

const date = value =>
  value ? new Date(value).toLocaleDateString('en-GB', { year: '2-digit', day: '2-digit', month: '2-digit' }) : 'Dates to be confirmed';
const money = value => Number(value || 0).toLocaleString();

// Grid card for one cycle: header, then team and students side by side, tuition progress and schedule.
export default function CourseTile(props) {
  const { course, isSelected, onToggleSelect, expanded, onExpand } = props;
  const color = getBranchColor(course.branch);
  const isPrivate = Boolean(course.isPrivate || course.parentCourse?.isPrivate);
  const studentCount = course.totalEnrolled ?? course.enrollments?.length ?? 0;
  const studentNames = course.privateStudents?.length
    ? course.privateStudents
    : (course.enrollments || []).map(e => e.student?.name).filter(Boolean);
  const expectedTotal = course.totalExpectedRevenue ?? 0;
  const collectedTotal = course.totalCollectedRevenue || 0;
  const percent = expectedTotal > 0 ? Math.min(100, Math.round((collectedTotal / expectedTotal) * 100)) : 0;
  const lead = course.instructors[0]?.instructor;
  const schedule = classTimeLabel(course);
  return <article className={'course-tile cycle-card ' + (expanded ? 'is-expanded' : '')} style={{ '--course-color': color }}>
    <div className="course-tile-top">
      {onToggleSelect && <input type="checkbox" className="cycle-select-checkbox" aria-label={`Select ${course.name}`} checked={Boolean(isSelected)} onChange={e => { e.stopPropagation(); onToggleSelect(); }} />}
      <span className="course-tile-icon"><BookOpen size={22} strokeWidth={1.7} /></span>
      <span className="cycle-card-branch"><i style={{ background: color }} />{course.branch}</span>
      <Status complete={course.isFinished}>{course.isFinished ? 'Completed' : 'In progress'}</Status>
    </div>

    <div className="cycle-card-heading">
      <button className="course-tile-title" onClick={onExpand} aria-expanded={expanded}>{course.name}<PrivateBadge record={course} /></button>
      <div className="course-tile-date"><CalendarDays size={14} />{date(course.startDate)}{course.endDate ? ' — ' + date(course.endDate) : ''}</div>
    </div>

    <div className="cycle-card-facts">
      <section className="cycle-card-fact" aria-label="Teaching team">
        <span className="cycle-card-fact-label">Teaching team</span>
        {lead ? <div className="cycle-card-team">
          <div className="avatar-stack">{course.instructors.slice(0, 3).map((ci, index) => <span key={ci.id} style={{ '--avatar-color': ['#e5eaff', '#dcf3ef', '#ffeadc'][index] }} title={ci.instructor.name}>{initials(ci.instructor.name)}</span>)}</div>
          <div><strong dir="auto">{lead.name}</strong><small>{course.instructors.length > 1 ? `+${course.instructors.length - 1} more` : 'Cycle employee'}</small></div>
        </div> : <div className="cycle-card-team is-empty"><span className="unassigned-avatar"><Users size={16} /></span><div><strong>Not assigned</strong><small>Ready for an employee</small></div></div>}
      </section>
      <section className="cycle-card-fact" aria-label="Students">
        <span className="cycle-card-fact-label">Students{isPrivate && course.privateSeatLimit ? ` · ${course.privateSeatCount ?? studentCount}/${course.privateSeatLimit}` : ''}</span>
        <div className="cycle-card-students"><GraduationCap size={17} /><strong>{studentCount}</strong><span>{studentCount === 1 ? 'student' : 'students'}</span></div>
        {isPrivate && studentNames.length > 0 && <ul className="cycle-card-names">{studentNames.map((name, index) => <li key={index} dir="auto" title={name}>{name}</li>)}</ul>}
        {!studentCount && course.courseFee > 0 && <small className="cycle-card-muted">Fee {money(course.courseFee)} EGP</small>}
      </section>
    </div>

    {(expectedTotal > 0 || collectedTotal > 0 || studentCount > 0) && <div className="course-tuition-meter">
      <div className="tuition-meter-header">
        <span className="tuition-meter-label">Tuition collected · {percent}%</span>
        <span className="tuition-meter-amount"><strong>{money(collectedTotal)}</strong> / {money(expectedTotal)} EGP</span>
      </div>
      <div className="tuition-meter-bar" role="progressbar" aria-label="Tuition collected" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="tuition-meter-fill" style={{ '--runtime-width': `${percent}%` }} />
      </div>
    </div>}

    {course.pendingAssignments?.length > 0 && <div className="tile-pending"><Clock3 size={13} />{course.pendingAssignments.length} pending approval</div>}

    {(course.venue || schedule) && <div className="cycle-schedule-summary">{course.venue && <span><MapPin size={13} />{course.venue}</span>}{schedule && <span><Clock3 size={13} />{schedule}</span>}</div>}

    <div className="cycle-card-spacer" aria-hidden="true" />
    <div className="course-tile-footer"><span><Clock3 size={15} /><strong>{course.totalHours || '—'}</strong>hours</span><button className="text-button" onClick={onExpand} aria-expanded={expanded}>{expanded ? 'Close details' : 'Cycle details'}<ChevronRight size={16} /></button></div>

    <CycleDetailsModal {...props} />
  </article>;
}
