import PrivateBadge from '../components/PrivateBadge';
import RemovedEnrollments from '../components/RemovedEnrollments';
import EnrollmentRemovalFields from '../components/EnrollmentRemovalFields';
import CycleScheduleFields, { classTimeLabel } from '../components/CycleScheduleFields';
import '../styles/_cycleDetails.scss';
import AssignmentReviewDialog from '../components/AssignmentReviewDialog';
import PermanentDeleteDialog from '../components/PermanentDeleteDialog';
import CycleImportDialog from '../components/CycleImportDialog';
import { tuitionOutstanding, instructorPaymentOutstanding } from '../utils/coursePayments';
import ExcelExportButton from '../components/ExcelExportButton';
import EnrollmentDialog from '../components/EnrollmentDialog';
import FinancialRemovalChoice from '../components/FinancialRemovalChoice';
import StudentTuitionRow from '../components/StudentTuitionRow';
import { AnimatePresence } from 'framer-motion';
import { MotionRegion, MotionTab } from '../components/WorkspaceMotion';
import Dialog from '../components/Dialog';
import { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronDown, ArrowUpRight, Clock3, MapPin, LayoutGrid, List, CalendarDays, Users, ChevronRight, AlertTriangle, GraduationCap, DollarSign } from 'lucide-react';
import { PageHeading, EmptyState, Status, initials } from '../components/WorkspaceUI';
import { Plus, Edit2, RotateCcw, Trash2, Archive, BookOpen, X, CheckCircle, Search, Filter, ClipboardCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext';
import { BRANCHES, BRANCH_OPTIONS } from '../Constants';
import CustomFilterDropdown from '../components/CustomFilterDropdown';
import { getBranchColor } from '../utils/branchColors';
const Courses = () => {
  const {
    user
  } = useContext(AuthContext);
  const { courseId: parentId } = useParams();
  const dataRequest = useRef(0);
  const [importOpen, setImportOpen] = useState(false);
  const [parentCourse, setParentCourse] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [view, setView] = useState(() => localStorage.getItem('aast-course-view') || 'grid');
  const [loadError, setLoadError] = useState(false);
  const [courses, setCourses] = useState([]);
  const [instructorsList, setInstructorsList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [replacementAssignmentId, setReplacementAssignmentId] = useState(null);
  const removalBusy=useRef(false);
  const [removalSaving,setRemovalSaving]=useState(false);
  const [removalOptions,setRemovalOptions]=useState({mode:'KEEP',tuitionReduction:0,bookReduction:0,confirm:false});
  const [keepEnrollmentFinancials, setKeepEnrollmentFinancials] = useState(true);
  const [confirmEnrollmentRemoval, setConfirmEnrollmentRemoval] = useState(false);

  // Edit & Delete

  const [editingCourse, setEditingCourse] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [permanentTarget, setPermanentTarget] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  // Form states

  const [name, setName] = useState('');
  const [privateCycleName,setPrivateCycleName]=useState(''),[privateBookPrice,setPrivateBookPrice]=useState('0');
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [totalHours, setTotalHours] = useState('');
  const [courseFee, setCourseFee] = useState('');
  const [schedule, setSchedule] = useState({});
  const [details, setDetails] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Filter states

  const [filterName, setFilterName] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterStatus, setFilterStatus] = useState(''); // '', 'active', 'finished'

  // Enrollment State

  const [enrollingCourse, setEnrollingCourse] = useState(null);
  const [enrollSession,setEnrollSession]=useState(0);

  // Edit Enrollment State

  const [editingEnrollment, setEditingEnrollment] = useState(null);
  const [editFeeType, setEditFeeType] = useState('standard');
  const [editCustomFee, setEditCustomFee] = useState('');

  // Noticeable Warning for Removing Paid Student

  const [removingEnrollment, setRemovingEnrollment] = useState(null);

  // Assign state

  const [assignCourseId, setAssignCourseId] = useState(null);
  const [newInstructorId,setNewInstructorId]=useState(''),[newInstructorRate,setNewInstructorRate]=useState('');
  const [selectedInstructorId, setSelectedInstructorId] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');

  // Review State

  const [reviewingAssignment, setReviewingAssignment] = useState(null);

  // Finish state

  const [finishingCourse, setFinishingCourse] = useState(null);
  const [finishTotalHours, setFinishTotalHours] = useState('');
  const [instructorHours, setInstructorHours] = useState({});
  useEffect(() => {
    fetchData();
    const refreshAssignments = () => fetchData();
    window.addEventListener('assignments-updated', refreshAssignments);
    return () => window.removeEventListener('assignments-updated', refreshAssignments);
  }, [parentId]);
  const fetchData = async () => {
    const request = ++dataRequest.current;
    setLoadError(false);
    try {
      const [coursesRes, instructorsRes, parentRes] = await Promise.all([axios.get('/cycles', { params: parentId ? { parentCourseId: parentId } : {} }), axios.get('/instructors'), parentId ? axios.get('/courses/' + parentId) : Promise.resolve({ data: null })]);
      if (request !== dataRequest.current) return;
      setParentCourse(parentRes.data);
      if (parentRes.data?.archivedAt) setFilterStatus('archived');
      setCourses(coursesRes.data);
      setInstructorsList(instructorsRes.data);
    } catch (error) {
      if (request !== dataRequest.current) return;
      setLoadError(true);
      toast.error('Could not load cycles. Please try again.');
    } finally {
      if (request === dataRequest.current) setLoading(false);
    }
  };
  const handleAddSubmit = async e => {
    e.preventDefault();
    try {
      await axios.post('/cycles', {
        ...schedule, name:privateCycleName,bookPrice:privateBookPrice,parentCourseId: parentId, cycleNumber: name,instructorId:newInstructorId||undefined,hourlyRate:newInstructorId?newInstructorRate:undefined,
        branch,
        details,
        startDate: startDate || null,
        endDate: endDate || null,
        totalHours: totalHours || null,
        courseFee: courseFee || 0
      });
      toast.success('Cycle created');
      setIsAddModalOpen(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create course');
    }
  };
  const handleEditSubmit = async e => {
    e.preventDefault();
    if (editSaving) return;
    setEditSaving(true);
    try {
      await axios.put(`/cycles/${editingCourse.id}`, {
        venue: editingCourse.venue, classStartTime: editingCourse.classStartTime, classEndTime: editingCourse.classEndTime,
        cycleNumber: editingCourse.cycleNumber,name:editingCourse.name,bookPrice:editingCourse.bookPrice,
        branch: editingCourse.branch,
        details: editingCourse.details,
        startDate: editingCourse.startDate || null,
        endDate: editingCourse.endDate || null,
        isFinished: editingCourse.isFinished,
        totalHours: editingCourse.totalHours || null,
        courseFee: editingCourse.courseFee || 0
      });
      toast.success('Cycle updated');
      setEditingCourse(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Update failed');
    } finally { setEditSaving(false); }
  };
  const confirmDelete = async () => {
    try {
      await axios.delete(`/cycles/${deleteId}`);
      toast.success('Cycle archived');
      setDeleteId(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Archive failed');
    }
  };
  const handleAssignSubmit = async e => {
    e.preventDefault();
    try {
      const payload = {
        instructorId: selectedInstructorId || null
      };
      if (user.role !== 'user') {
        payload.hourlyRate = hourlyRate;
      }
      const res = await axios.post(replacementAssignmentId ? `/cycles/${assignCourseId}/instructors/${replacementAssignmentId}/replace` : `/cycles/${assignCourseId}/instructors`, payload);
      if (res.data.pending) {
        toast.success('Assignment request submitted for approval');
      } else {
        toast.success("Employee assigned");
      }
      setIsAssignModalOpen(false);
      setAssignCourseId(null);
      setSelectedInstructorId('');
      setHourlyRate('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Assignment failed');
    }
  };
  const handleRevertFinish = courseId => {
    setConfirmAction({
      title: 'Revert Course',
      message: 'Reopen this course? Its existing payroll, recorded hours, payment status, and student payments will be retained.',
      confirmText: 'Revert',
      confirmColor: "appearance-bg-amber-600 appearance-text-white appearance-hover-bg-amber-700",
      titleColor: "appearance-text-amber-700",
      action: async () => {
        try {
          await axios.post(`/cycles/${courseId}/revert`);
          toast.success('Course reverted to active');
          fetchData();
        } catch (error) {
          toast.error('Failed to revert course');
        }
      }
    });
  };
  const handleRemoveInstructor = (courseId, courseInstructorId) => {
    const isJunior = user?.role === 'user';
    setConfirmAction({
      title: isJunior ? "Request Employee Removal" : "Remove Employee",
      message: isJunior ? "Are you sure you want to request removing this employee? A manager will review your request." : "Are you sure you want to remove this employee from the course?",
      confirmText: isJunior ? 'Submit Request' : 'Remove',
      confirmColor: "appearance-bg-red-600 appearance-text-white appearance-hover-bg-red-700",
      titleColor: "appearance-text-red-700",
      action: async () => {
        try {
          const res = await axios.delete(`/cycles/${courseId}/instructors/${courseInstructorId}`);
          toast.success(res.data?.message || "Employee removed");
          fetchData();
        } catch (error) {
          toast.error(error.response?.data?.error || "Failed to remove employee");
        }
      }
    });
  };
  const confirmMarkFinished = async e => {
    e.preventDefault();
    try {
      const ih = Object.keys(instructorHours).map(id => ({
        courseInstructorId: id,
        hoursTaught: instructorHours[id]
      }));
      await axios.post(`/cycles/${finishingCourse.id}/finish`, {
        totalHours: finishTotalHours,
        instructorHours: ih
      });
      toast.success('Course marked as finished');
      setFinishingCourse(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to finish course');
    }
  };
  const resetForm = () => {
    setNewInstructorId('');setNewInstructorRate('');
    setName('');setPrivateCycleName('');setPrivateBookPrice('0');
    setBranch(BRANCHES[0]);
    setTotalHours('');
    setCourseFee(''); setSchedule({});
    setDetails('');
    setStartDate('');
    setEndDate('');
  };
  const handleOpenEnroll = course => {setEnrollSession(n=>n+1);setEnrollingCourse(course);};
  const handleOpenEditEnrollment = (course, enrollment) => {
    setEditingEnrollment({
      courseId: course.id,
      courseName: course.name,
      enrollment
    });
    if (enrollment.customFee === 0) {
      setEditFeeType('waive');
      setEditCustomFee('');
    } else if (enrollment.customFee !== null && enrollment.customFee !== undefined) {
      setEditFeeType('custom');
      setEditCustomFee(String(enrollment.customFee));
    } else {
      setEditFeeType('standard');
      setEditCustomFee('');
    }
  };
  const handleEditEnrollmentSubmit = async e => {
    e.preventDefault();
    try {
      let customFeePayload = null;
      if (editFeeType === 'waive') customFeePayload = 0;else if (editFeeType === 'custom') customFeePayload = editCustomFee ? parseFloat(editCustomFee) : null;
      await axios.put(`/cycles/${editingEnrollment.courseId}/enrollments/${editingEnrollment.enrollment.id}`, {
        customFee: customFeePayload
      });
      toast.success('Enrollment payment updated');
      setEditingEnrollment(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update payment');
    }
  };
  const handleRequestRemoveEnrollment = (course, enrollment) => {
    setRemovalOptions({mode:'KEEP',tuitionReduction:0,bookReduction:0,confirm:false});
    setKeepEnrollmentFinancials(true);
    setConfirmEnrollmentRemoval(false);
    setRemovingEnrollment({
      courseId: course.id,
      courseName: course.name,
      enrollment
    });
  };
  const handleConfirmRemoveEnrollment = async () => {
    if (!removingEnrollment||removalBusy.current) return;
    removalBusy.current=true;setRemovalSaving(true);
    try {
      const {
        courseId,
        enrollment
      } = removingEnrollment;
      const res = await axios.delete(`/cycles/${courseId}/enrollments/${enrollment.id}`, {
        data: {
          ...removalOptions
        }
      });
      toast.success(res.data.pending ? res.data.message : `Removed ${enrollment.student.name} from course`);
      window.dispatchEvent(new Event('notifications-updated'));
      setRemovingEnrollment(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to remove student');
    }finally{removalBusy.current=false;setRemovalSaving(false);}
  };
  const isAnyFilterActive = Boolean(filterName || filterBranch || filterStatus);
  const clearAllFilters = () => {
    setFilterName('');
    setFilterBranch('');
    setFilterStatus('');
  };

  // Filter logic

  const filteredCourses = courses.filter(c => {
    if (filterStatus === 'archived' ? !c.archivedAt : !!c.archivedAt) return false;
    const q = filterName.toLowerCase().trim();
    const matchSearch = q ? c.name.toLowerCase().includes(q) || c.branch.toLowerCase().includes(q) || c.instructors?.some(ci => ci.instructor?.name?.toLowerCase().includes(q)) : true;
    const matchBranch = filterBranch ? c.branch === filterBranch : true;
    let matchStatus = true;
    if (filterStatus === 'active') matchStatus = !c.isFinished;
    if (filterStatus === 'finished') matchStatus = c.isFinished;
    if (filterStatus === 'unassigned') matchStatus = !c.isFinished && c.instructors.length === 0;
    if (filterStatus === 'pending') matchStatus = c.pendingAssignments?.length > 0;
    if (filterStatus === 'tuition-due') matchStatus = tuitionOutstanding(c);
    if (filterStatus === 'payroll-due') matchStatus = instructorPaymentOutstanding(c, user.role);
    return matchSearch && matchBranch && matchStatus;
  });
  useEffect(() => {
    if (loading || !location.state) return;
    const {
      search,
      status,
      create,
      openReviewId,
      branch: requestedBranch
    } = location.state;
    if (requestedBranch) setFilterBranch(requestedBranch);
    if (search) setFilterName(search);
    if (status) setFilterStatus(status);
    if (create && user.role !== 'user') { if (!parentId) { navigate('/courses', { state: { create: true }, replace: true }); return; } setName(String(parentCourse?.nextCycleNumber || '')); setIsAddModalOpen(true); }
    if (openReviewId && user.role !== 'user') {
      const course = courses.find(c => c.pendingAssignments?.some(p => p.id === openReviewId));
      if (course) {
        setReviewingAssignment(course.pendingAssignments.find(p => p.id === openReviewId));
        setExpandedCourse(null);
      }
    }
    navigate(location.pathname, {
      replace: true,
      state: null
    });
  }, [loading, location.state, courses, navigate, location.pathname, user.role]);
  if (loading) return <div className="loading-state"><span className="loading-spinner" />Loading cycles…</div>;
  if (loadError) return <section className="panel"><EmptyState title="Courses couldn’t be loaded" description="Check your connection and try again."><button className="btn-primary" onClick={fetchData}>Try again</button></EmptyState></section>;
  const editForm = editingCourse ? (
            <form onSubmit={handleEditSubmit} className="cycle-inline-edit">

              {editingCourse.isPrivate||editingCourse.parentCourse?.isPrivate ? <><div><label className="input-label" htmlFor="edit-private-name">Private cycle name *</label><input id="edit-private-name" className="input-field" required maxLength={200} value={editingCourse.name} onChange={e=>setEditingCourse({...editingCourse,name:e.target.value})}/></div><div><label className="input-label" htmlFor="edit-private-books">Book price (EGP) *</label><input id="edit-private-books" className="input-field" required type="number" min="0" step="0.01" value={editingCourse.bookPrice??0} onChange={e=>setEditingCourse({...editingCourse,bookPrice:e.target.value})}/><small className="muted">Previous payments keep their original price.</small></div></> : <div>

                <label className="input-label appearance-text-emerald-900">Cycle number</label>

                <input type="number" min="1" max="2147483647" step="1" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={editingCourse.cycleNumber} onChange={e => setEditingCourse({
                ...editingCourse,
                cycleNumber: e.target.value
              })} required />

              </div>}

              <div>

                <label className="input-label appearance-text-emerald-900">Branch</label>

                <CustomFilterDropdown options={BRANCH_OPTIONS} value={editingCourse.branch} onChange={val => setEditingCourse({
                ...editingCourse,
                branch: val
              })} />

              </div>

              <div>

                <label className="input-label appearance-text-emerald-900">Details / Description</label>

                <textarea className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500 min-h-[80px]" value={editingCourse.details || ''} onChange={e => setEditingCourse({
                ...editingCourse,
                details: e.target.value
              })} />

              </div>

              <div className="flex gap-4">

                <div className="flex-1">

                  <label className="input-label appearance-text-emerald-900">Start Date</label>

                  <input type="date" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={editingCourse.startDate ? editingCourse.startDate.split('T')[0] : ''} onChange={e => setEditingCourse({
                  ...editingCourse,
                  startDate: e.target.value
                })} />

                </div>

                <div className="flex-1">

                  <label className="input-label appearance-text-emerald-900">End Date</label>

                  <input type="date" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={editingCourse.endDate ? editingCourse.endDate.split('T')[0] : ''} onChange={e => setEditingCourse({
                  ...editingCourse,
                  endDate: e.target.value
                })} />

                </div>

              </div>

              <CycleScheduleFields value={editingCourse} onChange={setEditingCourse} />
<div className="flex gap-4">

                <div className="flex-1">

                  <label className="input-label appearance-text-emerald-900">Total Cycle Hours</label>

                  <input type="number" step="0.5" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={editingCourse.totalHours || ''} onChange={e => setEditingCourse({
                  ...editingCourse,
                  totalHours: e.target.value
                })} />

                </div>

                <div className="flex-1">

                  <label className="input-label appearance-text-emerald-900">Tuition Fee (EGP)</label>

                  <input type="number" step="100" min="0" placeholder="e.g. 3500" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={editingCourse.courseFee || ''} onChange={e => setEditingCourse({
                  ...editingCourse,
                  courseFee: e.target.value
                })} />

                </div>

              </div>

              <div className="flex justify-end gap-3 appearance-mt-4">

                <button type="button" onClick={() => setEditingCourse(null)} className="btn-secondary">Cancel</button>

                <button type="submit" disabled={editSaving} className="btn-primary">{editSaving ? 'Saving…' : 'Save changes'}</button>

              </div>

            </form>
  ) : null;
  return <div className="courses-page cycles-page">

      <nav className="course-breadcrumb" aria-label="Breadcrumb"><Link to="/courses">Courses</Link><ChevronRight size={14} /><span>{parentCourse?.name || 'All cycles'}</span></nav>
      <PageHeading eyebrow={parentCourse?.code || 'Across the academy'} title={parentCourse ? `${parentCourse.name} cycles` : 'All cycles'} description="Every cycle has its own teaching team, students, and financial records.">

        <ExcelExportButton parentCourseId={parentId} />
        <PrivateBadge record={parentCourse}/>{user.role !== 'user' && parentCourse && !parentCourse.archivedAt && <button className="btn-primary" onClick={() => { resetForm(); setName(String(parentCourse.nextCycleNumber || '')); setIsAddModalOpen(true); }}><Plus size={16} />New cycle</button>}

        <PrivateBadge record={parentCourse}/>{user.role !== 'user' && parentCourse && !parentCourse.archivedAt && <button className="btn-secondary" onClick={() => setImportOpen(true)}>Import cycle from Excel</button>}
      </PageHeading>

      <div className="section-tabs" aria-label="Course status">

        {[['', 'All cycles', courses.filter(c => !c.archivedAt).length], ['active', 'Active', courses.filter(c => !c.archivedAt && !c.isFinished).length], ['finished', 'Completed', courses.filter(c => !c.archivedAt && c.isFinished).length], ['tuition-due', 'Tuition outstanding', courses.filter(tuitionOutstanding).length], ...(user.role !== 'user' ? [['payroll-due', "Employee payments due", courses.filter(c => instructorPaymentOutstanding(c, user.role)).length]] : []), ['pending', 'Pending approval', courses.filter(c => !c.archivedAt && c.pendingAssignments?.length).length], ...(user.role !== 'user' ? [['archived', 'Archived', courses.filter(c => c.archivedAt).length]] : [])].map(([value, label, count]) => <MotionTab key={value} active={filterStatus === value} onClick={() => setFilterStatus(value)}>{label}<span>{count}</span></MotionTab>)}

      </div>

      {filterStatus === 'tuition-due' && <p className="payment-view-note">Courses with remaining student tuition, including partial payments. Retained financial records still count; archived financial records do not.</p>}
      {filterStatus === 'payroll-due' && <p className="payment-view-note">Completed courses with unpaid employee earnings. Employee payments are settled after course completion.</p>}
      <section className={view === 'grid' ? 'course-collection' : 'panel course-collection list-view'}>

        <div className="filter-toolbar">

          <div className="search-field"><Search size={17} /><input aria-label="Search cycles" placeholder="Search cycles, employees, or branches…" value={filterName} onChange={e => setFilterName(e.target.value)} /></div>

          <div className="filter-select"><CustomFilterDropdown value={filterBranch} onChange={setFilterBranch} options={BRANCH_OPTIONS} placeholder="All branches" /></div>

          {isAnyFilterActive && <button className="text-button" onClick={clearAllFilters}><X size={14} />Reset</button>}

          <span className="result-count">{filteredCourses.length} cycles</span><div className="view-switch" aria-label="Cycle view"><button aria-label="Card view" aria-pressed={view === 'grid'} className={view === 'grid' ? 'active' : ''} onClick={() => {
            setView('grid');
            localStorage.setItem('aast-course-view', 'grid');
          }}><LayoutGrid size={17} /></button><button aria-label="List view" aria-pressed={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => {
            setView('list');
            localStorage.setItem('aast-course-view', 'list');
          }}><List size={18} /></button></div>

        </div>

        <MotionRegion transitionKey={view + ':' + filterStatus + ':' + filterBranch}>

        {view === 'grid' ? <div className="course-grid">{filteredCourses.map(course => <CourseTile key={course.id} course={course} editForm={editingCourse?.id === course.id ? editForm : null} onCancelEdit={() => { if (!editSaving) setEditingCourse(null); }} expanded={expandedCourse === course.id} user={user} onPaymentsChanged={fetchData} onReplace={assignmentId => {
            setReplacementAssignmentId(assignmentId);
            setAssignCourseId(course.id);
            setSelectedInstructorId('');
            setHourlyRate('');
            setExpandedCourse(null);
            setIsAssignModalOpen(true);
          }} onRestore={async () => {
            await axios.post(`/cycles/${course.id}/restore`);
            fetchData();
          }} onExpand={() => { if (editSaving) return; setEditingCourse(null); setExpandedCourse(expandedCourse === course.id ? null : course.id); }} onAssign={() => {
            setReplacementAssignmentId(null);
            setAssignCourseId(course.id);
            setIsAssignModalOpen(true);
            setSelectedInstructorId('');
            setHourlyRate('');
          }} onEdit={() => setEditingCourse(course)} onPermanentDelete={() => setPermanentTarget(course)} onDelete={() => setDeleteId(course.id)} onRevert={() => handleRevertFinish(course.id)} onRemove={id => handleRemoveInstructor(course.id, id)} onReview={setReviewingAssignment} onFinish={() => {
            setFinishingCourse(course);
            setFinishTotalHours(course.totalHours || '');
            const ih = {};
            course.instructors.forEach(ci => {
              ih[ci.id] = course.instructors.length === 1 ? course.totalHours || '' : '';
            });
            setInstructorHours(ih);
          }} onEnroll={() => handleOpenEnroll(course)} onEditEnrollment={enr => handleOpenEditEnrollment(course, enr)} onRemoveEnrollment={enr => handleRequestRemoveEnrollment(course, enr)} />)}</div> : <div className="table-scroll"><table className="data-table course-ledger"><thead><tr><th>Course</th><th>Branch</th><th>Teaching team</th><th>Students</th><th>Hours</th><th>Status</th><th aria-label="Details" /></tr></thead><tbody>{filteredCourses.map(course => <CourseRows key={course.id} course={course} editForm={editingCourse?.id === course.id ? editForm : null} onCancelEdit={() => { if (!editSaving) setEditingCourse(null); }} expanded={expandedCourse === course.id} user={user} onPaymentsChanged={fetchData} onReplace={assignmentId => {
                setReplacementAssignmentId(assignmentId);
                setAssignCourseId(course.id);
                setSelectedInstructorId('');
                setHourlyRate('');
                setExpandedCourse(null);
                setIsAssignModalOpen(true);
              }} onRestore={async () => {
                await axios.post(`/cycles/${course.id}/restore`);
                fetchData();
              }} onExpand={() => { if (editSaving) return; setEditingCourse(null); setExpandedCourse(expandedCourse === course.id ? null : course.id); }} onAssign={() => {
                setReplacementAssignmentId(null);
                setAssignCourseId(course.id);
                setIsAssignModalOpen(true);
                setSelectedInstructorId('');
                setHourlyRate('');
              }} onEdit={() => setEditingCourse(course)} onPermanentDelete={() => setPermanentTarget(course)} onDelete={() => setDeleteId(course.id)} onRevert={() => handleRevertFinish(course.id)} onRemove={id => handleRemoveInstructor(course.id, id)} onReview={setReviewingAssignment} onFinish={() => {
                setFinishingCourse(course);
                setFinishTotalHours(course.totalHours || '');
                    const ih = {};
                course.instructors.forEach(ci => {
                  ih[ci.id] = course.instructors.length === 1 ? course.totalHours || '' : '';
                });
                setInstructorHours(ih);
              }} onEnroll={() => handleOpenEnroll(course)} onEditEnrollment={enr => handleOpenEditEnrollment(course, enr)} onRemoveEnrollment={enr => handleRequestRemoveEnrollment(course, enr)} />)}</tbody></table></div>}

        {!filteredCourses.length && <div className="empty-state"><BookOpen size={28} /><h3>{courses.length ? 'No matching cycles' : 'A fresh start for your courses'}</h3><p>{courses.length ? 'Try a different search or reset your filters.' : 'Create the first cycle for this course to get started.'}</p>{courses.length > 0 && <button className="btn-secondary" onClick={clearAllFilters}>Reset filters</button>}</div>}

        </MotionRegion>

        <div className="panel-footnote">Showing {filteredCourses.length} of {courses.length} cycles<span>Expand a cycle to manage its details</span></div>

      </section>



      {/* Add Course Modal */}

      <AnimatePresence>{user.role !== 'user' && importOpen && parentCourse && <CycleImportDialog parent={parentCourse} instructors={instructorsList} manager={user.role !== 'user'} onClose={() => setImportOpen(false)} onImported={() => { setFilterName(''); setFilterBranch(''); setFilterStatus(''); return fetchData(); }} onSaved={async result => { setImportOpen(false); setFilterName(''); setFilterBranch(''); setFilterStatus(''); await fetchData(); setExpandedCourse(result.cycleId); toast.success(`${result.cycleName} imported`); }} />}</AnimatePresence>
      <AnimatePresence>{isAddModalOpen && <Dialog title="Create cycle" onClose={() => setIsAddModalOpen(false)}>

          <div className="modal-content card max-w-lg w-full relative">

            <h3 className="appearance-text-xl appearance-font-bold appearance-mb-4 appearance-text-emerald-900 flex items-center gap-2">

              <Plus size={20} className="appearance-text-emerald-600" /> Create Cycle

            </h3>

            <form onSubmit={handleAddSubmit} className="flex flex-col gap-4">

              {parentCourse?.isPrivate ? <><div><label className="input-label" htmlFor="private-cycle-name">Private cycle name *</label><input id="private-cycle-name" className="input-field" required maxLength={200} value={privateCycleName} onChange={e=>setPrivateCycleName(e.target.value)} placeholder="e.g. Private KET · Ahmed"/></div><div><label className="input-label" htmlFor="private-book-price">Book price (EGP) *</label><input id="private-book-price" className="input-field" type="number" min="0" step="0.01" required value={privateBookPrice} onChange={e=>setPrivateBookPrice(e.target.value)}/><small className="muted">Applies to new purchases only.</small></div></> : <div>

                <label className="input-label appearance-text-emerald-900">Cycle number</label>

                <input type="number" min="1" max="2147483647" step="1" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={name} onChange={e => setName(e.target.value)} required /><small className="muted">Suggested next number. You can enter another unused number; numbering is shared across branches.</small>

              </div>}

              <div>

                <label className="input-label appearance-text-emerald-900">Branch</label>

                <CustomFilterDropdown options={BRANCH_OPTIONS} value={branch} onChange={setBranch} />

              </div>

              <div>

                <label className="input-label appearance-text-emerald-900">Details / Description</label>

                <textarea className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500 min-h-[80px]" value={details} onChange={e => setDetails(e.target.value)} />

              </div>

              <div className="flex gap-4">

                <div className="flex-1">

                  <label className="input-label appearance-text-emerald-900">Start Date</label>

                  <input type="date" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={startDate} onChange={e => setStartDate(e.target.value)} />

                </div>

                <div className="flex-1">

                  <label className="input-label appearance-text-emerald-900">End Date</label>

                  <input type="date" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={endDate} onChange={e => setEndDate(e.target.value)} />

                </div>

              </div>

              <CycleScheduleFields value={schedule} onChange={setSchedule} />
              <label>Employee (optional)<CustomFilterDropdown searchable value={newInstructorId} onChange={setNewInstructorId} placeholder="Search employees by name or ID…" options={instructorsList.map(i=>({value:i.id,label:`${i.name}${i.employeeId?' · '+i.employeeId:''}`}))}/></label>{newInstructorId&&<label>Hourly rate (EGP) *<input className="input-field" type="number" min="0" step="0.01" required value={newInstructorRate} onChange={e=>setNewInstructorRate(e.target.value)}/></label>}
<div className="flex gap-4">

                <div className="flex-1">

                  <label className="input-label appearance-text-emerald-900">Total Cycle Hours</label>

                  <input type="number" step="0.5" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={totalHours} onChange={e => setTotalHours(e.target.value)} />

                </div>

                <div className="flex-1">

                  <label className="input-label appearance-text-emerald-900">Tuition Fee (EGP)</label>

                  <input type="number" step="100" min="0" placeholder="e.g. 3500" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={courseFee} onChange={e => setCourseFee(e.target.value)} />

                </div>

              </div>

              <div className="flex justify-end gap-3 appearance-mt-4">

                <button type="button" onClick={() => setIsAddModalOpen(false)} className="btn-secondary">Cancel</button>

                <button type="submit" className="appearance-bg-emerald-600 appearance-hover-bg-emerald-700 appearance-text-white appearance-px-6 appearance-py-2 appearance-rounded-lg appearance-font-bold appearance-transition-colors">Create</button>

              </div>

            </form>

          </div>

        </Dialog>}</AnimatePresence>



      {/* Edit Cycle Modal */}

      <AnimatePresence>{editingCourse && expandedCourse !== editingCourse.id && <Dialog title="Edit cycle" onClose={() => setEditingCourse(null)}>

          <div className="modal-content card max-w-lg w-full relative">

            <h3 className="appearance-text-xl appearance-font-bold appearance-mb-4 appearance-text-emerald-900 flex items-center gap-2">

              <Edit2 size={18} className="appearance-text-emerald-600" /> Edit Cycle

            </h3>

            {editForm}

          </div>

        </Dialog>}</AnimatePresence>



      {/* Assign Instructor Modal */}

      <AnimatePresence>{isAssignModalOpen && <Dialog title={replacementAssignmentId ? "Replace employee" : "Assign employee"} onClose={() => setIsAssignModalOpen(false)}>

          <div className="modal-content card max-w-md w-full relative">

            <h3 className="appearance-text-xl appearance-font-bold appearance-mb-4 appearance-text-emerald-900">{replacementAssignmentId ? "Replace Employee" : "Assign Employee"}</h3>

            <form onSubmit={handleAssignSubmit} className="flex flex-col gap-4">

              <div>

                <label className="input-label appearance-text-emerald-900">Select Employee</label>

                <CustomFilterDropdown searchable value={selectedInstructorId} onChange={setSelectedInstructorId} required placeholder="Search employees by name or ID…" options={instructorsList.filter(inst => {
                  const targetCourse = courses.find(c => c.id === assignCourseId);
                  return !(targetCourse?.instructors?.map(ci => ci.instructorId) || []).includes(inst.id);
                }).map(inst => ({value:inst.id,label:inst.name}))} />

              </div>

              {user.role !== 'user' && <div>

                  <label className="input-label appearance-text-emerald-900">Hourly Rate (EGP)</label>

                  <input type="number" step="0.01" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} required placeholder="e.g. 150" />

                </div>}

              <div className="flex justify-end gap-3 appearance-mt-4">

                <button type="button" onClick={() => setIsAssignModalOpen(false)} className="btn-secondary">Cancel</button>

                <button type="submit" className="appearance-bg-emerald-600 appearance-hover-bg-emerald-700 appearance-text-white appearance-px-6 appearance-py-2 appearance-rounded-lg appearance-font-bold appearance-transition-colors">Assign</button>

              </div>

            </form>

          </div>

        </Dialog>}</AnimatePresence>



      {/* Finish Course Modal */}

      <AnimatePresence>{finishingCourse && <Dialog title="Complete cycle" onClose={() => setFinishingCourse(null)}>

          <div className="modal-content card max-w-md w-full relative">

            <h3 className="appearance-text-xl appearance-font-bold appearance-mb-2 appearance-text-emerald-700 flex items-center gap-2">

              <CheckCircle size={20} /> Finish Course

            </h3>

            <form onSubmit={confirmMarkFinished}>

              <div className="appearance-bg-emerald-50 appearance-p-4 appearance-rounded-lg appearance-border appearance-border-emerald-100 appearance-mb-4 flex flex-col gap-4">

                <div>

                  <label className="input-label appearance-text-emerald-900">Total Cycle Hours</label>

                  <input type="number" step="0.5" min="0.5" className="input-field appearance-border-emerald-200 appearance-focus-border-emerald-500" value={finishTotalHours} onChange={e => setFinishTotalHours(e.target.value)} required />

                </div>



              </div>

              

              {finishingCourse.instructors.length > 0 && <div className="appearance-mb-6 appearance-p-4 appearance-border appearance-border-gray-200 appearance-rounded-lg appearance-bg-gray-50">

                  <div className="flex justify-between items-center appearance-mb-3">

                    <h4 className="appearance-font-bold appearance-text-sm appearance-text-emerald-950">Distribute Hours</h4>

                    {finishTotalHours && <span className={`appearance-text-xs appearance-font-semibold appearance-px-2 appearance-py-0-5 appearance-rounded ${Math.abs(Object.values(instructorHours).reduce((a, b) => a + (parseFloat(b) || 0), 0) - parseFloat(finishTotalHours)) < 0.01 ? "appearance-bg-emerald-100 appearance-text-emerald-800" : "appearance-bg-amber-100 appearance-text-amber-800"}`}>

                        Allocated: {Object.values(instructorHours).reduce((a, b) => a + (parseFloat(b) || 0), 0)} / {finishTotalHours} h

                      </span>}

                  </div>

                  {finishingCourse.instructors.map(ci => <div key={ci.id} className="flex justify-between items-center appearance-mb-2">

                      <span className="appearance-text-sm appearance-font-semibold">{ci.instructor.name}</span>

                      <input type="number" step="0.5" min="0" className="input-field w-24 appearance-py-1 appearance-border-gray-200 appearance-focus-border-emerald-500" value={instructorHours[ci.id] || ''} onChange={e => setInstructorHours({
                  ...instructorHours,
                  [ci.id]: e.target.value
                })} required />

                    </div>)}

                </div>}



              <div className="flex justify-end gap-3">

                <button type="button" onClick={() => setFinishingCourse(null)} className="btn-secondary">Cancel</button>

                <button type="submit" className="appearance-bg-emerald-600 appearance-hover-bg-emerald-700 appearance-text-white appearance-px-4 appearance-py-2 appearance-rounded-lg appearance-font-bold appearance-transition-colors">Confirm Finish</button>

              </div>

            </form>

          </div>

        </Dialog>}</AnimatePresence>



      {/* Delete Confirmation Modal */}

      {permanentTarget && <PermanentDeleteDialog kind="cycle" record={permanentTarget} onClose={() => setPermanentTarget(null)} onDeleted={() => {setPermanentTarget(null);setExpandedCourse(null);fetchData();toast.success("Cycle permanently deleted");}} />}
      <AnimatePresence>{deleteId && <Dialog title="Archive cycle" onClose={() => setDeleteId(null)}>

          <div className="modal-content card max-w-sm w-full relative">

            <h3 className="appearance-text-xl appearance-font-bold appearance-mb-2 appearance-text-red-700">Archive Course</h3>

            <p className="appearance-text-gray-600 appearance-text-sm appearance-mb-4">Archive this course? Its student tuition and employee payroll history will remain available, and a manager can restore the course.</p>

            <div className="flex justify-end gap-3 appearance-mt-4">

              <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>

              <button onClick={confirmDelete} className="appearance-bg-red-600 appearance-hover-bg-red-700 appearance-text-white appearance-px-4 appearance-py-2 appearance-rounded-lg appearance-font-bold appearance-transition-colors">Archive</button>

            </div>

          </div>

        </Dialog>}</AnimatePresence>



      {/* Custom Action Confirm Modal */}

      <AnimatePresence>{confirmAction && <Dialog title="Confirm action" onClose={() => setConfirmAction(null)}>

          <div className="modal-content card max-w-sm w-full relative appearance-p-6">

            <h3 className={`appearance-text-xl appearance-font-bold appearance-mb-3 ${confirmAction.titleColor}`}>{confirmAction.title}</h3>

            <p className="appearance-text-gray-600 appearance-font-medium appearance-mb-6 appearance-leading-relaxed appearance-text-sm">{confirmAction.message}</p>

            <div className="flex justify-end gap-3 appearance-pt-4 appearance-border-t appearance-border-gray-100">

              <button onClick={() => setConfirmAction(null)} className="btn-secondary appearance-px-5 appearance-py-2">Cancel</button>

              <button onClick={() => {
              confirmAction.action();
              setConfirmAction(null);
            }} className={`appearance-px-5 appearance-py-2 appearance-rounded-lg appearance-font-bold appearance-shadow-sm appearance-transition-colors ${confirmAction.confirmColor}`}>

                {confirmAction.confirmText}

              </button>

            </div>

          </div>

        </Dialog>}</AnimatePresence>



      {/* Review Assignment Request Modal */}

      <AnimatePresence>{reviewingAssignment && <AssignmentReviewDialog key={reviewingAssignment.id} request={{ ...reviewingAssignment, course: courses.find(c => c.id === reviewingAssignment.courseId) || reviewingAssignment.course }} onClose={() => setReviewingAssignment(null)} />}</AnimatePresence>



      <AnimatePresence>{enrollingCourse && <EnrollmentDialog key={enrollSession} course={enrollingCourse} manager={user.role !== 'user'} onClose={() => setEnrollingCourse(null)} onSaved={fetchData} />}</AnimatePresence>



      {/* Edit Enrollment / Payment Modal */}

      <AnimatePresence>

        {editingEnrollment && <Dialog title="Edit Enrollment" onClose={() => setEditingEnrollment(null)}>

            <div className="modal-content card max-w-md w-full relative">

              <div className="flex items-center justify-between appearance-mb-4 appearance-pb-2 appearance-border-b appearance-border-gray-100">

                <h3 className="appearance-text-xl appearance-font-bold appearance-text-emerald-900 flex items-center gap-2">

                  <Edit2 size={18} /> Update Tuition Fee

                </h3>

                <button type="button" className="icon-button" onClick={() => setEditingEnrollment(null)}>

                  <X size={18} />

                </button>

              </div>



              <div className="appearance-bg-gray-50 appearance-p-3 appearance-rounded-lg appearance-border appearance-border-gray-200 appearance-mb-4">

                <div className="appearance-text-xs appearance-uppercase appearance-font-bold appearance-text-gray-500 appearance-mb-1">Enrolled Student</div>

                <div className="appearance-font-semibold appearance-text-gray-900">{editingEnrollment.enrollment.student?.name}</div>

                <div className="appearance-text-xs appearance-text-gray-500">Reg: {editingEnrollment.enrollment.student?.registrationNumber} • {editingEnrollment.courseName}</div>

              </div>



              <form onSubmit={handleEditEnrollmentSubmit} className="flex flex-col gap-4">

                <div>

                  <label className="input-label appearance-text-emerald-900">Tuition Fee Rule</label>

                  <CustomFilterDropdown value={editFeeType} onChange={setEditFeeType} allowClear={false} options={[{value:'standard',label:'Standard Course Tuition'},{value:'custom',label:'Adjust / Custom Discounted Fee'},{value:'waive',label:'Remove Fee / 100% Scholarship (0 EGP)'}]} />



                  {editFeeType === 'custom' && <div>

                      <label className="input-label appearance-text-emerald-900">Adjusted Fee (EGP) *</label>

                      <input type="number" min="0" step="50" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" placeholder="e.g. 2000" value={editCustomFee} onChange={e => setEditCustomFee(e.target.value)} required />

                    </div>}

                </div>



                <p className="muted">Use Payment history to record collections, refunds, or corrections. Previously recorded payments are preserved.</p>



                <div className="flex justify-end gap-3 appearance-pt-3 appearance-border-t appearance-border-gray-100">

                  <button type="button" className="btn-secondary" onClick={() => setEditingEnrollment(null)}>

                    Cancel

                  </button>

                  <button type="submit" className="btn-primary">

                    Save Changes

                  </button>

                </div>

              </form>

            </div>

          </Dialog>}

      </AnimatePresence>



      <AnimatePresence>{removingEnrollment && <Dialog title="Remove student enrollment" onClose={() => setRemovingEnrollment(null)}><div className="modal-content card enrollment-dialog">

        <h3>Remove {removingEnrollment.enrollment.student?.name} from this course?</h3>

        <p>{removingEnrollment.courseName} · {Number(removingEnrollment.enrollment.amountPaid || 0).toLocaleString()} EGP collected</p>

        <EnrollmentRemovalFields value={removalOptions} onChange={setRemovalOptions} enrollment={removingEnrollment.enrollment}/>

        <div className="payment-entry-actions"><button type="button" className="btn-secondary" onClick={() => setRemovingEnrollment(null)}>Cancel</button><button type="button" className="btn-primary" disabled={removalSaving||!removalOptions.confirm} onClick={handleConfirmRemoveEnrollment}>Permanently remove enrollment</button></div>

      </div></Dialog>}</AnimatePresence>

    </div>;
};
function CourseRows({
  course,
  expanded,
  user,
  onExpand,
  onAssign,
  onEdit,
  onDelete,
  onPermanentDelete,
  onRevert,
  onRemove,
  onReview,
  onFinish,
  onEnroll,
  onEditEnrollment,
  onRemoveEnrollment,
  onReplace,
  onRestore,
  onPaymentsChanged
}) {
  const manager = user.role !== 'user';
  const date = value => value ? new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }) : 'Not set';
  const studentCount = course.totalEnrolled ?? course.enrollments?.length ?? 0;
  return <>

    <tr className={expanded ? 'expanded-row' : ''}>

      <td><button className="table-title course-name" onClick={onExpand} aria-expanded={expanded}>{course.name}<PrivateBadge record={course}/></button><small>{course.startDate ? date(course.startDate) : 'Dates not set'}{course.endDate ? ' — ' + date(course.endDate) : ''}</small></td>

      <td><span className="branch-label"><span style={{
            "--runtime-background": getBranchColor(course.branch)
          }} className="courses-presentation-2" />{course.branch}</span></td>

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

    {expanded && <tr className="course-detail-row"><td colSpan="7"><CourseDetail {...{
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
          onPaymentsChanged,
          onReplace,
          onRestore
        }} /></td></tr>}

  </>;
}
export function CourseDetail({
  readOnly = false,
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
  onPaymentsChanged
}) {

  const manager = user.role !== 'user';
  const [activeTab, setActiveTab] = useState("employees");
  const [studentSearch, setStudentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const date = value => value ? new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
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
        {manager && !readOnly && <div className="cycle-action-bar"><div className="cycle-primary-actions">{course.archivedAt ? <button className="btn-secondary" onClick={onRestore}><RotateCcw size={15}/>Restore cycle</button> : <><button className="btn-secondary" onClick={onEdit}><Edit2 size={15}/>Edit details</button>{course.isFinished && !course.payrollEarnings?.length && course.instructors.length > 0 && <button className="btn-primary" onClick={onFinish}>Confirm teaching hours</button>}{course.isFinished ? <button className="btn-secondary" onClick={onRevert}><RotateCcw size={15}/>Reopen cycle</button> : <button className="btn-primary" disabled={!course.instructors.length} onClick={onFinish}><CheckCircle size={15}/>Complete cycle</button>}</>}</div><div className="cycle-danger-actions">{!course.archivedAt && <button className="btn-secondary" onClick={onDelete}><Archive size={15}/>Archive</button>}<button className="btn-secondary cycle-delete-action" onClick={onPermanentDelete}><Trash2 size={15}/>Permanently delete</button></div></div>}
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

            {course.instructors.map(ci => <div className="team-line" key={ci.id}>

                <span>

                  {ci.instructor.name}

                  <small>

                    {manager ? `${ci.hourlyRate ? ci.hourlyRate + ' EGP / hour' : ''}${ci.hoursTaught != null ? (ci.hourlyRate ? ' · ' : '') + ci.hoursTaught + ' hours taught' : ''}` : ci.hoursTaught != null ? `${ci.hoursTaught} hours taught` : "Cycle employee"}

                  </small>

                </span>

                {!readOnly && !course.isFinished && !course.archivedAt && <><button className="text-button" onClick={() => onReplace(ci.id)}>{manager ? "Replace" : "Request replacement"}</button><button className="icon-button danger" title={manager ? "Remove employee" : "Request employee removal"} aria-label={'Remove ' + ci.instructor.name} onClick={() => onRemove(ci.id)}>

                    <X size={14} />

                  </button></>}

              </div>)}

            {!readOnly && !course.isFinished && !course.archivedAt && <button className="text-button" onClick={onAssign}>

                <Plus size={14} />{course.instructors.length ? "Add additional employee" : "Assign an employee"}

              </button>}

            {course.pendingAssignments?.map(pa => <div className="pending-request" key={pa.id}>

                <span>

                  <strong>{pa.type === 'REPLACE' ? `Replacement: ${pa.instructor?.name || "Employee"}` : pa.type === 'REMOVE' ? `Removal: ${pa.instructor?.name || "Employee"}` : pa.instructor?.name || 'Assignment'}</strong>

                  <small>Requested by @{pa.submittedBy?.username}</small>

                </span>

                {manager && !readOnly ? <button className="btn-secondary" onClick={() => onReview(pa)}>Review</button> : <span className="status-badge status-pending">Awaiting review</span>}

              </div>)}

          </div> : <div className="enrolled-students-section">

            <div className="enrollment-summary-bar">

              <div className="summary-stats">

                <span>Enrolled: <strong>{enrollments.length} Students</strong></span>{(course.retainedTuition>0||course.retainedBooks>0)&&<span>Retained from removed enrollments: <strong>{Number((course.retainedTuition||0)+(course.retainedBooks||0)).toLocaleString()} EGP</strong></span>}

                {<>

                    <span>Tuition: <strong>{collectedTotal.toLocaleString()} EGP</strong></span><span>Books: <strong>{Number(course.totalBookRevenue || 0).toLocaleString()} EGP</strong></span><span>Total income: <strong>{Number(course.totalIncome ?? collectedTotal).toLocaleString()} EGP</strong></span>

                    {expectedTotal > collectedTotal && <span className="courses-presentation-3">Remaining: <strong>{(expectedTotal - collectedTotal).toLocaleString()} EGP</strong></span>}

                  </>}

              </div>

              {!readOnly && <button className="btn-primary courses-presentation-4" disabled={!!course.archivedAt || course.privateSeatOccupied} title={course.privateSeatOccupied?"This private cycle already has a student":""} onClick={onEnroll}>

                <Plus size={13} /> {course.privateSeatOccupied ? "Private place filled" : "Enroll student"}

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

                {enrollments.length === 0 && !readOnly ? <button className="text-button" disabled={!!course.archivedAt || course.privateSeatOccupied} title={course.privateSeatOccupied?"This private cycle already has a student":""} onClick={onEnroll}>

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
function CourseTile(props) {
  const {
    course,
    expanded,
    onExpand,
    user
  } = props;
  const manager = user.role !== 'user';
  const color = getBranchColor(course.branch);
  const date = value => value ? new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short'
  }) : 'Dates to be confirmed';
  const studentCount = course.totalEnrolled ?? course.enrollments?.length ?? 0;
  const expectedTotal = course.totalExpectedRevenue ?? 0;
  const collectedTotal = course.totalCollectedRevenue || 0;
  const percent = expectedTotal > 0 ? Math.min(100, Math.round(collectedTotal / expectedTotal * 100)) : 0;
  return <article className={'course-tile ' + (expanded ? 'is-expanded' : '')} style={{
    '--course-color': color
  }}>

  <div className="course-tile-top"><span className="course-tile-icon"><BookOpen size={23} strokeWidth={1.7} /></span><span className="branch-label"><span style={{
          "--runtime-background": color
        }} className="courses-presentation-9" />{course.branch}</span><Status complete={course.isFinished}>{course.isFinished ? 'Completed' : 'In progress'}</Status></div>

  <button className="course-tile-title" onClick={onExpand} aria-expanded={expanded}>{course.name}<PrivateBadge record={course}/></button>

  <div className="course-tile-date"><CalendarDays size={14} />{date(course.startDate)}{course.endDate ? ' — ' + date(course.endDate) : ''}</div>

  <div className="course-tile-team">{course.instructors.length ? <><div className="avatar-stack">{course.instructors.slice(0, 3).map((ci, index) => <span key={ci.id} style={{
            '--avatar-color': ['#e5eaff', '#dcf3ef', '#ffeadc'][index]
          }} title={ci.instructor.name}>{initials(ci.instructor.name)}</span>)}</div><div><strong>{course.instructors[0].instructor.name}</strong><small>{course.instructors.length > 1 ? '+' + (course.instructors.length - 1) + " additional employee" : "Cycle employee"}</small></div></> : <><span className="unassigned-avatar"><Users size={18} /></span><div><strong>Room for a great employee</strong><small>Ready to assign</small></div></>}</div>

  

  <div className="cycle-card-student-summary">

    <div className="course-tile-students">

      <GraduationCap size={15} />

      <span><strong>{studentCount}</strong> {studentCount === 1 ? 'Student' : 'Students'}</span>

    </div>

    {course.courseFee > 0 && studentCount === 0 && <div className="course-tile-fee-tag">

        <DollarSign size={12} /> {Number(course.courseFee).toLocaleString()} EGP

      </div>}

  </div>



  {(expectedTotal > 0 || collectedTotal > 0 || studentCount > 0) && <div className="course-tuition-meter">

      <div className="tuition-meter-header">

        <span className="tuition-meter-label">Tuition ({percent}%)</span>

        <span className="tuition-meter-amount">

          <strong>{Number(collectedTotal).toLocaleString()}</strong> / {Number(expectedTotal).toLocaleString()} EGP

        </span>

      </div>

      <div className="tuition-meter-bar" role="progressbar" aria-label="Tuition collected" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>

        <div className="tuition-meter-fill courses-presentation-10" style={{
          "--runtime-width": `${percent}%`
        }} />

      </div>

    </div>}



  {course.pendingAssignments?.length > 0 && <div className="tile-pending"><Clock3 size={13} />{course.pendingAssignments.length} pending approval</div>}

  {(course.venue || classTimeLabel(course)) && <div className="cycle-schedule-summary">{course.venue && <span>Venue: <strong>{course.venue}</strong></span>}{classTimeLabel(course) && <span>Class: <strong>{classTimeLabel(course)}</strong></span>}</div>}<div className="course-tile-footer"><span><Clock3 size={15} /><strong>{course.totalHours || '—'}</strong>hours</span><button className="text-button" onClick={onExpand} aria-expanded={expanded}>{expanded ? 'Close details' : 'Cycle details'}<ChevronRight size={16} /></button></div>

  <AnimatePresence>{expanded && <Dialog title={course.name} onClose={onExpand}><div className="modal-content card course-detail-modal"><div className="detail-modal-heading"><span className="course-tile-icon"><BookOpen size={23} /></span><div><span className="eyebrow">{course.branch}</span><h2>{props.editForm ? 'Edit cycle details' : 'Cycle details'}</h2></div><button className="icon-button" aria-label="Close cycle details" onClick={onExpand}><X size={20} /></button></div>{props.editForm ? <div className="cycle-edit-view"><div className="cycle-edit-intro"><h3>{course.name}<PrivateBadge record={course}/></h3><p>Update this cycle’s details, location and schedule.</p></div>{props.editForm}</div> : <CourseDetail {...props} onEdit={props.onEdit} onPermanentDelete={() => { onExpand(); props.onPermanentDelete(); }} onDelete={() => {
            onExpand();
            props.onDelete();
          }} onRevert={() => {
            onExpand();
            props.onRevert();
          }} onReview={pa => {
            onExpand();
            props.onReview(pa);
          }} onFinish={() => {
            onExpand();
            props.onFinish();
          }} onAssign={() => {
            onExpand();
            props.onAssign();
          }} onRemove={id => {
            onExpand();
            props.onRemove(id);
          }} onEnroll={() => {
            props.onEnroll();
          }} onEditEnrollment={enr => {
            props.onEditEnrollment(enr);
          }} onRemoveEnrollment={enr => {
            props.onRemoveEnrollment(enr);
          }} />}</div></Dialog>}</AnimatePresence>

 </article>;
}
export default Courses;
