import { canSeePayroll } from '../utils/access';
import DateInput from '../components/DateInput';
import EnrollmentRemovalFields from '../components/EnrollmentRemovalFields';
import CycleScheduleFields from '../components/CycleScheduleFields';
import '../styles/_cycleDetails.scss';
import AssignmentReviewDialog from '../components/AssignmentReviewDialog';
import PermanentDeleteDialog from '../components/PermanentDeleteDialog';
import BulkDeleteDialog from '../components/BulkDeleteDialog';
import CycleImportDialog from '../components/CycleImportDialog';
import ExcelExportButton from '../components/ExcelExportButton';
import EnrollmentDialog from '../components/EnrollmentDialog';
import { AnimatePresence } from 'framer-motion';
import { MotionRegion, MotionTab } from '../components/WorkspaceMotion';
import Dialog from '../components/Dialog';
import { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { LayoutGrid, List, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { PageHeading, EmptyState } from '../components/WorkspaceUI';
import { Plus, Edit2, Trash2, Archive, BookOpen, X, CheckCircle, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext';
import { BRANCHES, BRANCH_OPTIONS } from '../Constants';
import CustomFilterDropdown from '../components/CustomFilterDropdown';
import CourseRows from '../components/courses/CourseRows';
import CourseTile from '../components/courses/CourseTile';
const Courses = () => {
  const {
    user
  } = useContext(AuthContext);
  const { courseId: parentId, subCourseId } = useParams();
  // Hourly rates are payroll: users and branch mods request teaching-team changes instead.
  const payrollAccess = canSeePayroll(user);
  const dataRequest = useRef(0);
  const [importOpen, setImportOpen] = useState(false);
  const [parentCourse, setParentCourse] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [view, setView] = useState(() => localStorage.getItem('aast-course-view') || 'grid');
  const [loadError, setLoadError] = useState(false);
  const [courses, setCourses] = useState([]);
  // The server pages and filters cycles; tab counts come from the database too.
  const PAGE_SIZE = 24;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({});
  const [query, setQuery] = useState('');
  const listParams = useRef({});
  const [instructorsList, setInstructorsList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [replacementAssignmentId, setReplacementAssignmentId] = useState(null);
  const removalBusy=useRef(false);
  const [removalSaving,setRemovalSaving]=useState(false);
  const [removalOptions,setRemovalOptions]=useState({mode:'KEEP',tuitionReduction:0,bookReduction:0,confirm:false});
  const [selectedCycleIds, setSelectedCycleIds] = useState([]);
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkActionBusy, setBulkActionBusy] = useState(false);



  // Edit & Delete

  const [editingCourse, setEditingCourse] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [permanentTarget, setPermanentTarget] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  // Form states

  const [name, setName] = useState('');
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
  const fetchData = async () => {
    const request = ++dataRequest.current;
    setLoadError(false);
    try {
      const [coursesRes, instructorsRes, parentRes] = await Promise.all([axios.get('/cycles', { params: listParams.current }), axios.get('/instructors', { params: { picker: 1 } }), subCourseId ? axios.get('/sub-courses/' + subCourseId) : parentId ? axios.get('/courses/' + parentId) : Promise.resolve({ data: null })]);
      if (request !== dataRequest.current) return;
      // A sub-umbrella page scopes everything to that sub-umbrella, using its umbrella's code.
      setParentCourse(subCourseId && parentRes.data ? { ...parentRes.data, code: parentRes.data.parentCourse.code, umbrella: parentRes.data.parentCourse } : parentRes.data);
      if (parentRes.data?.archivedAt) setFilterStatus('archived');
      const pages = Math.max(1, Math.ceil(coursesRes.data.total / PAGE_SIZE));
      if (coursesRes.data.page > pages) { setPage(pages); return; }
      setCourses(coursesRes.data.rows);
      setTotal(coursesRes.data.total);
      setCounts(coursesRes.data.counts);
      setInstructorsList(instructorsRes.data);
    } catch (error) {
      if (request !== dataRequest.current) return;
      setLoadError(true);
      toast.error('Could not load cycles. Please try again.');
    } finally {
      if (request === dataRequest.current) setLoading(false);
    }
  };
  listParams.current = { parentCourseId: parentId, subCourseId: subCourseId || undefined, page, pageSize: PAGE_SIZE, search: query || undefined, branch: filterBranch || undefined, status: filterStatus || undefined };
  useEffect(() => {
    const t = setTimeout(() => setQuery(filterName.trim()), 300);
    return () => clearTimeout(t);
  }, [filterName]);
  useEffect(() => { setPage(1); setSelectedCycleIds([]); }, [query, filterBranch, filterStatus, parentId, subCourseId]);
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, subCourseId, page, query, filterBranch, filterStatus]);
  useEffect(() => {
    const refreshAssignments = () => fetchData();
    window.addEventListener('assignments-updated', refreshAssignments);
    return () => window.removeEventListener('assignments-updated', refreshAssignments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleAddSubmit = async e => {
    e.preventDefault();
    try {
      await axios.post('/cycles', {
        ...schedule, parentCourseId: parentId, subCourseId: subCourseId || undefined, cycleNumber: name,instructorId:newInstructorId||undefined,hourlyRate:newInstructorId?newInstructorRate:undefined,
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
        cycleNumber: editingCourse.cycleNumber,
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
      if (payrollAccess) {
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
    const isJunior = !payrollAccess;
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
    setName('');
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
      await axios.delete(`/cycles/${courseId}/enrollments/${enrollment.id}`, {
        data: {
          ...removalOptions
        }
      });
      toast.success(`Removed ${enrollment.student.name} from course`);
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

  const filteredCourses = courses;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canSelectCycles = user.role !== 'user';
  const toggleSelectCycle = id => setSelectedCycleIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const toggleSelectAll = () => setSelectedCycleIds(filteredCourses.length && filteredCourses.every(c => selectedCycleIds.includes(c.id)) ? [] : filteredCourses.map(c => c.id));
  // Picks every matching cycle in the date range, across all pages.
  const selectAllInRange = async () => {
    try {
      const { data } = await axios.get('/cycles', { params: { ...listParams.current, page: undefined, pageSize: undefined, from: dateRangeStart || undefined, to: dateRangeEnd || undefined, idsOnly: 1 } });
      setSelectedCycleIds(data.ids);
      if (!data.ids.length) toast('No cycles start in that range.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not select the cycles in that range.');
    }
  };

  const handleBulkArchive = async () => {
    if (!selectedCycleIds.length) return;
    setBulkActionBusy(true);
    try {
      const res = await axios.post('/cycles/bulk-archive', { ids: selectedCycleIds });
      toast.success(res.data.message || 'Cycles archived successfully');
      setSelectedCycleIds([]);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to archive cycles');
    } finally {
      setBulkActionBusy(false);
    }
  };

  const handleBulkDeleteDone = message => {
    toast.success(message || 'Selected cycles updated');
    setSelectedCycleIds([]);
    setBulkDeleteModalOpen(false);
    fetchData();
  };
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
    if (openReviewId && payrollAccess) {
      const course = courses.find(c => c.pendingAssignments?.some(p => p.id === openReviewId));
      if (course) {
        setReviewingAssignment(course.pendingAssignments.find(p => p.id === openReviewId));
        setExpandedCourse(null);
      } else {
        // The cycle may be on another page: load the request on its own.
        axios.get('/assignments/' + openReviewId).then(({ data }) => setReviewingAssignment(data)).catch(error => toast.error(error.response?.data?.error || 'This request could not be opened.'));
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

              <div>

                <label className="input-label appearance-text-emerald-900">Cycle number</label>

                <input type="number" min="1" max="2147483647" step="1" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={editingCourse.cycleNumber} onChange={e => setEditingCourse({
                ...editingCourse,
                cycleNumber: e.target.value
              })} required />

              </div>

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

                  <DateInput  className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={editingCourse.startDate ? editingCourse.startDate.split('T')[0] : ''} onChange={e => setEditingCourse({
                  ...editingCourse,
                  startDate: e.target.value
                })} />

                </div>

                <div className="flex-1">

                  <label className="input-label appearance-text-emerald-900">End Date</label>

                  <DateInput  className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={editingCourse.endDate ? editingCourse.endDate.split('T')[0] : ''} onChange={e => setEditingCourse({
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

      <nav className="course-breadcrumb" aria-label="Breadcrumb"><Link to="/courses">Courses</Link><ChevronRight size={14} />{parentCourse?.umbrella && <><Link to={'/courses/' + parentCourse.umbrella.id}>{parentCourse.umbrella.name}</Link><ChevronRight size={14} /></>}<span>{parentCourse?.name || 'All cycles'}</span></nav>
      <PageHeading eyebrow={parentCourse?.code || 'Across the academy'} title={parentCourse ? `${parentCourse.name} cycles` : 'All cycles'} description="Every cycle has its own teaching team, students, and financial records.">

        <ExcelExportButton parentCourseId={parentId} />
        {user.role !== 'user' && parentCourse && !parentCourse.archivedAt && <button className="btn-secondary export-format-excel" onClick={() => setImportOpen(true)}><FileSpreadsheet size={16} />Import cycle from Excel</button>}

        {user.role !== 'user' && parentCourse && !parentCourse.archivedAt && <button className="btn-primary" onClick={() => { resetForm(); setName(String(parentCourse.nextCycleNumber || '')); setIsAddModalOpen(true); }}><Plus size={16} />New cycle</button>}
      </PageHeading>

      <div className="section-tabs" aria-label="Course status">

        {[['', 'All cycles', counts.all ?? 0], ['active', 'Active', counts.active ?? 0], ['finished', 'Completed', counts.finished ?? 0], ['tuition-due', 'Tuition outstanding', counts.tuitionDue ?? 0], ...(payrollAccess ? [['payroll-due', "Employee payments due", counts.payrollDue ?? 0]] : []), ['pending', 'Pending approval', counts.pending ?? 0], ...(user.role !== 'user' ? [['archived', 'Archived', counts.archived ?? 0]] : [])].map(([value, label, count]) => <MotionTab key={value} active={filterStatus === value} onClick={() => setFilterStatus(value)}>{label}<span>{count}</span></MotionTab>)}

      </div>

      {filterStatus === 'tuition-due' && <p className="payment-view-note">Courses with remaining student tuition, including partial payments. Retained financial records still count; archived financial records do not.</p>}
      {filterStatus === 'payroll-due' && <p className="payment-view-note">Completed courses with unpaid employee earnings. Employee payments are settled after course completion.</p>}
      <section className={view === 'grid' ? 'course-collection' : 'panel course-collection list-view'}>

        <div className="filter-toolbar">

          <div className="search-field"><Search size={17} /><input aria-label="Search cycles" placeholder="Search cycles, employees, or branches…" value={filterName} onChange={e => setFilterName(e.target.value)} /></div>

          <div className="filter-select"><CustomFilterDropdown value={filterBranch} onChange={setFilterBranch} options={BRANCH_OPTIONS} placeholder="All branches" /></div>
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded px-2 py-1">
            <span>Range:</span>
            <input type="date" aria-label="Start date from" value={dateRangeStart} onChange={e => setDateRangeStart(e.target.value)} className="bg-transparent border-none text-xs" />
            <span>to</span>
            <input type="date" aria-label="Start date to" value={dateRangeEnd} onChange={e => setDateRangeEnd(e.target.value)} className="bg-transparent border-none text-xs" />
            {(dateRangeStart || dateRangeEnd) && <button type="button" className="text-button text-emerald-700 font-semibold" onClick={selectAllInRange}>Select range</button>}
          </div>

          {isAnyFilterActive && <button className="text-button" onClick={clearAllFilters}><X size={14} />Reset</button>}

          <span className="result-count">{total} cycles</span><div className="view-switch" aria-label="Cycle view"><button aria-label="Card view" aria-pressed={view === 'grid'} className={view === 'grid' ? 'active' : ''} onClick={() => {
            setView('grid');
            localStorage.setItem('aast-course-view', 'grid');
          }}><LayoutGrid size={17} /></button><button aria-label="List view" aria-pressed={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => {
            setView('list');
            localStorage.setItem('aast-course-view', 'list');
          }}><List size={18} /></button></div>

        </div>

        {canSelectCycles && selectedCycleIds.length > 0 && (
          <div className="flex items-center justify-between p-3 bg-slate-900 text-white rounded-lg mb-4 shadow">
            <span className="font-semibold text-sm">{selectedCycleIds.length} cycles selected</span>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary text-xs" disabled={bulkActionBusy} onClick={handleBulkArchive}>
                <Archive size={14} /> Archive selected
              </button>
              <button type="button" className="btn-secondary bg-red-600 hover:bg-red-700 text-white border-none text-xs" disabled={bulkActionBusy} onClick={() => setBulkDeleteModalOpen(true)}>
                <Trash2 size={14} /> Delete selected
              </button>
              <button type="button" className="text-button text-slate-300 hover:text-white text-xs" onClick={() => setSelectedCycleIds([])}>
                Clear
              </button>
            </div>
          </div>
        )}
        <MotionRegion transitionKey={view + ':' + filterStatus + ':' + filterBranch}>

        {view === 'grid' ? <div className="course-grid">{filteredCourses.map(course => <CourseTile key={course.id} course={course} isSelected={selectedCycleIds.includes(course.id)} onToggleSelect={canSelectCycles ? () => toggleSelectCycle(course.id) : undefined} editForm={editingCourse?.id === course.id ? editForm : null} onCancelEdit={() => { if (!editSaving) setEditingCourse(null); }} expanded={expandedCourse === course.id} user={user} onPaymentsChanged={fetchData} onReplace={assignmentId => {
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
          }} onEnroll={() => handleOpenEnroll(course)} onEditEnrollment={enr => handleOpenEditEnrollment(course, enr)} onRemoveEnrollment={enr => handleRequestRemoveEnrollment(course, enr)} />)}</div> : <div className="table-scroll"><table className="data-table course-ledger"><thead><tr><th className="select-column">{canSelectCycles && <input type="checkbox" aria-label="Select all" checked={selectedCycleIds.length === filteredCourses.length && filteredCourses.length > 0} onChange={toggleSelectAll} />}</th><th>Course</th><th>Branch</th><th>Teaching team</th><th>Students</th><th>Hours</th><th>Status</th><th aria-label="Details" /></tr></thead><tbody>{filteredCourses.map(course => <CourseRows key={course.id} course={course} isSelected={selectedCycleIds.includes(course.id)} onToggleSelect={canSelectCycles ? () => toggleSelectCycle(course.id) : undefined} editForm={editingCourse?.id === course.id ? editForm : null} onCancelEdit={() => { if (!editSaving) setEditingCourse(null); }} expanded={expandedCourse === course.id} user={user} onPaymentsChanged={fetchData} onReplace={assignmentId => {
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

        {!filteredCourses.length && <div className="empty-state"><BookOpen size={28} /><h3>{isAnyFilterActive ? 'No matching cycles' : 'A fresh start for your courses'}</h3><p>{isAnyFilterActive ? 'Try a different search or reset your filters.' : 'Create the first cycle for this course to get started.'}</p>{isAnyFilterActive && <button className="btn-secondary" onClick={clearAllFilters}>Reset filters</button>}</div>}

        </MotionRegion>

        {pageCount > 1 && <div className="list-pagination">
          <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
          <div>
            <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button type="button" className="btn-secondary" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>}
        <div className="panel-footnote">Showing {filteredCourses.length} of {total} cycles<span>Expand a cycle to manage its details</span></div>

      </section>



      {/* Add Course Modal */}

      <AnimatePresence>{user.role !== 'user' && importOpen && parentCourse && <CycleImportDialog parent={parentCourse?.umbrella ? { ...parentCourse.umbrella, nextCycleNumber: parentCourse.nextCycleNumber } : parentCourse} subCourse={parentCourse?.umbrella ? parentCourse : null} instructors={instructorsList} manager={user.role !== 'user'} onClose={() => setImportOpen(false)} onImported={() => { setFilterName(''); setFilterBranch(''); setFilterStatus(''); return fetchData(); }} onSaved={async result => { setImportOpen(false); setFilterName(''); setFilterBranch(''); setFilterStatus(''); await fetchData(); setExpandedCourse(result.cycleId); toast.success(`${result.cycleName} imported`); }} />}</AnimatePresence>
      <AnimatePresence>{isAddModalOpen && <Dialog title="Create cycle" onClose={() => setIsAddModalOpen(false)}>

          <div className="modal-content card max-w-lg w-full relative">

            <h3 className="appearance-text-xl appearance-font-bold appearance-mb-4 appearance-text-emerald-900 flex items-center gap-2">

              <Plus size={20} className="appearance-text-emerald-600" /> Create Cycle

            </h3>

            <form onSubmit={handleAddSubmit} className="flex flex-col gap-4">

              <div>

                <label className="input-label appearance-text-emerald-900">Cycle number</label>

                <input type="number" min="1" max="2147483647" step="1" className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={name} onChange={e => setName(e.target.value)} required /><small className="muted">Suggested next number. You can enter another unused number; {subCourseId ? `Numbers are unique within ${parentCourse?.name}.` : 'Numbering is shared across branches.'}</small>

              </div>

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

                  <DateInput  className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={startDate} onChange={e => setStartDate(e.target.value)} />

                </div>

                <div className="flex-1">

                  <label className="input-label appearance-text-emerald-900">End Date</label>

                  <DateInput  className="input-field appearance-border-gray-200 appearance-focus-border-emerald-500" value={endDate} onChange={e => setEndDate(e.target.value)} />

                </div>

              </div>

              <CycleScheduleFields value={schedule} onChange={setSchedule} />
              {payrollAccess && <><label>Employee (optional)<CustomFilterDropdown searchable value={newInstructorId} onChange={setNewInstructorId} placeholder="Search employees by name or ID…" options={instructorsList.map(i=>({value:i.id,label:`${i.name}${i.employeeId?' · '+i.employeeId:''}`}))}/></label>{newInstructorId&&<label>Hourly rate (EGP) *<input className="input-field" type="number" min="0" step="0.01" required value={newInstructorRate} onChange={e=>setNewInstructorRate(e.target.value)}/></label>}</>}
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

              {payrollAccess && <div>

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



      <AnimatePresence>{enrollingCourse && <EnrollmentDialog key={enrollSession} course={enrollingCourse} onClose={() => setEnrollingCourse(null)} onSaved={fetchData} />}</AnimatePresence>



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
      <AnimatePresence>{bulkDeleteModalOpen && <BulkDeleteDialog kind="cycle" ids={selectedCycleIds} previewUrl="/cycles/bulk-deletion-preview" deleteUrl="/cycles/bulk-delete" listKey="cycles" onClose={() => setBulkDeleteModalOpen(false)} onDone={handleBulkDeleteDone} />}</AnimatePresence>


    </div>;
};
export default Courses;
