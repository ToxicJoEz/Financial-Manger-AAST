import { MotionSurface } from '../components/WorkspaceMotion';
import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, AlertCircle, BookOpen, Check, Wallet, Users, ArrowUpRight } from 'lucide-react';
import { Brand } from '../components/WorkspaceUI';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const submit = async e => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await login(username, password); navigate('/'); }
    catch (err) { setError(err.response?.data?.message || 'Unable to sign in. Please try again.'); }
    finally { setBusy(false); }
  };
  return <div className="signin">
    <section className="signin-form-side">
      <div className="signin-brand"><Brand /></div>
      <MotionSurface className="signin-form" distance={12}><h1>Welcome back.</h1><p>{import.meta.env.VITE_DEMO_MODE === 'true' ? 'Demo workspace. Changes are temporary and may reset between requests.' : 'Sign in to manage courses, people, and payroll.'}</p>
        {error && <div className="alert-error" role="alert"><AlertCircle size={18} />{error}</div>}
        <form onSubmit={submit}><label htmlFor="username">Username</label><input id="username" autoComplete="username" className="input-field" placeholder="Enter your username" value={username} onChange={e=>setUsername(e.target.value)} required />
          <label htmlFor="password">Password</label><div className="password-input"><input id="password" autoComplete="current-password" className="input-field" type={visible ? 'text' : 'password'} placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} required /><button type="button" className="icon-button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={()=>setVisible(!visible)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></div>
          <button className="btn-primary signin-submit" disabled={busy}>{busy ? 'Signing you in…' : 'Sign in'}<ArrowRight size={18} /></button>
        </form><div className="signin-help"><Users size={17} /><span>New to the team?<br /><strong>Ask your administrator to create an account.</strong></span></div>
      </MotionSurface>
    </section>
    <section className="signin-story"><div className="story-heading"><h2>Your courses.<br />Your people.<br /><span>All connected.</span></h2><p>A clearer view of your academy’s finances.</p></div>
      <div className="finance-scene" aria-hidden="true"><div className="scene-orbit orbit-one" /><div className="scene-orbit orbit-two" /><div className="scene-spark spark-one">✦</div><div className="scene-spark spark-two">✦</div>
        <div className="scene-card scene-course"><div className="scene-card-top"><span className="scene-icon"><BookOpen size={23} /></span><span className="scene-mini-tag">Your next chapter</span></div><h3>Great courses.<br />Even better teams.</h3><div className="scene-avatars"><span>A</span><span>S</span><span>M</span><small>Better, together.</small></div></div>
        <div className="scene-card scene-payroll"><div className="scene-card-top"><span><Wallet size={19} />Payroll, simplified</span><ArrowUpRight size={17} /></div><div className="scene-equation">Hours <span>×</span> Rate</div><div className="scene-payroll-bottom"><span><i />Every hour accounted for</span><Check size={17} /></div></div>
      </div>
    </section>
  </div>;
}

