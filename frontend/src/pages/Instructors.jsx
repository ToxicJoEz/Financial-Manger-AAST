import ArchiveControls from '../components/ArchiveControls';
import EmployeeDetailsDialog from '../components/EmployeeDetailsDialog';
import {MotionRegion} from '../components/WorkspaceMotion';
import '../styles/_employeeDirectory.scss';
import EmployeeImportDialog from '../components/EmployeeImportDialog';
import { AnimatePresence } from 'framer-motion';
import Dialog from '../components/Dialog';
import { useState, useEffect, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, Edit2, Trash2, Search, UserCheck, Briefcase, Phone, Upload, LayoutGrid, List, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [instructors, setInstructors] = useState([]);
  const [importOpen,setImportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter,setBranchFilter]=useState([]),[status,setStatus]=useState('all'),[sort,setSort]=useState('name');
  const [view,setView]=useState(()=>localStorage.getItem('aast-employee-view')==='list'?'list':'grid');
  const [page,setPage]=useState(1),[total,setTotal]=useState(0),[refresh,setRefresh]=useState(0),[loadError,setLoadError]=useState('');
  const [profileId,setProfileId]=useState(null);
  const branchKey=branchFilter.join(',');
  const clearFilters=()=>{setSearchTerm('');setBranchFilter([]);setStatus('all');setSort('name');setPage(1);};
  const changeView=value=>{setView(value);localStorage.setItem('aast-employee-view',value);};

  // Create state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [branches, setBranches] = useState([]); // Multiple branches for instructor? Yes
  const [employeeId, setEmployeeId] = useState('');
  const [mobile, setMobile] = useState('');

  // Edit/Delete state
  const [editingInst, setEditingInst] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  useEffect(()=>{
    if(user?.role==='user')return;
    const controller=new AbortController();setLoading(true);setLoadError('');
    const timer=setTimeout(()=>axios.get('/employees/directory',{params:{search:searchTerm,branches:branchKey,status,sort,page},signal:controller.signal}).then(({data})=>{
      if(controller.signal.aborted)return;
      const last=Math.max(1,Math.ceil(data.total/data.pageSize));if(page>last){setPage(last);return;}
      setInstructors(data.rows);setTotal(data.total);
    }).catch(e=>{if(!controller.signal.aborted)setLoadError(e.response?.data?.error||'Employee directory could not be loaded.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);}),200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[searchTerm,branchKey,status,sort,page,refresh,user?.role]);
  const fetchInstructors=()=>setRefresh(n=>n+1);
  const handleAddSubmit = async e => {
    e.preventDefault();
    try {
      await axios.post('/employees', {
        name,
        branches: branches.join(','),
        employeeId,
        mobile
      });
      toast.success("Employee registered successfully");
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
      await axios.put(`/employees/${editingInst.id}`, {
        name: editingInst.name,
        branches: editingInst.branchesArray.join(','),
        employeeId: editingInst.employeeId,
        mobile: editingInst.mobile
      });
      toast.success("Employee updated");
      setEditingInst(null);
      fetchInstructors();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Update failed');
    }
  };
  const confirmDelete = async () => {
    try {
      await axios.delete(`/employees/${deleteId}`);
      toast.success("Employee removed");
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
  const filtered=instructors;
  const branchBadges=inst=><div className="directory-branches">{(inst.branches||'').split(',').filter(Boolean).map(b=><span className="branch-label" key={b}><i style={{background:getBranchColor(b.trim())}}/>{b.trim()}</span>)}</div>;
  const actions=inst=><div className="directory-actions"><button className="icon-button" aria-label={'Edit '+inst.name} onClick={()=>setEditingInst({...inst,branchesArray:inst.branches.split(',').map(b=>b.trim())})}><Edit2 size={15}/></button><ArchiveControls entity="employees" record={inst} onSaved={fetchInstructors}/></div>;
  if(user?.role==='user')return <Navigate to="/courses" replace/>;
  return <div className="instructor-directory">
      <PageHeading eyebrow="EMPLOYEE DIRECTORY" title="Employees" description="Your academy team, across roles and branches.">
        <button className="btn-secondary" onClick={()=>setImportOpen(true)}><Upload size={16}/>Import Excel</button><button className="btn-primary" onClick={() => setIsAddModalOpen(true)}><Plus size={16} />Add employee</button>
      </PageHeading>
      <AnimatePresence>{importOpen&&<EmployeeImportDialog onClose={()=>setImportOpen(false)} onSaved={fetchInstructors}/>}</AnimatePresence>
      <AnimatePresence>{profileId&&<EmployeeDetailsDialog key={profileId} employeeId={profileId} onClose={()=>setProfileId(null)}/>}</AnimatePresence>
      <div className="employee-directory-controls">
       <div className="directory-toolbar"><div className="search-field"><Search size={17}/><input aria-label="Search employees" placeholder="Search name, employee ID, or mobile…" value={searchTerm} onChange={e=>{setSearchTerm(e.target.value);setPage(1);}}/></div><div className="employee-directory-select"><CustomFilterDropdown value={sort} onChange={v=>{setSort(v);setPage(1);}} allowClear={false} placeholder="Sort employees" options={[{value:'name',label:'Name'},{value:'employeeId',label:'Employee ID'},{value:'active',label:'Most active cycles'}]}/></div></div>
       <div className="employee-status-filters" aria-label="Filter employees by availability">{[['all','Active employees'],['inactive','Free employees'],['active','With ongoing courses'],['archived','Archived employees']].map(([value,label])=><button type="button" key={value} aria-pressed={status===value} className={status===value?'active':''} onClick={()=>{setStatus(value);setPage(1);}}><span className={'availability-dot availability-'+value}/>{label}</button>)}<span className="employee-status-help">Free = no ongoing cycles</span></div>
       <div className="employee-branch-filters" aria-label="Filter employees by branch"><span>Branches</span>{BRANCHES.map(b=><button key={b} aria-pressed={branchFilter.includes(b)} className={branchFilter.includes(b)?'active':''} style={{'--branch-color':getBranchColor(b)}} onClick={()=>{setBranchFilter(old=>old.includes(b)?old.filter(x=>x!==b):[...old,b]);setPage(1);}}><i/>{b}</button>)}</div>
       <div className="employee-directory-meta"><span aria-live="polite">{loading?'Updating directory…':`${total} employees`}</span>{(searchTerm||branchFilter.length>0||status!=='all'||sort!=='name')&&<button className="text-button" onClick={clearFilters}>Clear filters</button>}<div className="view-switch" aria-label="Employee view"><button aria-label="Card view" aria-pressed={view==='grid'} className={view==='grid'?'active':''} onClick={()=>changeView('grid')}><LayoutGrid size={17}/></button><button aria-label="List view" aria-pressed={view==='list'} className={view==='list'?'active':''} onClick={()=>changeView('list')}><List size={17}/></button></div></div>
      </div>
      {loading?<div className="loading-state" role="status"><span className="loading-spinner"/>Loading employees…</div>:loadError?<div className="empty-state"><p role="alert">{loadError}</p><button className="btn-secondary" onClick={fetchInstructors}>Try again</button></div>:<MotionRegion transitionKey={view+':'+page+':'+status+':'+branchKey+':'+searchTerm}>
      {view==='grid'?<div className="people-grid">{filtered.map(inst=><article className="person-card employee-directory-card" key={inst.id}><div className="person-top"><span className="person-avatar">{initials(inst.name)}</span>{actions(inst)}</div><button className="employee-name-button" aria-label={'View '+inst.name+' details'} onClick={()=>setProfileId(inst.id)}><h2 dir="auto">{inst.name}</h2><ChevronRight size={17}/></button><p className="person-id">{inst.employeeId?'Employee '+inst.employeeId:'Employee ID not recorded'}</p>{branchBadges(inst)}<div className="person-contact"><Phone size={13}/>{inst.mobile?<a href={'tel:'+inst.mobile}>{inst.mobile}</a>:'Contact number not added'}</div><button className="employee-assignment-summary" onClick={()=>setProfileId(inst.id)} aria-label={'View cycles for '+inst.name}><span><BookOpen size={14}/><b>{inst.activeCount}</b> ongoing</span><span><b>{inst.completedCount}</b> completed</span><ChevronRight size={15}/></button></article>)}</div>:<div className="employee-list"><div className="employee-list-head" aria-hidden="true"><span>Employee</span><span>Branches</span><span>Course activity</span><span>Contact</span><span/></div>{filtered.map(inst=><article className="employee-list-row" key={inst.id}>
       <button className="employee-list-person" aria-label={'View '+inst.name+' details'} onClick={()=>setProfileId(inst.id)}><span className="employee-list-avatar">{initials(inst.name)}</span><span><strong dir="auto">{inst.name}</strong><small>{inst.employeeId?'ID · '+inst.employeeId:'No employee ID'}</small></span></button>
       <div className="employee-list-branches">{branchBadges(inst)}</div>
       <button className="employee-list-activity" onClick={()=>setProfileId(inst.id)} aria-label={'View cycles for '+inst.name}><span className={'employee-availability '+(inst.activeCount?'is-teaching':'is-free')}><i/>{inst.activeCount?`${inst.activeCount} ongoing`:'Free'}</span><small>{inst.completedCount} completed cycles</small></button>
       <div className="employee-list-contact">{inst.mobile?<a href={'tel:'+inst.mobile}><Phone size={13}/>{inst.mobile}</a>:<span>Not recorded</span>}</div>
       <div className="employee-list-actions">{actions(inst)}<button className="icon-button employee-open-profile" aria-label={'Open '+inst.name+' profile'} onClick={()=>setProfileId(inst.id)}><ChevronRight size={18}/></button></div>
      </article>)}</div>}

      {!filtered.length&&<div className="panel empty-state"><UserCheck size={28}/><h3>No matching employees</h3><p>Try another search or clear the filters. You can also add an employee or import a workbook.</p><button className="btn-secondary" onClick={clearFilters}>Clear filters</button></div>}
      {total>24&&<div className="employee-directory-pagination"><span>{(page-1)*24+1}–{Math.min(page*24,total)} of {total}</span><button className="btn-secondary" aria-label="Previous employee page" disabled={page===1} onClick={()=>setPage(n=>n-1)}><ChevronLeft size={16}/>Previous</button><span>{page} / {Math.ceil(total/24)}</span><button className="btn-secondary" aria-label="Next employee page" disabled={page*24>=total} onClick={()=>setPage(n=>n+1)}>Next<ChevronRight size={16}/></button></div>}
      </MotionRegion>}

      <AnimatePresence>{isAddModalOpen && <Dialog title="Add employee" onClose={() => setIsAddModalOpen(false)}>
          <div className="modal-content card max-w-2xl w-full relative max-h-[90vh] overflow-y-auto">
            <h3 className="appearance-text-xl appearance-font-bold appearance-mb-4 flex items-center gap-2 appearance-text-blue-900">
              <Briefcase size={20} /> Register New Employee
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

      <AnimatePresence>{editingInst && <Dialog title="Edit employee" onClose={() => setEditingInst(null)}>
          <div className="modal-content card max-w-2xl w-full relative max-h-[90vh] overflow-y-auto">
            <h3 className="appearance-text-xl appearance-font-bold appearance-mb-4 flex items-center gap-2 appearance-text-blue-900">
              <Edit2 size={20} /> Update Employee Profile
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

      <AnimatePresence>{deleteId && <Dialog title="Delete employee" onClose={() => setDeleteId(null)}>
          <div className="modal-content card max-w-sm w-full relative">
            <h3 className="appearance-text-xl appearance-font-bold appearance-mb-2 appearance-text-red-700">Remove Employee</h3>
            <p className="appearance-text-sm appearance-text-gray-500 appearance-mb-6">Are you sure you want to permanently remove this employee? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="btn-secondary">Cancel</button>
              <button onClick={confirmDelete} className="appearance-bg-red-600 appearance-hover-bg-red-700 appearance-text-white appearance-px-4 appearance-py-2 appearance-rounded-lg appearance-font-semibold appearance-transition-colors">Yes, Remove</button>
            </div>
          </div>
        </Dialog>}</AnimatePresence>
    </div>;
};
export default Instructors;
