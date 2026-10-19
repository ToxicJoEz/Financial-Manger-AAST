import { PageHeading, initials } from '../components/WorkspaceUI';
import { useState, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { User, Lock, Save } from 'lucide-react';
const Profile = () => {
  const {
    user,
    ssoLoginHandler
  } = useContext(AuthContext);
  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [avatar, setAvatar] = useState(user.avatar || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState({
    type: '',
    text: ''
  });
  const [loading, setLoading] = useState(false);
  const handleUpdate = async e => {
    e.preventDefault();
    setMsg({
      type: '',
      text: ''
    });
    if (newPassword && newPassword !== confirmPassword) {
      return setMsg({
        type: 'error',
        text: 'New passwords do not match'
      });
    }
    setLoading(true);
    try {
      const payload = {
        firstName,
        lastName,
        avatar
      };
      if (newPassword) {
        payload.newPassword = newPassword;
        if (currentPassword) payload.currentPassword = currentPassword;
      }
      const {
        data
      } = await axios.put('/users/profile', payload);
      setMsg({
        type: 'success',
        text: 'Profile updated successfully!'
      });

      // Update local context
      const currentToken = localStorage.getItem('token');
      ssoLoginHandler(data.user, currentToken);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMsg({
        type: 'error',
        text: err.response?.data?.message || 'Failed to update profile'
      });
    } finally {
      setLoading(false);
    }
  };
  return <div>
    <PageHeading eyebrow="Make yourself at home" title="My profile" description="Your details, just the way you like them." />
    <div className="settings-layout">
      <aside className="panel identity-card"><div className="identity-avatar">{avatar ? <img src={avatar} alt="Your avatar" className="profile-presentation-17" /> : initials(firstName || user.username)}</div><h2>{firstName || user.username}{lastName ? ' ' + lastName : ''}</h2><p>@{user.username}</p><span className="status-badge status-active">{user.role === 'admin' ? 'Administrator' : user.role === 'mod' ? 'Moderator' : 'Accountant'}</span></aside>
      <form className="panel settings-form" onSubmit={handleUpdate}>
        <h2><User size={18} />A little about you</h2><p>These details appear on your workspace profile.</p>
        {msg.text && <div className={'alert-' + msg.type + " profile-presentation-18"} role="status">{msg.text}</div>}
        <div className="settings-fields"><div><label htmlFor="first-name">First name</label><input id="first-name" className="input-field" autoComplete="given-name" value={firstName} onChange={e => setFirstName(e.target.value)} /></div><div><label htmlFor="last-name">Last name</label><input id="last-name" className="input-field" autoComplete="family-name" value={lastName} onChange={e => setLastName(e.target.value)} /></div><div className="profile-presentation-19"><label htmlFor="avatar-url">Profile image URL</label><input id="avatar-url" className="input-field" type="url" placeholder="https://…" value={avatar} onChange={e => setAvatar(e.target.value)} /></div></div>
        <hr className="settings-divider" /><h2><Lock size={18} />Keep your account secure</h2><p>Leave these fields blank to keep your password. SSO users without a password can add one without a current password.</p>
        <div className="settings-fields"><div className="profile-presentation-20"><label htmlFor="current-password">Current password</label><input id="current-password" className="input-field" type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></div><div><label htmlFor="new-password">New password</label><input id="new-password" className="input-field" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div><div><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" className="input-field" type="password" autoComplete="new-password" required={!!newPassword} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div></div>
        <div className="settings-actions"><button className="btn-primary" disabled={loading}><Save size={16} />{loading ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </div>
  </div>;
};
export default Profile;
