import {dateText} from '../utils/dates';
import ArchiveControls from '../components/ArchiveControls';
import StudentDetailsDialog from '../components/StudentDetailsDialog';
import { AuthContext } from '../context/AuthContext';
import StudentProfileFields from '../components/StudentProfileFields';
import FinancialRemovalChoice from '../components/FinancialRemovalChoice';
import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AnimatePresence } from 'framer-motion';
import { Plus, Edit2, Trash2, Search, Phone, GraduationCap, X, Check } from 'lucide-react';
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
  useEffect(() => { setKeepFinancialRecords(true); setConfirmRemoval(false); }, [deleteTarget]);
  useEffect(() => {
    fetchStudents();
    window.addEventListener('students-updated', fetchStudents);
    return () => window.removeEventListener('students-updated', fetchStudents);
  }, []);
  const fetchStudents = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/students');
      setStudents(res.data);
    } catch (err) {
      toast.error('Failed to load students directory');
    } finally {
      setLoading(false);
    }
  };
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
      toast.success(res.data.pending ? res.data.message : `Student ${res.data.name} registered`);
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
      const res = await axios.delete(`/students/${deleteTarget.id}`, { data: { keepFinancialRecords, confirm: confirmRemoval } });
      toast.success(res.data.pending ? res.data.message : `Removed student ${deleteTarget.name}`);
      window.dispatchEvent(new Event('notifications-updated'));
      setDeleteTarget(null);
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove student');
    } finally {
      setSubmitting(false);
    }
  };
  const filtered = students.filter(s => {
    if(Boolean(s.deletedAt)!==archivedView)return false;
    const q = searchTerm.toLowerCase();
    return (s.englishName || '').toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || (s.registrationNumber||'').toLowerCase().includes(q) || s.mobile && s.mobile.toLowerCase().includes(q);
  });
  return <div className="students-container">
      <PageHeading eyebrow="ACADEMIC DIRECTORY" title="Students" description="Comprehensive directory of registered students across all academic branches.">
        <button className="btn-primary" onClick={() => {
        resetAddForm();
        setIsAddModalOpen(true);
      }}>
          <Plus size={16} /> {manager ? 'Add student' : 'Request student addition'}
        </button>
      </PageHeading>

      {!manager && <p className="payment-view-note">Student additions require approval from an admin or moderator. Archiving and deletion are available only to managers. Pending requests appear in Notifications.</p>}
      {manager&&<div className="section-tabs"><button className={!archivedView?'active':''} onClick={()=>setArchivedView(false)}>Active students</button><button className={archivedView?'active':''} onClick={()=>setArchivedView(true)}>Archived students</button></div>}
      <div className="students-toolbar">
        <div className="students-search">
          <Search size={16} />
          <input type="text" placeholder="Search by name, registration ID, or phone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
        <div className="students-meta-summary">
          <span>
            Total: <strong>{students.length}</strong> {students.length === 1 ? 'student' : 'students'}
          </span>
          {searchTerm && <span>
              Matches: <strong>{filtered.length}</strong>
            </span>}
        </div>
      </div>

      {loading ? <div className="loading-state">
          <div className="loading-spinner" />
          <span>Loading student records...</span>
        </div> : filtered.length === 0 ? <div className="panel empty-state">
          <span className="empty-icon">
            <GraduationCap size={28} />
          </span>
          <h3>{students.length ? 'No matching students found' : 'No students registered yet'}</h3>
          <p>
            {students.length ? 'Try adjusting your search criteria.' : 'Add your first student to get started with course enrollments.'}
          </p>
          {!students.length && <button className="btn-primary" onClick={() => {
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
                  <th>Student</th>
                  <th>Registration ID</th>
                  <th>Contact</th>
                  <th>Registered On</th>
                  <th className="students-presentation-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(student => <tr key={student.id}>
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
                    <td>
                      <div className="student-actions-cell">
                        <button className="student-action-btn" aria-label={`Edit ${student.name}`} title="Edit student" onClick={() => setEditingStudent({
                    ...student
                  })}>
                          <Edit2 size={15} />
                        </button>
                        {manager&&<ArchiveControls entity="students" record={student} onSaved={fetchStudents}/>}

                      </div>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
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
                    <Plus size={16} /> {submitting ? 'Submitting…' : manager ? 'Register student' : 'Submit for approval'}
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
                <FinancialRemovalChoice keep={keepFinancialRecords} onKeep={setKeepFinancialRecords} confirmed={confirmRemoval} onConfirm={setConfirmRemoval} />
                <div className="student-modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)}>
                    Cancel
                  </button>
                  <button type="button" className="btn-primary students-presentation-25" onClick={handleDeleteSubmit} disabled={submitting || !confirmRemoval}>
                    <Trash2 size={16} /> {submitting ? 'Submitting…' : manager ? 'Delete student' : 'Request removal'}
                  </button>
                </div>
              </div>
            </div>
          </Dialog>}
      </AnimatePresence>
    </div>;
}
