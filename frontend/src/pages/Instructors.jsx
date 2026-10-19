import { AnimatePresence } from 'framer-motion';
import Dialog from '../components/Dialog';
import { useState, useEffect, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, Edit2, Trash2, Search, UserCheck, Briefcase, Phone } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { BRANCHES } from '../Constants';
import CustomFilterDropdown from '../components/CustomFilterDropdown';
import { getBranchColor } from '../utils/branchColors';
import { PageHeading, initials } from '../components/WorkspaceUI';
import { AuthContext } from '../context/AuthContext';
const Instructors = () => {
  const {
    user
  } = useContext(AuthContext);
  if (user && user.role === 'user') {
    return <Navigate to="/courses" replace />;
  }
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Create state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [branches, setBranches] = useState([]); // Multiple branches for instructor? Yes
  const [employeeId, setEmployeeId] = useState('');
  const [mobile, setMobile] = useState('');

  // Edit/Delete state
  const [editingInst, setEditingInst] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  useEffect(() => {
    fetchInstructors();
  }, []);
  const fetchInstructors = async () => {
    try {
      const res = await axios.get('/instructors');
      setInstructors(res.data);
    } catch (error) {
      toast.error('Failed to fetch instructors');
    } finally {
      setLoading(false);
    }
  };
  const handleAddSubmit = async e => {
    e.preventDefault();
    try {
      await axios.post('/instructors', {
        name,
        branches: branches.join(','),
        employeeId,
        mobile
      });
      toast.success('Instructor registered successfully');
      setIsAddModalOpen(false);
      resetForm();
      fetchInstructors();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Registration failed');
    }
  };
  const handleEditSubmit = async e => {
    e.preventDefault();
    try {
      await axios.put(`/instructors/${editingInst.id}`, {
        name: editingInst.name,
        branches: editingInst.branchesArray.join(','),
        employeeId: editingInst.employeeId,
        mobile: editingInst.mobile
      });
      toast.success('Instructor updated');
      setEditingInst(null);
      fetchInstructors();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Update failed');
    }
  };
  const confirmDelete = async () => {
    try {
      await axios.delete(`/instructors/${deleteId}`);
      toast.success('Instructor removed');
      setDeleteId(null);
      fetchInstructors();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Delete failed');
    }
  };
  const resetForm = () => {
    setName('');
    setBranches([]);
    setEmployeeId('');
    setMobile('');
  };
  const handleAddBranchToggle = branch => {
    if (branches.includes(branch)) {
      setBranches(branches.filter(b => b !== branch));
    } else {
      setBranches([...branches, branch]);
    }
  };
  const handleEditBranchToggle = branch => {
    let arr = editingInst.branchesArray || [];
    if (arr.includes(branch)) {
      arr = arr.filter(b => b !== branch);
    } else {
      arr = [...arr, branch];
    }
    setEditingInst({
      ...editingInst,
      branchesArray: arr
    });
  };
  const filtered = instructors.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()) || (i.branches || '').toLowerCase().includes(searchTerm.toLowerCase()) || (i.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase()));
  if (loading) {
    return <div className="appearance-p-8 appearance-text-gray-500">Loading directory...</div>;
  }
  return <div className="instructor-directory">
      <PageHeading eyebrow="PEOPLE & EXPERTISE" title="Instructors" description="The people behind every course. Keep their details in one place.">
        <button className="btn-primary" onClick={() => setIsAddModalOpen(true)}><Plus size={16} />Add instructor</button>
      </PageHeading>
      <div className="directory-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search instructors" placeholder="Find a name, branch, or employee ID…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div><div className="directory-summary"><span><strong>{instructors.length}</strong> instructors</span><span><strong>{new Set(instructors.flatMap(i => (i.branches || '').split(',').filter(Boolean))).size}</strong> branches</span></div></div>
      <div className="people-grid">{filtered.map(inst => <article className="person-card" key={inst.id}><div className="person-top"><span className="person-avatar">{initials(inst.name)}</span><div className="directory-actions"><button className="icon-button" aria-label={'Edit ' + inst.name} onClick={() => setEditingInst({
              ...inst,
              branchesArray: (inst.branches || '').split(',').map(b => b.trim())
            })}><Edit2 size={15} /></button><button className="icon-button danger" aria-label={'Delete ' + inst.name} onClick={() => setDeleteId(inst.id)}><Trash2 size={15} /></button></div></div><h2>{inst.name}</h2><p className="person-id">{inst.employeeId ? 'Employee ' + inst.employeeId : 'Teaching team'}</p><div className="directory-branches">{(inst.branches || '').split(',').filter(Boolean).map(b => <span className="branch-label" key={b}><span style={{
              "--runtime-background": getBranchColor(b.trim())
            }} className="instructors-presentation-15" />{b.trim()}</span>)}</div><div className="person-contact"><Phone size={13} />{inst.mobile ? <a href={'tel:' + inst.mobile}>{inst.mobile}</a> : 'Contact number not added'}</div></article>)}</div>
      {!filtered.length && <div className="panel empty-state"><UserCheck size={28} /><h3>{instructors.length ? 'No matching instructors' : 'Your teaching team starts here'}</h3><p>{instructors.length ? 'Try another name, branch, or employee ID.' : 'Add your first instructor to start building your courses.'}</p></div>}

      <AnimatePresence>{isAddModalOpen && <Dialog title="Add instructor" onClose={() => setIsAddModalOpen(false)}>
          <div className="modal-content card max-w-2xl w-full relative max-h-[90vh] overflow-y-auto">
            <h3 className="appearance-text-xl appearance-font-bold appearance-mb-4 flex items-center gap-2 appearance-text-blue-900">
              <Briefcase size={20} /> Register New Instructor
            </h3>
            <form onSubmit={handleAddSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="input-label appearance-text-blue-800">Full Name</label>
                  <input type="text" className="input-field appearance-border-blue-100 appearance-focus-border-blue-400" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div>
                  <label className="input-label appearance-text-blue-800">Employee ID</label>
                  <input type="text" className="input-field appearance-border-blue-100 appearance-focus-border-blue-400" value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="e.g. EMP-001" />
                </div>
                <div>
                  <label className="input-label appearance-text-blue-800">Mobile Number</label>
                  <input type="text" className="input-field appearance-border-blue-100 appearance-focus-border-blue-400" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="01xxxxxxxxx" />
                </div>
                <div>
                  <label className="input-label appearance-text-blue-800 appearance-mb-1 block">Campus Branches</label>
                  <div className="flex flex-wrap gap-2">
                    {BRANCHES.map(b => <button key={b} type="button" onClick={() => handleAddBranchToggle(b)} className={`appearance-px-3 appearance-py-1-5 appearance-rounded-lg appearance-text-sm appearance-font-bold appearance-border appearance-transition-colors ${branches.includes(b) ? "appearance-bg-blue-600 appearance-text-white appearance-border-blue-600" : "appearance-bg-gray-50 appearance-text-gray-500 appearance-border-gray-200 appearance-hover-bg-gray-100"}`}>
                        {b}
                      </button>)}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 appearance-mt-4">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="instructor-submit-btn appearance-px-6 appearance-py-2 appearance-rounded-lg appearance-font-semibold flex items-center gap-2">
                  <Plus size={18} /> Add
                </button>
              </div>
            </form>
          </div>
        </Dialog>}</AnimatePresence>

      <AnimatePresence>{editingInst && <Dialog title="Edit instructor" onClose={() => setEditingInst(null)}>
          <div className="modal-content card max-w-2xl w-full relative max-h-[90vh] overflow-y-auto">
            <h3 className="appearance-text-xl appearance-font-bold appearance-mb-4 flex items-center gap-2 appearance-text-blue-900">
              <Edit2 size={20} /> Update Instructor Profile
            </h3>
            <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="input-label appearance-text-blue-800">Full Name</label>
                  <input type="text" className="input-field appearance-border-blue-100 appearance-focus-border-blue-400" value={editingInst.name} onChange={e => setEditingInst({
                  ...editingInst,
                  name: e.target.value
                })} required />
                </div>
                <div>
                  <label className="input-label appearance-text-blue-800">Employee ID</label>
                  <input type="text" className="input-field appearance-border-blue-100 appearance-focus-border-blue-400" value={editingInst.employeeId || ''} onChange={e => setEditingInst({
                  ...editingInst,
                  employeeId: e.target.value
                })} placeholder="e.g. EMP-001" />
                </div>
                <div>
                  <label className="input-label appearance-text-blue-800">Mobile Number</label>
                  <input type="text" className="input-field appearance-border-blue-100 appearance-focus-border-blue-400" value={editingInst.mobile || ''} onChange={e => setEditingInst({
                  ...editingInst,
                  mobile: e.target.value
                })} placeholder="01xxxxxxxxx" />
                </div>
                <div>
                  <label className="input-label appearance-text-blue-800 appearance-mb-1 block">Campus Branches</label>
                  <div className="flex flex-wrap gap-2">
                    {BRANCHES.map(b => <button key={b} type="button" onClick={() => handleEditBranchToggle(b)} className={`appearance-px-3 appearance-py-1-5 appearance-rounded-lg appearance-text-sm appearance-font-bold appearance-border appearance-transition-colors ${(editingInst.branchesArray || []).includes(b) ? "appearance-bg-blue-600 appearance-text-white appearance-border-blue-600" : "appearance-bg-gray-50 appearance-text-gray-500 appearance-border-gray-200 appearance-hover-bg-gray-100"}`}>
                        {b}
                      </button>)}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 appearance-mt-4">
                <button type="button" onClick={() => setEditingInst(null)} className="btn-secondary">Cancel</button>
                <button type="submit" className="instructor-submit-btn appearance-px-6 appearance-py-2 appearance-rounded-lg appearance-font-semibold">Save Changes</button>
              </div>
            </form>
          </div>
        </Dialog>}</AnimatePresence>

      <AnimatePresence>{deleteId && <Dialog title="Delete instructor" onClose={() => setDeleteId(null)}>
          <div className="modal-content card max-w-sm w-full relative">
            <h3 className="appearance-text-xl appearance-font-bold appearance-mb-2 appearance-text-red-700">Remove Instructor</h3>
            <p className="appearance-text-sm appearance-text-gray-500 appearance-mb-6">Are you sure you want to permanently remove this instructor? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
              <button onClick={confirmDelete} className="appearance-bg-red-600 appearance-hover-bg-red-700 appearance-text-white appearance-px-4 appearance-py-2 appearance-rounded-lg appearance-font-semibold appearance-transition-colors">Yes, Remove</button>
            </div>
          </div>
        </Dialog>}</AnimatePresence>
    </div>;
};
export default Instructors;
