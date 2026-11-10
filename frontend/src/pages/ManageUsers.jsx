import { AnimatePresence } from 'framer-motion';
import { PageHeading } from '../components/WorkspaceUI';
import Dialog from '../components/Dialog';
import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { UserPlus, ListOrdered, ShieldCheck, Pencil } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import CustomFilterDropdown from '../components/CustomFilterDropdown';
import { MOD_TITLE_OPTIONS, modTitle, branchName, canSeePayroll } from '../utils/access';
import { BRANCHES } from '../Constants';
import { getBranchColor } from '../utils/branchColors';

const ROLES = [
  { value: 'user', label: 'User', help: 'Views courses and students in their branches. Can only request employee changes.' },
  { value: 'mod', label: 'Mod', help: 'Manages courses, students and money. Choose the main mod or a branch.' },
  { value: 'admin', label: 'Admin', help: 'Full access, including team accounts.' }
];
// What each person can do, in plain words.
const accessSummary = u =>
  u.role === 'admin'
    ? 'Everything, including team accounts'
    : u.role === 'mod'
      ? u.branchScope
        ? `${branchName(u.branchScope)} only · no payroll · money checked by the main mod`
        : 'All branches · payroll · checks branch money'
      : u.branches
        ? `Views ${u.branches.split(',').map(branchName).join(', ')} · view only`
        : 'No branches yet · sees nothing until assigned';
const roleLabel = u => (u.role === 'mod' ? modTitle(u) : u.role === 'admin' ? 'Admin' : 'User');
const lastActive = value =>
  value
    ? new Date(value).toLocaleDateString('en-GB', { year: '2-digit', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'Never';

// Role, mod branch and the books permission, shared by the add and edit dialogs.
function AccessFields({ form, setForm, adminView, canPickBranches }) {
  const roles = adminView ? ROLES : ROLES.filter(r => r.value === 'user');
  return <>
    <label>Role</label>
    <div className="access-role-picker" role="radiogroup" aria-label="Role">{roles.map(r => <button key={r.value} type="button" role="radio" aria-checked={form.role === r.value} className={form.role === r.value ? 'active' : ''} onClick={() => setForm(f => ({ ...f, role: r.value }))}><strong>{r.label}</strong><span>{r.help}</span></button>)}</div>
    {form.role === 'mod' && <><label htmlFor="access-branch">Mod for</label><CustomFilterDropdown id="access-branch" allowClear={false} value={form.branch} onChange={value => setForm(f => ({ ...f, branch: value }))} options={MOD_TITLE_OPTIONS} placeholder="Choose main or a branch" /></>}
    {form.role === 'user' && (canPickBranches ? <><label>Can view branches</label><div className="access-branch-boxes">{BRANCHES.map(b => { const on = form.branches.includes(b); return <button key={b} type="button" role="checkbox" aria-checked={on} className={on ? 'active' : ''} style={{ '--branch-color': getBranchColor(b) }} onClick={() => setForm(f => ({ ...f, branches: on ? f.branches.filter(x => x !== b) : [...f.branches, b] }))}>{branchName(b)}</button>; })}</div><small className="muted">Users only view courses and students in these branches. With none, they see nothing.</small></> : <small className="muted">New users see your branch only. The main mod can add more branches.</small>)}
  </>;
}

const ManageUsers = () => {
  const { user: currentUser } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === 'admin';
  // Admins and the main mod choose which branches a user can view.
  const mainManager = canSeePayroll(currentUser);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, onConfirm }
  const [adding, setAdding] = useState(null); // new account form
  const [editing, setEditing] = useState(null); // { user, form }
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    try {
      const { data } = await axios.get('/users');
      const weight = u => (u.role === 'admin' ? 1 : u.role === 'mod' ? (u.branchScope ? 3 : 2) : 4);
      setUsers(data.sort((a, b) => weight(a) - weight(b) || a.username.localeCompare(b.username)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (['admin', 'mod'].includes(currentUser?.role)) fetchUsers();
  }, [currentUser?.role]);
  // Old "Add colleague" links open the add dialog here.
  useEffect(() => {
    if (location.state?.add) {
      setAdding({ username: '', password: '', role: 'user', branch: 'MAIN', branches: [] });
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  if (!currentUser || !['admin', 'mod'].includes(currentUser.role)) return <Navigate to="/" replace />;

  const canModify = target => target.username !== 'main-admin' && (isAdmin || (currentUser.role === 'mod' && target.role === 'user'));
  const handleUnlock = async target => {
    try {
      await axios.post(`/users/${target.id}/unlock`);
      toast.success(`Account for ${target.username} unlocked`);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to unlock account');
    }
  };
  const handleStatusToggle = (target, type) => {
    const ban = type === 'ban';
    const value = ban ? !target.isBanned : !target.isActive;
    const verb = ban ? (value ? 'ban' : 'unban') : value ? 'reactivate' : 'deactivate';
    setConfirmModal({
      title: verb.charAt(0).toUpperCase() + verb.slice(1) + ' ' + target.username,
      message: `Are you sure you want to ${verb} ${target.username}?`,
      onConfirm: async () => {
        try {
          await axios.put(`/users/${target.id}/status`, { [ban ? 'isBanned' : 'isActive']: value });
          toast.success(`${target.username} updated`);
          setConfirmModal(null);
          fetchUsers();
        } catch (err) {
          toast.error(err.response?.data?.error || 'Action failed');
        }
      }
    });
  };

  async function createAccount(e) {
    e.preventDefault();
    if (adding.role === 'mod' && !adding.branch) return toast.error('Choose the main mod or a branch.');
    setSaving(true);
    try {
      const { data } = await axios.post('/auth/register', {
        username: adding.username.trim(),
        password: adding.password,
        role: adding.role,
        branchScope: adding.role === 'mod' && adding.branch !== 'MAIN' ? adding.branch : null,
        branches: adding.role === 'user' ? adding.branches : undefined
      });
      toast.success(`Account for ${data.user.username} created. Share the password privately.`);
      setAdding(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'The account could not be created.');
    } finally {
      setSaving(false);
    }
  }

  async function saveAccess() {
    const { user: target, form } = editing;
    if (form.role === 'mod' && !form.branch) return toast.error('Choose the main mod or a branch.');
    setSaving(true);
    try {
      if (isAdmin && form.role !== target.role) await axios.put(`/users/${target.id}/role`, { role: form.role });
      const branchScope = form.role === 'mod' && form.branch !== 'MAIN' ? form.branch : null;
      if (isAdmin && form.role === 'mod' && (target.role !== 'mod' || (target.branchScope || null) !== branchScope))
        await axios.put('/users/' + target.id + '/branch-scope', { branchScope });
      if (form.role === 'user' && mainManager && (target.role !== 'user' || (target.branches || '') !== BRANCHES.filter(b => form.branches.includes(b)).join(',')))
        await axios.put('/users/' + target.id + '/branches', { branches: form.branches });
      toast.success(`${target.username}'s access updated`);
      setEditing(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Access could not be updated.');
      fetchUsers();
    } finally {
      setSaving(false);
    }
  }

  return <div className="manage-users-container">
    <PageHeading eyebrow="The people you work with" title="Team & access" description="Everyone in the workspace, and what they can do.">
      <Link to="/logs" className="btn-secondary"><ListOrdered size={16} />Activity log</Link>
      <button type="button" className="btn-primary" onClick={() => setAdding({ username: '', password: '', role: 'user', branch: 'MAIN', branches: [] })}><UserPlus size={16} />Add person</button>
    </PageHeading>
    <div className="team-summary"><span><strong>{users.length}</strong> team members</span><span><i />{users.filter(u => u.isActive && !u.isBanned).length} active accounts</span></div>
    <div className="card overflow-x-auto">
      {loading ? <p className="text-muted">Loading the team…</p> : <table className="mu-table team-table w-full">
        <thead><tr><th>Person</th><th>Access</th><th>Status</th><th>Last active</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {users.map(u => <tr key={u.id}>
            <td><div className="team-person">{u.avatar ? <img src={u.avatar} alt="" /> : <span className="team-avatar">{u.username.charAt(0).toUpperCase()}</span>}<div><strong>{u.username}</strong><small>{u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : 'No name set'}</small></div></div></td>
            <td><span className={`team-role team-role-${u.role}${u.branchScope ? ' is-branch' : ''}`}>{roleLabel(u)}</span><small className="team-access">{accessSummary(u)}</small></td>
            <td><div className="team-status">{u.isBanned ? <span className="badge badge-error">Banned</span> : u.isActive ? <span className="badge badge-success">Active</span> : <span className="badge badge-error">Deactivated</span>}{u.isLocked && <span className="badge badge-warning">Locked (too many sign-in attempts)</span>}</div></td>
            <td className="team-last">{lastActive(u.lastLogin)}</td>
            <td>{u.username === 'main-admin' ? <span className="team-root"><ShieldCheck size={15} />Root admin</span> : <div className="team-actions">
              {u.isLocked && canModify(u) && <button className="btn-sm btn-outline" onClick={() => handleUnlock(u)}>Unlock</button>}
              {canModify(u) ? <>
                <button className="btn-sm btn-outline" onClick={() => setEditing({ user: u, form: { role: u.role, branch: u.branchScope || 'MAIN', branches: u.branches ? u.branches.split(',') : [] } })}><Pencil size={13} />Edit access</button>
                <button className="btn-sm btn-outline" onClick={() => handleStatusToggle(u, 'active')}>{u.isActive ? 'Deactivate' : 'Reactivate'}</button>
                <button className={`btn-sm ${u.isBanned ? 'btn-outline' : 'btn-danger'}`} onClick={() => handleStatusToggle(u, 'ban')}>{u.isBanned ? 'Unban' : 'Ban'}</button>
              </> : <span className="text-muted team-managed">Managed by an admin</span>}
            </div>}</td>
          </tr>)}
        </tbody>
      </table>}
    </div>

    <AnimatePresence>{adding && <Dialog title="Add person" onClose={saving ? () => {} : () => setAdding(null)}>
      <form className="modal-content card team-dialog" onSubmit={createAccount}>
        <h3><UserPlus size={18} />Add a person</h3>
        <p>Set a username and a first password, then share them privately. They can change the password in My profile.</p>
        <label htmlFor="new-username">Username</label>
        <input id="new-username" className="input-field" required autoComplete="off" placeholder="e.g. sarah" value={adding.username} onChange={e => setAdding(f => ({ ...f, username: e.target.value }))} />
        <label htmlFor="initial-password">First password</label>
        <input id="initial-password" className="input-field" required type="password" autoComplete="new-password" value={adding.password} onChange={e => setAdding(f => ({ ...f, password: e.target.value }))} />
        <AccessFields form={adding} setForm={setAdding} adminView={isAdmin} canPickBranches={mainManager} />
        <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={saving} onClick={() => setAdding(null)}>Cancel</button><button className="btn-primary" disabled={saving}><UserPlus size={16} />{saving ? 'Creating…' : 'Create account'}</button></div>
      </form>
    </Dialog>}</AnimatePresence>

    <AnimatePresence>{editing && <Dialog title="Edit access" onClose={saving ? () => {} : () => setEditing(null)}>
      <div className="modal-content card team-dialog">
        <h3><Pencil size={17} />{editing.user.username}</h3>
        <p>Now: {roleLabel(editing.user)} · {accessSummary(editing.user)}</p>
        <AccessFields form={editing.form} setForm={update => setEditing(e => ({ ...e, form: typeof update === 'function' ? update(e.form) : update }))} adminView={isAdmin} canPickBranches={mainManager} />
        <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button type="button" className="btn-primary" disabled={saving} onClick={saveAccess}>{saving ? 'Saving…' : 'Save access'}</button></div>
      </div>
    </Dialog>}</AnimatePresence>

    <AnimatePresence>{confirmModal && <Dialog title="Confirm account change" onClose={() => setConfirmModal(null)}>
      <div className="modal-content card max-w-sm w-full relative">
        <h3 className="team-confirm-title">{confirmModal.title}</h3>
        <p className="text-muted">{confirmModal.message}</p>
        <div className="flex justify-end gap-3"><button onClick={() => setConfirmModal(null)} className="btn-secondary">Cancel</button><button onClick={confirmModal.onConfirm} className="btn-primary">Confirm</button></div>
      </div>
    </Dialog>}</AnimatePresence>
  </div>;
};
export default ManageUsers;
