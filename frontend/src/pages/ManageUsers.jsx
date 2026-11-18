import '../styles/_placements.scss';
import { fullName } from '../utils/people';
import { AnimatePresence } from 'framer-motion';
import { PageHeading } from '../components/WorkspaceUI';
import Dialog from '../components/Dialog';
import BackupPanel from '../components/BackupPanel';
import BranchManager from '../components/BranchManager';
import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { UserPlus, ListOrdered, ShieldCheck, Pencil, Building2, DatabaseBackup, Trash2, AlertTriangle } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import CustomFilterDropdown from '../components/CustomFilterDropdown';
import { modTitleOptions, modTitle, branchName, canSeePayroll } from '../utils/access';
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
// Admins pick any role; the main mod picks user or branch mod; branch mods add users only.
function AccessFields({ form, setForm, adminView, canPickBranches }) {
  const roles = adminView ? ROLES : canPickBranches ? ROLES.filter(r => r.value !== 'admin') : ROLES.filter(r => r.value === 'user');
  const modOptions = adminView ? modTitleOptions() : modTitleOptions().filter(o => o.value !== 'MAIN');
  return <>
    <label>Role</label>
    <div className="access-role-picker" role="radiogroup" aria-label="Role">{roles.map(r => <button key={r.value} type="button" role="radio" aria-checked={form.role === r.value} className={form.role === r.value ? 'active' : ''} onClick={() => setForm(f => ({ ...f, role: r.value }))}><strong>{r.label}</strong><span>{r.help}</span></button>)}</div>
    {form.role === 'mod' && <><label htmlFor="access-branch">Mod for</label><CustomFilterDropdown id="access-branch" allowClear={false} value={form.branch} onChange={value => setForm(f => ({ ...f, branch: value }))} options={modOptions} placeholder={adminView ? 'Choose main or a branch' : 'Choose a branch'} /></>}
    {form.role === 'user' && (canPickBranches ? <><label>Can view branches</label><div className="access-branch-boxes">{BRANCHES.map(b => { const on = form.branches.includes(b); return <button key={b} type="button" role="checkbox" aria-checked={on} className={on ? 'active' : ''} style={{ '--branch-color': getBranchColor(b) }} onClick={() => setForm(f => ({ ...f, branches: on ? f.branches.filter(x => x !== b) : [...f.branches, b] }))}>{branchName(b)}</button>; })}</div><small className="muted">Users only view courses and students in these branches. With none, they see nothing.</small><label className="policy-check access-placement-toggle"><input type="checkbox" checked={Boolean(form.placement)} onChange={e => setForm(f => ({ ...f, placement: e.target.checked }))} /><span><strong>Placement tests</strong><small>Can open the Tests tab and record placement test results for these branches.</small></span></label></> : <small className="muted">New users see your branch only. The main mod can add more branches.</small>)}
  </>;
}

const ManageUsers = () => {
  const { user: currentUser } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === 'admin';
  // Permanent deletion (admins only): the username must be typed to confirm.
  const [deleting, setDeleting] = useState(null), [deleteBusy, setDeleteBusy] = useState(false);
  async function deleteAccount() {
    setDeleteBusy(true);
    try {
      const { data } = await axios.delete('/users/' + deleting.user.id, { data: { confirm: deleting.typed } });
      toast.success(data.message);
      setDeleting(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'The account could not be deleted.');
    } finally {
      setDeleteBusy(false);
    }
  }
  // Admins and the main mod choose which branches a user can view.
  const mainManager = canSeePayroll(currentUser);
  // Branches and Backup & restore open in their own window (admins and the main mod).
  const [teamPanel, setTeamPanel] = useState(null);
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
      setAdding({ firstName: '', lastName: '', username: '', password: '', role: 'user', branch: 'MAIN', branches: [] });
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  if (!currentUser || !['admin', 'mod'].includes(currentUser.role)) return <Navigate to="/" replace />;

  // Admins manage everyone; the main mod manages users and branch mods; branch mods manage users only.
  const canModify = target =>
    target.username !== 'main-admin' &&
    (isAdmin || target.role === 'user' || (mainManager && target.role === 'mod' && Boolean(target.branchScope)));
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
    if (adding.role === 'mod' && (!adding.branch || (!isAdmin && adding.branch === 'MAIN'))) return toast.error(isAdmin ? 'Choose the main mod or a branch.' : 'Choose a branch for the branch mod.');
    setSaving(true);
    try {
      const { data } = await axios.post('/auth/register', {
        username: adding.username.trim(),
        password: adding.password,
        firstName: adding.firstName,
        lastName: adding.lastName,
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
    if (form.role === 'mod' && (!form.branch || (!isAdmin && form.branch === 'MAIN'))) return toast.error(isAdmin ? 'Choose the main mod or a branch.' : 'Choose a branch for the branch mod.');
    setSaving(true);
    try {
      const branchScope = form.role === 'mod' && form.branch !== 'MAIN' ? form.branch : null;
      if (mainManager && ((form.firstName || '') !== (target.firstName || '') || (form.lastName || '') !== (target.lastName || '')))
        await axios.put(`/users/${target.id}/name`, { firstName: form.firstName, lastName: form.lastName });
      if (mainManager && form.role !== target.role) await axios.put(`/users/${target.id}/role`, { role: form.role, branchScope });
      if (mainManager && form.role === 'mod' && target.role === 'mod' && (target.branchScope || null) !== branchScope)
        await axios.put('/users/' + target.id + '/branch-scope', { branchScope });
      if (form.role === 'user' && mainManager && (target.role !== 'user' || (target.branches || '') !== BRANCHES.filter(b => form.branches.includes(b)).join(',')))
        await axios.put('/users/' + target.id + '/branches', { branches: form.branches });
      if (form.role === 'user' && mainManager && Boolean(form.placement) !== Boolean(target.canPlacementTest))
        await axios.put('/users/' + target.id + '/permissions', { canPlacementTest: Boolean(form.placement) });
      toast.success(`${fullName({ ...target, ...form })}'s access updated`);
      window.dispatchEvent(new Event('names-updated'));
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
      {mainManager && <button type="button" className="btn-secondary" onClick={() => setTeamPanel('branches')}><Building2 size={16} />Branches</button>}
      {mainManager && <button type="button" className="btn-secondary" onClick={() => setTeamPanel('backup')}><DatabaseBackup size={16} />Backup &amp; restore</button>}
      {mainManager && <Link to="/logs" className="btn-secondary"><ListOrdered size={16} />Activity log</Link>}
      <button type="button" className="btn-primary" onClick={() => setAdding({ firstName: '', lastName: '', username: '', password: '', role: 'user', branch: 'MAIN', branches: [] })}><UserPlus size={16} />Add person</button>
    </PageHeading>
    {teamPanel && <Dialog title={teamPanel === 'branches' ? 'Branches' : 'Backup & restore'} onClose={() => setTeamPanel(null)}><div className="modal-content card team-panel-modal">{teamPanel === 'branches' ? <BranchManager /> : <BackupPanel />}</div></Dialog>}
    <div className="team-summary"><span><strong>{users.length}</strong> team members</span><span><i />{users.filter(u => !u.isBanned).length} active accounts</span></div>
    <div className="card overflow-x-auto">
      {loading ? <p className="text-muted">Loading the team…</p> : <table className="mu-table team-table w-full">
        <thead><tr><th>Person</th><th>Access</th><th>Status</th><th>Last active</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {users.map(u => <tr key={u.id}>
            <td><div className="team-person">{u.avatar ? <img src={u.avatar} alt="" /> : <span className="team-avatar">{fullName(u).charAt(0).toUpperCase()}</span>}<div><strong>{fullName(u)}</strong><small>Signs in as {u.username}{!u.firstName && !u.lastName ? ' · no name set' : ''}</small></div></div></td>
            <td><span className={`team-role team-role-${u.role}${u.branchScope ? ' is-branch' : ''}`}>{roleLabel(u)}</span><small className="team-access">{accessSummary(u)}</small>{u.role === 'user' && u.canPlacementTest && <span className="team-placement-tag">Placement tests</span>}</td>
            <td><div className="team-status">{u.isBanned ? <span className="badge badge-error">Banned</span> : u.isActive ? <span className="badge badge-success">Active</span> : <span className="badge badge-error">Deactivated</span>}{u.isLocked && <span className="badge badge-warning">Locked (too many sign-in attempts)</span>}</div></td>
            <td className="team-last">{lastActive(u.lastLogin)}</td>
            <td>{u.username === 'main-admin' ? <span className="team-root"><ShieldCheck size={15} />Root admin</span> : <div className="team-actions">
              {u.isLocked && canModify(u) && <button className="btn-sm btn-outline" onClick={() => handleUnlock(u)}>Unlock</button>}
              {canModify(u) ? <>
                <button className="btn-sm btn-outline" onClick={() => setEditing({ user: u, form: { firstName: u.firstName || '', lastName: u.lastName || '', role: u.role, branch: u.branchScope || 'MAIN', branches: u.branches ? u.branches.split(',') : [], placement: Boolean(u.canPlacementTest) } })}><Pencil size={13} />Edit access</button>

                <button className={`btn-sm ${u.isBanned ? 'btn-outline' : 'btn-danger'}`} onClick={() => handleStatusToggle(u, 'ban')}>{u.isBanned ? 'Unban' : 'Ban'}</button>
                {isAdmin && u.id !== currentUser?.id && <button className="btn-sm btn-outline team-delete" title="Permanently delete this account" aria-label={'Permanently delete ' + u.username} onClick={() => setDeleting({ user: u, typed: '' })}><Trash2 size={13} />Delete</button>}
              </> : <span className="text-muted team-managed">Managed by an admin</span>}
            </div>}</td>
          </tr>)}
        </tbody>
      </table>}
    </div>

    <AnimatePresence>{adding && <Dialog title="Add person" onClose={saving ? () => {} : () => setAdding(null)}>
      <form className="modal-content card team-dialog" onSubmit={createAccount}>
        <h3><UserPlus size={18} />Add a person</h3>
        <p>Their full name is what everyone sees. The username is only for signing in: set it and a first password, then share them privately.</p>
        <div className="team-name-fields"><label>First name<input className="input-field" required autoComplete="off" value={adding.firstName} onChange={e => setAdding(f => ({ ...f, firstName: e.target.value }))} /></label><label>Last name<input className="input-field" autoComplete="off" value={adding.lastName} onChange={e => setAdding(f => ({ ...f, lastName: e.target.value }))} /></label></div>
        <label htmlFor="new-username">Username (for signing in)</label>
        <input id="new-username" className="input-field" required autoComplete="off" placeholder="e.g. sarah" value={adding.username} onChange={e => setAdding(f => ({ ...f, username: e.target.value }))} />
        <label htmlFor="initial-password">First password</label>
        <input id="initial-password" className="input-field" required type="password" autoComplete="new-password" value={adding.password} onChange={e => setAdding(f => ({ ...f, password: e.target.value }))} />
        <AccessFields form={adding} setForm={setAdding} adminView={isAdmin} canPickBranches={mainManager} />
        <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={saving} onClick={() => setAdding(null)}>Cancel</button><button className="btn-primary" disabled={saving}><UserPlus size={16} />{saving ? 'Creating…' : 'Create account'}</button></div>
      </form>
    </Dialog>}</AnimatePresence>

    <AnimatePresence>{editing && <Dialog title="Edit access" onClose={saving ? () => {} : () => setEditing(null)}>
      <div className="modal-content card team-dialog">
        <h3><Pencil size={17} />{fullName(editing.user)}</h3>
        <div className="team-name-fields"><label>First name<input className="input-field" value={editing.form.firstName} onChange={e => setEditing(x => ({ ...x, form: { ...x.form, firstName: e.target.value } }))} /></label><label>Last name<input className="input-field" value={editing.form.lastName} onChange={e => setEditing(x => ({ ...x, form: { ...x.form, lastName: e.target.value } }))} /></label></div>
        <small className="muted">Signs in as {editing.user.username}</small>
        <p>Now: {roleLabel(editing.user)} · {accessSummary(editing.user)}</p>
        <AccessFields form={editing.form} setForm={update => setEditing(e => ({ ...e, form: typeof update === 'function' ? update(e.form) : update }))} adminView={isAdmin} canPickBranches={mainManager} />
        <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button type="button" className="btn-primary" disabled={saving} onClick={saveAccess}>{saving ? 'Saving…' : 'Save access'}</button></div>
      </div>
    </Dialog>}</AnimatePresence>

    <AnimatePresence>{deleting && <Dialog title="Delete account" onClose={() => { if (!deleteBusy) setDeleting(null); }}>
      <div className="modal-content card max-w-sm w-full relative team-delete-dialog">
        <h3 className="team-confirm-title"><AlertTriangle size={18} />Permanently delete {deleting.user.username}?</h3>
        <p className="text-muted">The account is removed for good and can't be restored. Their notifications and pending employee requests go with it. Cycles, students and payments they recorded stay, and the activity log keeps what they did.</p>
        <label className="team-delete-confirm">Type <strong>{deleting.user.username}</strong> to confirm<input className="input-field" autoFocus value={deleting.typed} onChange={e => setDeleting(d => ({ ...d, typed: e.target.value }))} /></label>
        <div className="flex justify-end gap-3"><button onClick={() => setDeleting(null)} disabled={deleteBusy} className="btn-secondary">Cancel</button><button onClick={deleteAccount} disabled={deleteBusy || deleting.typed !== deleting.user.username} className="btn-primary btn-danger-solid">{deleteBusy ? 'Deleting…' : 'Delete permanently'}</button></div>
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
