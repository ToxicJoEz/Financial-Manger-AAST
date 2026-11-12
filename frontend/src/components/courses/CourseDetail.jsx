import { canSeePayroll } from '../../utils/access';
import '../../styles/_cycleDetails.scss';
import PrivateBadge from '../PrivateBadge';
import RemovedEnrollments from '../RemovedEnrollments';
import { classTimeLabel } from '../CycleScheduleFields';
import StudentTuitionRow from '../StudentTuitionRow';
import { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Clock3, MapPin, CalendarDays, GraduationCap, DollarSign } from 'lucide-react';
import { Status } from '../WorkspaceUI';
import { Plus, Edit2, RotateCcw, Trash2, Archive, BookOpen, X, CheckCircle, Search, ArrowRight, Link2, Lock } from 'lucide-react';

export function CourseDetail({
  readOnly: readOnlyProp = false,
  course,
  user,
  onEdit,
  onDelete,
  onPermanentDelete,
  onRevert,
  onRemove,
  onReview,
  onFinish,
  onAssign,
  onEnroll,
  onEditEnrollment,
  onRemoveEnrollment,
  onReplace,
  onRestore,
  onPaymentsChanged,
  onNextLevel
}) {

  const manager = user.role !== 'user';
  // Branch mods: cycles they didn't create, or whose money the main mod checked, are view-only.
  const readOnly = readOnlyProp || Boolean(course.lockedReason);
  // Rates, replacements and approvals are payroll decisions: admins and the main mod only.
  const payroll = canSeePayroll(user);
  const [activeTab, setActiveTab] = useState("employees");
  const [studentSearch, setStudentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // Closing an employee's hours before the cycle ends (e.g. 15 of 20); another employee teaches the rest.
  const [closeFor, setCloseFor] = useState(null),
    [closeHoursValue, setCloseHoursValue] = useState(''),
    [busyClose, setBusyClose] = useState(false),
    [reopenFor, setReopenFor] = useState(null);
  const totalHours = Number(course.totalHours) || 0;
  const hoursLeft = Math.round((totalHours - (course.instructors || []).filter(ci => ci.closedAt).reduce((n, ci) => n + Number(ci.hoursTaught || 0), 0)) * 100) / 100;
  const startClose = ci => { setCloseFor(ci.id); setCloseHoursValue(String(hoursLeft)); };
  const refresh = () => window.dispatchEvent(new Event('assignments-updated'));
  async function closeHours(ci) {
    setBusyClose(true);
    try {
      const { data } = await axios.post(`/cycles/${course.id}/instructors/${ci.id}/close`, { hours: closeHoursValue });
      toast.success(data.message || 'Hours closed');
      setCloseFor(null);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Hours could not be closed.');
    } finally {
      setBusyClose(false);
    }
  }
  async function reopenHours(ci) {
    setBusyClose(true);
    try {
      const { data } = await axios.post(`/cycles/${course.id}/instructors/${ci.id}/reopen`);
      toast.success(data.message || 'Hours reopened');
      setReopenFor(null);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Hours could not be reopened.', { duration: 7000 });
    } finally {
      setBusyClose(false);
    }
  }
  const date = value => value ? new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  }) : 'Not set';
  const enrollments = course.enrollments || [];
  const expectedTotal = course.totalExpectedRevenue || 0;
  const collectedTotal = course.totalCollectedRevenue || 0;
  const filteredEnrollments = enrollments.filter(enr => {
    const studentName = enr.student?.name?.toLowerCase() || '';
    const regNum = enr.student?.registrationNumber?.toLowerCase() || '';
    const mobile = enr.student?.mobile?.toLowerCase() || '';
    const q = studentSearch.toLowerCase().trim();
    const paymentText = (enr.paymentSummary || []).map(p => `${p.paymentMethod} ${p.receiptNumber || ''}`).join(' ').toLowerCase();
    const matchesSearch = !q || studentName.includes(q) || regNum.includes(q) || mobile.includes(q) || (enr.student?.englishName || '').toLowerCase().includes(q) || paymentText.includes(q);
    const matchesStatus = statusFilter === 'all' || enr.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const paidCount = enrollments.filter(e => e.status === 'PAID').length;
  const partialCount = enrollments.filter(e => e.status === 'PARTIAL').length;
  const unpaidCount = enrollments.filter(e => e.status === 'UNPAID').length;
  const exemptCount = enrollments.filter(e => e.status === 'EXEMPT').length;
  return <div className="course-detail cycle-detail-layout">

      <section className="cycle-overview">
        <div className="cycle-overview-heading"><div className="cycle-heading-identity"><span className="eyebrow">{course.parentCourse?.code || course.branch}</span><h3>{course.name}<PrivateBadge record={course}/></h3><Status complete={course.isFinished}>{course.archivedAt ? 'Archived' : course.isFinished ? 'Completed' : 'In progress'}</Status>{course.details && <p>{course.details}</p>}</div><div className="cycle-date-range"><CalendarDays size={19}/><div><span>Start date</span><strong>{date(course.startDate)}</strong></div><span className="cycle-date-separator" aria-hidden="true">→</span><div><span>End date</span><strong>{date(course.endDate)}</strong></div></div></div>
        <div className="cycle-facts"><div className="cycle-fact-venue"><MapPin size={19}/><div><span>Venue / room</span><strong>{course.venue || 'Not set'}</strong></div></div><div className="cycle-fact-time"><Clock3 size={19}/><div><span>Class time</span><strong>{classTimeLabel(course) || 'Not set'}</strong></div></div><div className="cycle-fact-tuition"><DollarSign size={19}/><div><span>Standard tuition</span><strong>{Number(course.courseFee || 0).toLocaleString()} <small>EGP</small></strong>{course.isPrivate && <small className="cycle-private-books">Books · {Number(course.bookPrice||0).toLocaleString()} EGP</small>}</div></div><div className="cycle-fact-hours"><BookOpen size={19}/><div><span>Teaching hours</span><strong>{course.totalHours ?? 'Not set'}{course.totalHours != null && <small> hours</small>}</strong></div></div></div>
        {(course.previousCycle || course.nextCycles?.length > 0) && <p className="level-links"><Link2 size={14} />{course.previousCycle && <span>Follows <strong>{course.previousCycle.name}</strong></span>}{course.nextCycles?.length > 0 && <span>Continued in <strong>{course.nextCycles.map(n => n.name).join(', ')}</strong></span>}</p>}
        {manager && course.lockedReason && !readOnlyProp && <p className="cycle-lock-note" role="note"><Lock size={15} aria-hidden="true" />{course.lockedReason}</p>}
        {manager && !readOnly && <div className="cycle-action-bar"><div className="cycle-primary-actions">{course.archivedAt ? <button className="btn-secondary" onClick={onRestore}><RotateCcw size={15}/>Restore cycle</button> : <><button className="btn-secondary" onClick={onEdit}><Edit2 size={15}/>Edit details</button>{onNextLevel && <button className="btn-secondary" onClick={onNextLevel} title="New cycle for the next level, with these students and details"><ArrowRight size={15}/>Create next level</button>}{payroll && course.isFinished && !course.payrollEarnings?.length && course.instructors.length > 0 && <button className="btn-primary" onClick={onFinish} title="This completed cycle has no employee hours recorded yet">Confirm teaching hours</button>}{course.isFinished ? <button className="btn-secondary" onClick={onRevert}><RotateCcw size={15}/>Reopen cycle</button> : <button className="btn-primary" disabled={!course.instructors.length} onClick={onFinish}><CheckCircle size={15}/>Complete cycle</button>}</>}</div><div className="cycle-danger-actions">{!course.archivedAt && <button className="btn-secondary" onClick={onDelete}><Archive size={15}/>Archive</button>}<button className="btn-secondary cycle-delete-action" onClick={onPermanentDelete}><Trash2 size={15}/>Permanently delete</button></div></div>}
      </section>
      <section className="cycle-roster-panel">
        <div className="detail-subtabs">

          <button type="button" className={activeTab === "employees" ? 'active' : ''} onClick={() => setActiveTab("employees")}>

            Employees <span>{course.instructors.length}</span>

          </button>

          <button type="button" className={activeTab === 'students' ? 'active' : ''} onClick={() => setActiveTab('students')}>

            Enrolled Students <span>{enrollments.length}</span>

          </button>

        </div>



        {activeTab === "employees" ? <div className="teaching-team">

            {course.instructors.map(ci => {
              const open = !readOnly && !course.isFinished && !course.archivedAt;
              const closing = closeFor === ci.id;
              return <div className={'team-line' + (ci.closedAt ? ' is-closed' : '')} key={ci.id}>
                <span className="team-line-who">
                  <span className="team-line-name">{ci.instructor.name}</span>
                  <span className="team-line-meta">
                    {payroll && ci.hourlyRate != null && <span className="team-rate" title="Hourly rate for this cycle"><strong>{Number(ci.hourlyRate).toLocaleString()}</strong> EGP / hr</span>}
                    {ci.closedAt ? <span className="team-closed"><Lock size={12} aria-hidden="true" />Closed at {ci.hoursTaught} h</span> : ci.hoursTaught != null ? <small>{ci.hoursTaught} hours taught</small> : !payroll && <small>Cycle employee</small>}
                  </span>
                </span>
                {ci.closedAt ? payroll && !readOnly && !course.isFinished && !course.archivedAt && (reopenFor === ci.id ? <span className="close-hours-confirm"><span>Remove the unpaid {ci.hoursTaught} h from payroll?</span><button type="button" className="btn-secondary" disabled={busyClose} onClick={() => setReopenFor(null)}>Keep closed</button><button type="button" className="btn-primary" disabled={busyClose} onClick={() => reopenHours(ci)}>{busyClose ? 'Reopening…' : 'Reopen hours'}</button></span> : <button className="text-button" onClick={() => setReopenFor(ci.id)}><RotateCcw size={13} />Reopen hours</button>)
                  : open && !closing && <><button className="text-button" onClick={() => startClose(ci)} title={totalHours ? `Close this employee's hours before the cycle ends (${hoursLeft} h left)` : "Set the cycle's total hours first"} disabled={!totalHours || hoursLeft <= 0}><Lock size={13} />{payroll ? 'Close hours' : 'Request close hours'}</button><button className="text-button" onClick={() => onReplace(ci.id)}>{payroll ? "Replace" : "Request replacement"}</button><button className="icon-button danger" title={payroll ? "Remove employee" : "Request employee removal"} aria-label={'Remove ' + ci.instructor.name} onClick={() => onRemove(ci.id)}>
                    <X size={14} />
                  </button></>}
                {closing && <form className="close-hours-form" onSubmit={e => { e.preventDefault(); closeHours(ci); }}>
                  <label htmlFor={'close-' + ci.id}>Close at</label>
                  <input id={'close-' + ci.id} className="input-field" type="number" min="0.25" step="0.25" max={hoursLeft} required autoFocus value={closeHoursValue} onChange={e => setCloseHoursValue(e.target.value)} />
                  <span className="muted">of {hoursLeft} h left</span>
                  <button type="button" className="btn-secondary" disabled={busyClose} onClick={() => setCloseFor(null)}>Cancel</button>
                  <button className="btn-primary" disabled={busyClose}>{busyClose ? 'Saving…' : payroll ? 'Close hours' : 'Send request'}</button>
                </form>}
              </div>;
            })}
            {course.instructors.some(ci => ci.closedAt) && !course.isFinished && <p className="close-hours-note">Closed hours are already in payroll as unpaid. {hoursLeft > 0 ? `${hoursLeft} of ${totalHours} h are left for the other employees.` : 'Every hour of this cycle is closed.'}</p>}

            {!readOnly && !course.isFinished && !course.archivedAt && <button className="text-button" onClick={onAssign}>

                <Plus size={14} />{course.instructors.length ? "Add additional employee" : "Assign an employee"}

              </button>}

            {course.pendingAssignments?.map(pa => <div className="pending-request" key={pa.id}>

                <span>

                  <strong>{pa.type === 'CLOSE_HOURS' ? `Close hours: ${pa.instructor?.name || 'Employee'} at ${pa.hours} h` : pa.type === 'REPLACE' ? `Replacement: ${pa.instructor?.name || "Employee"}` : pa.type === 'REMOVE' ? `Removal: ${pa.instructor?.name || "Employee"}` : pa.instructor?.name || 'Assignment'}</strong>

                  <small>Requested by @{pa.submittedBy?.username}</small>

                </span>

                {payroll && !readOnly ? <button className="btn-secondary" onClick={() => onReview(pa)}>Review</button> : <span className="status-badge status-pending">Awaiting review</span>}

              </div>)}

          </div> : <div className="enrolled-students-section">

            <div className="enrollment-summary-bar">

              <div className="summary-stats">

                <span>Enrolled: <strong>{enrollments.length} Students</strong></span>{(course.retainedTuition>0||course.retainedBooks>0)&&<span>Retained from removed enrollments: <strong>{Number((course.retainedTuition||0)+(course.retainedBooks||0)).toLocaleString()} EGP</strong></span>}

                {/* Users see each student's amounts, never the cycle's totals. */}
                {course.totalCollectedRevenue !== undefined && <>

                    <span>Tuition: <strong>{collectedTotal.toLocaleString()} EGP</strong></span><span>Books: <strong>{Number(course.totalBookRevenue || 0).toLocaleString()} EGP</strong></span><span>Total income: <strong>{Number(course.totalIncome ?? collectedTotal).toLocaleString()} EGP</strong></span>

                    {expectedTotal > collectedTotal && <span className="courses-presentation-3">Remaining: <strong>{(expectedTotal - collectedTotal).toLocaleString()} EGP</strong></span>}

                  </>}

              </div>

              {!readOnly && manager && <button className="btn-primary courses-presentation-4" disabled={!!course.archivedAt || course.isFinished || course.privateSeatOccupied} title={course.isFinished ? 'This cycle is completed. Reopen it to add students.' : course.privateSeatOccupied?`This private cycle is full (${course.privateSeatLimit} students)`:""} onClick={onEnroll}>

                <Plus size={13} /> {course.privateSeatOccupied ? `Private cycle full (${course.privateSeatCount}/${course.privateSeatLimit})` : course.isPrivate ? `Enroll student (${course.privateSeatCount}/${course.privateSeatLimit})` : "Enroll student"}

              </button>}

            </div>



            {enrollments.length > 0 && <div className="course-student-toolbar">

                <div className="course-student-search-box">

                  <Search size={14} className="search-icon" />

                  <input type="text" placeholder="Search enrolled students..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />

                </div>

                <div className="course-student-filter-pills">

                  <button type="button" className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>

                    All ({enrollments.length})

                  </button>

                  <button type="button" className={statusFilter === 'PAID' ? 'active' : ''} onClick={() => setStatusFilter('PAID')}>

                    Paid ({paidCount})

                  </button>

                  {partialCount > 0 && <button type="button" className={statusFilter === 'PARTIAL' ? 'active' : ''} onClick={() => setStatusFilter('PARTIAL')}>

                      Partial ({partialCount})

                    </button>}

                  {unpaidCount > 0 && <button type="button" className={statusFilter === 'UNPAID' ? 'active' : ''} onClick={() => setStatusFilter('UNPAID')}>

                      Unpaid ({unpaidCount})

                    </button>}

                  {exemptCount > 0 && <button type="button" className={statusFilter === 'EXEMPT' ? 'active' : ''} onClick={() => setStatusFilter('EXEMPT')}>

                      Exempt ({exemptCount})

                    </button>}

                </div>

              </div>}



            {filteredEnrollments.length === 0 ? <div className="empty-state compact">

                <GraduationCap size={22} />

                <p className="courses-presentation-5">

                  {enrollments.length === 0 ? 'No students enrolled in this course yet.' : 'No students match your filter criteria.'}

                </p>

                {enrollments.length === 0 && !readOnly && manager ? course.isFinished ? <span className="muted">This cycle is completed. Reopen it to add students.</span> : <button className="text-button" disabled={!!course.archivedAt || course.privateSeatOccupied} title={course.privateSeatOccupied?`This private cycle is full (${course.privateSeatLimit} students)`:""} onClick={onEnroll}>

                    <Plus size={13} /> Enroll first student

                  </button> : <button className="text-button" onClick={() => {
            setStudentSearch('');
            setStatusFilter('all');
          }}>

                    Reset student filter

                  </button>}

              </div> : <div className="enrollment-list">

                {filteredEnrollments.map(enr => <StudentTuitionRow key={enr.id} course={course} enrollment={enr} manager={manager} readOnly={readOnly} onBooksChanged={onPaymentsChanged} onEdit={() => onEditEnrollment(enr)} onRemove={() => onRemoveEnrollment(enr)} />)}
              </div>}
              {manager&&!readOnly&&<RemovedEnrollments courseId={course.id} refreshKey={(course.enrollments||[]).map(row=>row.id).join(',')} onSaved={onPaymentsChanged}/>}

          </div>}

      </section>

    </div>;
}
