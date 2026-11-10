import {dateText} from '../utils/dates';
import ArchiveControls from '../components/ArchiveControls';
import StudentDetailsDialog from '../components/StudentDetailsDialog';
import { AuthContext } from '../context/AuthContext';
import StudentProfileFields from '../components/StudentProfileFields';
import FinancialRemovalChoice from '../components/FinancialRemovalChoice';
import { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import { AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, Search, Phone, GraduationCap, X, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Dialog from '../components/Dialog';
import { PageHeading, initials } from '../components/WorkspaceUI';
export default function Students() {
  const { user } = useContext(AuthContext);
  const manager = ['admin', 'mod'].includes(user.role);
  const [students, setStudents] = useState([]);
  const [viewingStudent, setViewingStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [archivedView,setArchivedView]=useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ active: 0, archived: 0 });
  const [query, setQuery] = useState('');
  const PAGE_SIZE = 24;
  const request = useRef(0);

  // Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addRegNumber, setAddRegNumber] = useState('');
  const [addProfile, setAddProfile] = useState({});
  const [addMobile, setAddMobile] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit Modal State
  const [editingStudent, setEditingStudent] = useState(null);

  // Delete Modal State
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [keepFinancialRecords, setKeepFinancialRecords] = useState(true);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkKeepFinancials, setBulkKeepFinancials] = useState(true);
  const [bulkActionBusy, setBulkActionBusy] = useState(false);


  useEffect(() => { setKeepFinancialRecords(true); setConfirmRemoval(false); }, [deleteTarget]);
  // The server pages and searches the directory, so only one page of students is loaded at a time.
  const params = useRef({});
  params.current = { page, pageSize: PAGE_SIZE, search: query || undefined, view: archivedView ? 'archived' : 'active' };
  const fetchStudents = async () => {
    const id = ++request.current;
    try {
      setLoading(true);
      const res = await axios.get('/students', { params: params.current });
      if (id !== request.current) return;
      const pages = Math.max(1, Math.ceil(res.data.total / PAGE_SIZE));
      if (res.data.page > pages) { setPage(pages); return; }
      setStudents(res.data.rows);
      setTotal(res.data.total);
      setCounts(res.data.counts);
    } catch (err) {
      if (id === request.current) toast.error('Failed to load students directory');
    } finally {
      if (id === request.current) setLoading(false);
    }
  };
  useEffect(() => {
    const t = setTimeout(() => setQuery(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);
  useEffect(() => { setPage(1); setSelectedStudentIds([]); }, [query, archivedView]);
  useEffect(() => {
    fetchStudents();
  }, [page, query, archivedView]);
  useEffect(() => {
    window.addEventListener('students-updated', fetchStudents);
    return () => window.removeEventListener('students-updated', fetchStudents);
  }, []);
  const resetAddForm = () => {
    setAddName('');
    setAddRegNumber('');
    setAddMobile('');
    setAddProfile({});
  };
  const handleAddSubmit = async e => {
    e.preventDefault();
    if (!addName.trim()) {
      toast.error('Please enter the student name.');
      return;
    }
    try {
      setSubmitting(true);
      const res = await axios.post('/students', {
        name: addName.trim(),
        registrationNumber: addRegNumber.trim(),
        mobile: addMobile.trim() || null,
        ...addProfile
      });
      toast.success(`Student ${res.data.name} registered`);
      window.dispatchEvent(new Event('notifications-updated'));
      setIsAddModalOpen(false);
      resetAddForm();
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to register student');
    } finally {
      setSubmitting(false);
    }
  };
  const handleEditSubmit = async e => {
    e.preventDefault();
    if (!editingStudent.name.trim()) {
      toast.error('Student name cannot be empty.');
      return;
    }
    try {
      setSubmitting(true);
      const res = await axios.put(`/students/${editingStudent.id}`, {
        name: editingStudent.name.trim(),
        registrationNumber: (editingStudent.registrationNumber||'').trim(),
        mobile: editingStudent.mobile ? editingStudent.mobile.trim() : null,
        englishName: editingStudent.englishName || null, dateOfBirth: editingStudent.dateOfBirth?.slice(0,10) || null, nationality: editingStudent.nationality || null, placeOfBirth: editingStudent.placeOfBirth || null
      });
      toast.success(`Updated ${res.data.name}`);
      setEditingStudent(null);
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update student');
    } finally {
      setSubmitting(false);
    }
  };
  const handleDeleteSubmit = async () => {
    if (!deleteTarget) return;
    try {
      setSubmitting(true);
      await axios.delete(`/students/${deleteTarget.id}`, { data: { keepFinancialRecords: manager ? keepFinancialRecords : true, confirm: confirmRemoval } });
      toast.success(`Removed student ${deleteTarget.name}`);
      window.dispatchEvent(new Event('notifications-updated'));
      setDeleteTarget(null);
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove student');
    } finally {
      setSubmitting(false);
    }
  };
  const filtered = students;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const viewCount = archivedView ? counts.archived : counts.active;
  const toggleSelectStudent = id => setSelectedStudentIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const toggleSelectAll = () => setSelectedStudentIds(selectedStudentIds.length === filtered.length && filtered.length > 0 ? [] : filtered.map(s => s.id));

  const handleBulkArchive = async () => {
    if (!selectedStudentIds.length) return;
    setBulkActionBusy(true);
    try {
      const res = await axios.post('/students/bulk-archive', { ids: selectedStudentIds });
      toast.success(res.data.message || 'Students archived successfully');
      setSelectedStudentIds([]);
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to archive students');
    } finally {
      setBulkActionBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedStudentIds.length) return;
    setBulkActionBusy(true);
    try {
      const res = await axios.post('/students/bulk-delete', {
        ids: selectedStudentIds,
        keepFinancialRecords: manager ? bulkKeepFinancials : true,
        confirm: true
      });
      toast.success(res.data.message || 'Students deleted successfully');
      setSelectedStudentIds([]);
      setBulkDeleteModalOpen(false);
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete students');
    } finally {
      setBulkActionBusy(false);
    }
  };
  return <div className="students-container">
      <PageHeading eyebrow="ACADEMIC DIRECTORY" title="Students" description={manager ? 'Comprehensive directory of registered students across all academic branches.' : 'Students and their courses in your branches. View only.'}>
        {manager && <button className="btn-primary" onClick={() => {
        resetAddForm();
        setIsAddModalOpen(true);
      }}>
          <Plus size={16} /> Add student
        </button>}
      </PageHeading>

            {manager&&<div className="section-tabs"><button className={!archivedView?'active':''} onClick={()=>setArchivedView(false)}>Active students</button><button className={archivedView?'active':''} onClick={()=>setArchivedView(true)}>Archived students</button></div>}
      <div className="students-toolbar">
        <div className="students-search">
          <Search size={16} />
          <input type="text" placeholder="Search by name, registration ID, or phone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="students-meta-summary">
          <span>
            Total: <strong>{viewCount}</strong> {viewCount === 1 ? 'student' : 'students'}
          </span>
          {query && <span>
              Matches: <strong>{total}</strong>
            </span>}
        </div>
      </div>

      {selectedStudentIds.length > 0 && (
        <div className="flex items-center justify-between p-3 bg-slate-900 text-white rounded-lg mb-4 shadow">
          <span className="font-semibold text-sm">{selectedStudentIds.length} students selected</span>
          <div className="flex items-center gap-2">
            {manager && (
              <button type="button" className="btn-secondary text-xs" disabled={bulkActionBusy} onClick={handleBulkArchive}>
                Archive selected
              </button>
            )}
            <button type="button" className="btn-secondary bg-red-600 hover:bg-red-700 text-white border-none text-xs" disabled={bulkActionBusy} onClick={() => setBulkDeleteModalOpen(true)}>
              <Trash2 size={14} /> Delete selected
            </button>
            <button type="button" className="text-button text-slate-300 hover:text-white text-xs" onClick={() => setSelectedStudentIds([])}>
              Clear
            </button>
          </div>
        </div>
      )}
      {user.role === 'user' && !user.branches && <div className="panel empty-state no-branches-note"><h3>No branches assigned yet</h3><p>Ask the main mod or an admin to choose the branches you can view.</p></div>}
      {loading ? <div className="loading-state">
          <div className="loading-spinner" />
          <span>Loading student records...</span>
        </div> : filtered.length === 0 ? <div className="panel empty-state">
          <span className="empty-icon">
            <GraduationCap size={28} />
          </span>
          <h3>{viewCount ? 'No matching students found' : archivedView ? 'No archived students' : 'No students registered yet'}</h3>
          <p>
            {viewCount ? 'Try adjusting your search criteria.' : archivedView ? 'Archived students will appear here.' : 'Add your first student to get started with course enrollments.'}
          </p>
          {manager && !viewCount && !archivedView && <button className="btn-primary" onClick={() => {
        resetAddForm();
        setIsAddModalOpen(true);
      }}>
              <Plus size={16} /> Register student
            </button>}
        </div> : <div className="students-card">
          <div className="overflow-x-auto">
            <table className="students-table">
              <thead>
                <tr>
                  {manager && <th className="select-column"><input type="checkbox" aria-label="Select all" checked={selectedStudentIds.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} /></th>}
                  <th>Student</th>
                  <th>Registration ID</th>
                  <th>Contact</th>
                  <th>Registered On</th>
                  {manager && <th className="students-presentation-24">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(student => <tr key={student.id}>
                    {manager && <td className="select-column"><input type="checkbox" aria-label={`Select ${student.name}`} checked={selectedStudentIds.includes(student.id)} onChange={() => toggleSelectStudent(student.id)} /></td>}
                    <td>
                      <div className="student-info-cell">
                        <span className="student-avatar">{initials(student.name)}</span>
                        <div className="student-name-block">
                          <button type="button" className="student-name-link" onClick={()=>setViewingStudent(student)}>{student.name}</button> {student.deletedAt && <span className="deleted-tag">Archived</span>}
                          <span>{student.englishName || `ID: ${student.id.slice(0, 8)}…`}</span><small>{[student.nationality, student.placeOfBirth, student.dateOfBirth?dateText(student.dateOfBirth):null].filter(Boolean).join(" · ")}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="student-reg-badge">{student.registrationNumber||'Not issued'}</span>
                    </td>
                    <td>
                      {student.mobile ? <a href={`tel:${student.mobile}`} className="student-contact-link">
                          <Phone size={13} />
                          {student.mobile}
                        </a> : <span className="student-no-contact">No phone registered</span>}
                    </td>
                    <td>
                      <span className="muted">
                        {new Date(student.createdAt).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit'
                  })}
                      </span>
                    </td>
                    {/* Users only view students. */}
                    {manager && <td>
                      <div className="student-actions-cell">
                        <button className="student-action-btn" aria-label={`Edit ${student.name}`} title="Edit student" onClick={() => setEditingStudent({
                    ...student
                  })}>
                          <Edit2 size={15} />
                        </button>
                        <ArchiveControls entity="students" record={student} onSaved={fetchStudents}/>

                      </div>
                    </td>}
                  </tr>)}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && <div className="list-pagination">
            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
            <div>
              <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span>Page {page} of {pageCount}</span>
              <button type="button" className="btn-secondary" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          </div>}
        </div>}

      <AnimatePresence>{viewingStudent && <StudentDetailsDialog studentId={viewingStudent.id} onClose={()=>setViewingStudent(null)} />}</AnimatePresence>
      {/* Add Student Modal */}
      <AnimatePresence>
        {isAddModalOpen && <Dialog title="Add Student" onClose={() => setIsAddModalOpen(false)}>
            <div className="modal-content card w-full max-w-md">
              <div className="student-modal-header">
                <h3>
                  <GraduationCap size={20} /> Register New Student
                </h3>
                <button type="button" className="icon-button" onClick={() => setIsAddModalOpen(false)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleAddSubmit} className="student-modal-form">
                <div className="student-form-group">
                  <label>Full Name *</label>
                  <input type="text" required placeholder="e.g. Sarah Mohamed Ali" value={addName} onChange={e => setAddName(e.target.value)} />
                </div>
                <div className="student-form-group">
                  <label>Registration Number (optional)</label>
                  <input type="text" placeholder="e.g. 21100567" value={addRegNumber} onChange={e => setAddRegNumber(e.target.value)} />
                  <small>Leave blank if not issued; unique when provided</small>
                </div>
                <div className="student-form-group">
                  <label>Mobile Number</label>
                  <input type="tel" placeholder="e.g. 01012345678" value={addMobile} onChange={e => setAddMobile(e.target.value)} />
                </div>
                <StudentProfileFields prefix="add" value={addProfile} onChange={setAddProfile} />
                <div className="student-modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setIsAddModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    <Plus size={16} /> {submitting ? 'Submitting…' : 'Register student'}
                  </button>
                </div>
              </form>
            </div>
          </Dialog>}
      </AnimatePresence>

      {/* Edit Student Modal */}
      <AnimatePresence>
        {editingStudent && <Dialog title="Edit Student" onClose={() => setEditingStudent(null)}>
            <div className="modal-content card w-full max-w-md">
              <div className="student-modal-header">
                <h3>
                  <Edit2 size={18} /> Edit Student Details
                </h3>
                <button type="button" className="icon-button" onClick={() => setEditingStudent(null)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleEditSubmit} className="student-modal-form">
                <div className="student-form-group">
                  <label>Full Name *</label>
                  <input type="text" required value={editingStudent.name} onChange={e => setEditingStudent({
                ...editingStudent,
                name: e.target.value
              })} />
                </div>
                <div className="student-form-group">
                  <label>Registration Number (optional)</label>
                  <input type="text" value={editingStudent.registrationNumber||''} onChange={e => setEditingStudent({
                ...editingStudent,
                registrationNumber: e.target.value
              })} />
                  <small>Leave blank if not issued; unique when provided</small>
                </div>
                <div className="student-form-group">
                  <label>Mobile Number</label>
                  <input type="tel" placeholder="e.g. 01012345678" value={editingStudent.mobile || ''} onChange={e => setEditingStudent({
                ...editingStudent,
                mobile: e.target.value
              })} />
                </div>
                <StudentProfileFields prefix="edit" value={editingStudent} onChange={setEditingStudent} />
                <div className="student-modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setEditingStudent(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    <Check size={16} /> {submitting ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </form>
            </div>
          </Dialog>}
      </AnimatePresence>

      {/* Bulk Delete Modal */}
      <AnimatePresence>
        {bulkDeleteModalOpen && (
          <Dialog title="Bulk Delete Students" onClose={() => setBulkDeleteModalOpen(false)}>
            <div className="modal-content card max-w-md w-full">
              <div className="flex items-center gap-3 text-red-600 mb-3">
                <AlertTriangle size={24} />
                <h3 className="text-lg font-bold text-slate-900">Delete {selectedStudentIds.length} Selected Students?</h3>
              </div>
              {!manager ? <p className="text-sm text-slate-600 mb-6">
                These students will be removed from normal staff views. Their tuition and book payments stay counted in revenue and reports. Only admins and moderators can exclude financial records.
              </p> : <>
              <p className="text-sm text-slate-600 mb-4">
                Some or all of these students may have recorded tuition or book payments.
                Choose how to handle associated financial records:
              </p>
              <div className="flex flex-col gap-3 mb-6 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="studentBulkFinancialChoice"
                    checked={bulkKeepFinancials}
                    onChange={() => setBulkKeepFinancials(true)}
                  />
                  <div>
                    <strong className="block text-sm font-semibold text-slate-900">Keep Financial Records (Recommended)</strong>
                    <span className="text-xs text-slate-500">Student records are soft-deleted, but previous tuition and book payments remain counted in revenue and reports.</span>
                  </div>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="studentBulkFinancialChoice"
                    checked={!bulkKeepFinancials}
                    onChange={() => setBulkKeepFinancials(false)}
                  />
                  <div>
                    <strong className="block text-sm font-semibold text-red-700">Delete Financial Records As Well</strong>
                    <span className="text-xs text-red-600">Removes student payments from financial totals, revenue metrics, and balance sheets.</span>
                  </div>
                </label>
              </div></>}
              <div className="flex items-center justify-end gap-3">
                <button type="button" className="btn-secondary" disabled={bulkActionBusy} onClick={() => setBulkDeleteModalOpen(false)}>Cancel</button>
                <button type="button" className="btn-primary bg-red-600 hover:bg-red-700 text-white" disabled={bulkActionBusy} onClick={handleBulkDelete}>
                  {bulkActionBusy ? 'Deleting…' : `Delete ${selectedStudentIds.length} Students`}
                </button>
              </div>
            </div>
          </Dialog>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && <Dialog title="Delete Student" onClose={() => setDeleteTarget(null)}>
            <div className="modal-content card w-full max-w-md">
              <div className="student-modal-header">
                <h3>
                  <Trash2 size={18} /> Delete Student Record
                </h3>
                <button type="button" className="icon-button" onClick={() => setDeleteTarget(null)}>
                  <X size={18} />
                </button>
              </div>
              <div className="student-delete-confirm">
                <p>Delete this student from normal staff views? Administrators and moderators will still see the record with a Deleted tag.</p>
                <div className="delete-student-highlight">
                  <strong>{deleteTarget.name}</strong> (Reg: {deleteTarget.registrationNumber})
                </div>
                <FinancialRemovalChoice allowArchive={manager} keep={manager ? keepFinancialRecords : true} onKeep={setKeepFinancialRecords} confirmed={confirmRemoval} onConfirm={setConfirmRemoval} />
                <div className="student-modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)}>
                    Cancel
                  </button>
                  <button type="button" className="btn-primary students-presentation-25" onClick={handleDeleteSubmit} disabled={submitting || !confirmRemoval}>
                    <Trash2 size={16} /> {submitting ? 'Submitting…' : 'Delete student'}
                  </button>
                </div>
              </div>
            </div>
          </Dialog>}
      </AnimatePresence>
    </div>;
}
