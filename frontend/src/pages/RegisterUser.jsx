import { PageHeading } from '../components/WorkspaceUI';
import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { UserPlus, ArrowLeft } from 'lucide-react';
const RegisterUser = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    user
  } = useContext(AuthContext);
  if (!user || user.role !== 'admin' && user.role !== 'mod') {
    return <div className="register-denied max-w-2xl appearance-mx-auto appearance-mt-10 appearance-text-center">
        <h2>Access Denied</h2>
        <p>You must be a Mod or Admin to register new users.</p>
        <Link to="/" className="register-denied-link block appearance-mt-4">Return to Dashboard</Link>
      </div>;
  }
  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      const {
        data
      } = await axios.post('/auth/register', {
        username,
        password
      });
      setSuccess(`Account for ${data.user.username} was created successfully!`);
      setUsername('');
      setPassword('');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };
  return <div>
    <PageHeading eyebrow="Better together" title="Add a colleague" description="Give someone new a place in your workspace."><Link to="/users" className="btn-secondary"><ArrowLeft size={15} />Back to team</Link></PageHeading>
    <div className="register-layout"><form className="panel settings-form" onSubmit={handleSubmit}><h2><UserPlus size={19} />Create an account</h2><p>Set up a username and an initial password for your colleague.</p>
    {error && <div className="alert-error" role="alert">{error}</div>}{success && <div className="alert-success" role="status">{success}</div>}
    <div className="settings-fields registeruser-presentation-21"><div><label htmlFor="new-username">Username</label><input id="new-username" className="input-field" required autoComplete="off" placeholder="e.g. sarah" value={username} onChange={e => setUsername(e.target.value)} /></div><div><label htmlFor="initial-password">Initial password</label><input id="initial-password" className="input-field" required type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></div></div><div className="settings-actions"><button className="btn-primary" disabled={isSubmitting}><UserPlus size={16} />{isSubmitting ? 'Creating account…' : 'Create account'}</button></div></form>
    <aside className="settings-note"><UserPlus size={26} /><h3>A new face on the team.</h3><p>New accounts start with accountant access. Your colleague can browse courses and request employee assignments.</p><p className="registeruser-presentation-22">Share their credentials privately and ask them to update their password in My profile.</p><Link className="text-button registeruser-presentation-23" to="/users">Manage team access →</Link></aside></div>
  </div>;
};
export default RegisterUser;
