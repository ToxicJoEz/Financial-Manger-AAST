import { AnimatePresence } from 'framer-motion';
import { PageHeading } from '../components/WorkspaceUI';
import Dialog from '../components/Dialog';
import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { Shield, ShieldAlert, UserCheck, UserX, AlertTriangle, UserPlus, ListOrdered } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import CustomFilterDropdown from '../components/CustomFilterDropdown';
const ManageUsers = () => {
  const {
    user: currentUser
  } = useContext(AuthContext);
  if (currentUser && currentUser.role === 'user') {
    return <Navigate to="/" replace />;
  }
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showLogModal, setShowLogModal] = useState(false);
  const [logs, setLogs] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null); // { title, message, onConfirm }

  useEffect(() => {
    fetchUsers();
  }, []);
  const fetchUsers = async () => {
    try {
      const {
        data
      } = await axios.get('/users');
      const roleWeight = {
        admin: 1,
        mod: 2,
        user: 3
      };
      const sortedUsers = data.sort((a, b) => (roleWeight[a.role] || 4) - (roleWeight[b.role] || 4));
      setUsers(sortedUsers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  const fetchLogs = async () => {
    try {
      const {
        data
      } = await axios.get('/logs');
      setLogs(data);
      setShowLogModal(true);
    } catch (err) {
      console.error(err);
    }
  };
  const canModify = targetUser => {
    if (targetUser.username === 'main-admin') return false;
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'mod') {
      return targetUser.role === 'user';
    }
    return false;
  };
  const canUnlock = targetUser => {
    if (currentUser.role === 'admin') return true;
    if (currentUser.role === 'mod') {
      return targetUser.role === 'user';
    }
    return false;
  };
  const handleUnlock = async targetUser => {
    try {
      await axios.post(`/users/${targetUser.id}/unlock`);
      toast.success(`Account for ${targetUser.username} unlocked successfully`);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to unlock account');
    }
  };
  const executeAction = async (id, payload, endpoint) => {
    try {
      await axios.put(`/users/${id}/${endpoint}`, payload);
      toast.success('Action successful');
      fetchUsers(); // refresh
      setConfirmModal(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    }
  };
  const handleStatusToggle = (user, type) => {
    const isBanAction = type === 'ban';
    const currentValue = isBanAction ? user.isBanned : user.isActive;
    const newValue = isBanAction ? !user.isBanned : !user.isActive;
    setConfirmModal({
      title: isBanAction ? newValue ? 'Ban User' : 'Unban User' : newValue ? 'Reactivate User' : 'Deactivate User',
      message: `Are you sure you want to ${isBanAction ? newValue ? 'ban' : 'unban' : newValue ? 'reactivate' : 'deactivate'} ${user.username}?`,
      onConfirm: () => executeAction(user.id, {
        [isBanAction ? 'isBanned' : 'isActive']: newValue
      }, 'status')
    });
  };
  const handleRoleChange = (user, newRole) => {
    setConfirmModal({
      title: 'Change Role',
      message: `Are you sure you want to change ${user.username}'s role to ${newRole}?`,
      onConfirm: () => executeAction(user.id, {
        role: newRole
      }, 'role')
    });
  };
  if (!currentUser || currentUser.role !== 'admin' && currentUser.role !== 'mod') {
    return <div className="appearance-p-8 appearance-text-center appearance-font-bold appearance-text-red-500">Access Denied: Mods and Admins Only</div>;
  }
  return <div className="manage-users-container">
      <PageHeading eyebrow="The people you work with" title="Team & access" description="A shared workspace, with the right access for everyone.">
        {currentUser.role === 'admin' && <button onClick={fetchLogs} className="btn-secondary"><ListOrdered size={16} />Activity log</button>}
        <Link to="/register-user" className="btn-primary"><UserPlus size={16} />Add colleague</Link>
      </PageHeading>
      <div className="team-summary"><span><strong>{users.length}</strong> team members</span><span><i />{users.filter(u => u.isActive && !u.isBanned).length} active accounts</span></div>
      <div className="card overflow-x-auto">
        {loading ? <p className="text-muted">Loading users database...</p> : <table className="mu-table w-full appearance-text-left">
            <thead>
              <tr>
                <th>Team member</th>
                <th>Access Level</th>
                <th>Account Status</th>
                <th>Last Active</th>
                <th>Manage access</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      {u.avatar ? <img src={u.avatar} alt="Avatar" className="w-10 h-10 appearance-rounded-full object-cover appearance-border appearance-border-gray-200" /> : <div className="w-10 h-10 appearance-rounded-full appearance-bg-blue-100 flex items-center justify-center appearance-text-blue-600 appearance-font-bold">
                          {u.username.charAt(0).toUpperCase()}
                        </div>}
                      <div>
                        <div className="appearance-font-semibold">{u.username}</div>
                        <div className="appearance-text-xs text-muted">{u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}` : 'No Name Set'}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge-${u.role}`}>{u.role}</span>
                  </td>
                  <td>
                    <div className="flex gap-2 items-center flex-wrap">
                      {u.isActive ? <span className="badge badge-success">Active</span> : <span className="badge badge-error">Deactivated</span>}
                      {u.isBanned && <span className="badge badge-error">Banned</span>}
                      {u.isLocked && <span className="badge badge-error manageusers-presentation-16">Rate Locked</span>}
                    </div>
                  </td>
                  <td>
                    <span className="appearance-text-xs text-muted">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : 'Never'}
                    </span>
                  </td>
                  <td>
                    {u.username === 'main-admin' ? <span className="badge badge-admin">Root Admin</span> : <div className="flex items-center gap-2 flex-wrap">
                        {u.isLocked && canUnlock(u) && <button onClick={() => handleUnlock(u)} className="btn-sm btn-outline appearance-text-amber-600 appearance-border-amber-300 appearance-hover-bg-amber-50" title="Unlock rate-limited account">
                            Unlock
                          </button>}
                        {canModify(u) ? <>
                            <button onClick={() => handleStatusToggle(u, 'active')} className="btn-sm btn-outline">
                              {u.isActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                            <button onClick={() => handleStatusToggle(u, 'ban')} className={`btn-sm ${u.isBanned ? 'btn-outline' : 'btn-danger'}`}>
                              {u.isBanned ? 'Unban' : 'Ban'}
                            </button>

                            {/* Role Demote/Promote (Admin Only) */}
                            {currentUser.role === 'admin' && <div className="w-[110px] appearance-ml-2 inline-block">
                                <CustomFilterDropdown allowClear={false} value={u.role} onChange={val => handleRoleChange(u, val)} placeholder="Select Role" options={[{
                      value: 'user',
                      label: 'User'
                    }, {
                      value: 'mod',
                      label: 'Mod'
                    }, {
                      value: 'admin',
                      label: 'Admin'
                    }]} />
                              </div>}
                          </> : !u.isLocked && <span className="appearance-text-xs text-muted appearance-italic">Managed by an administrator</span>}
                      </div>}
                  </td>
                </tr>)}
            </tbody>
          </table>}
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>{confirmModal && <Dialog title="Confirm account change" onClose={() => setConfirmModal(null)}>
          <div className="modal-content card max-w-sm w-full relative">
            <h3 className="appearance-text-lg appearance-font-bold appearance-mb-2">{confirmModal.title}</h3>
            <p className="appearance-text-sm text-muted appearance-mb-6">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={confirmModal.onConfirm} className="btn-primary">Confirm Action</button>
            </div>
          </div>
        </Dialog>}</AnimatePresence>

      {/* Logs Modal (Admin Only) */}
      <AnimatePresence>{showLogModal && <Dialog title="Audit logs" onClose={() => setShowLogModal(false)}>
          <div className="modal-content card max-w-5xl w-full max-h-[85vh] flex flex-col relative">
            <div className="flex justify-between items-center appearance-mb-6">
              <div>
                <h3 className="appearance-text-xl appearance-font-bold">System Audit Logs</h3>
                <p className="appearance-text-xs text-muted appearance-mt-1">Immutable record of all state changes and authentications.</p>
              </div>
              <button onClick={() => setShowLogModal(false)} className="btn-secondary">Close</button>
            </div>
            
            <div className="overflow-y-auto flex-1 appearance-pr-2">
              <table className="mu-table w-full appearance-text-left appearance-text-sm">
                <thead className="sticky top-0 appearance-bg-white appearance-shadow-sm z-10">
                  <tr>
                    <th>Timestamp</th>
                    <th>Action Event</th>
                    <th>Actor</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => <tr key={log.id}>
                      <td className="text-muted appearance-text-xs">{new Date(log.createdAt).toLocaleString()}</td>
                      <td>
                        <span className="appearance-font-semibold text-primary">{log.action}</span>
                      </td>
                      <td className="appearance-font-medium">{log.actorUsername}</td>
                      <td className="text-muted">{log.description}</td>
                    </tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </Dialog>}</AnimatePresence>

    </div>;
};
export default ManageUsers;
