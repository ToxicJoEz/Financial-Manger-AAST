import { useContext, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { MotionSurface } from '../components/WorkspaceMotion';
import crest from '../assets/branding/aast-iec-logo-white-900.webp';
import '../styles/_signin.scss';

// Engraved rosette behind the crest: fine interlaced lines, like the guilloche on certificates and banknotes.
function Guilloche() {
  const waves = useMemo(() => {
    const ring = (radius, depth, lobes, phase) => {
      let d = '';
      for (let i = 0; i <= 720; i++) {
        const t = (i / 720) * Math.PI * 2;
        const r = radius + depth * Math.sin(lobes * t + phase);
        d += `${i ? 'L' : 'M'}${(500 + r * Math.cos(t)).toFixed(1)} ${(500 + r * Math.sin(t)).toFixed(1)}`;
      }
      return d + 'Z';
    };
    return [
      ...Array.from({ length: 8 }, (_, i) => ring(430, 26, 18, (i * Math.PI) / 4)),
      ...Array.from({ length: 6 }, (_, i) => ring(352, 14, 30, (i * Math.PI) / 3))
    ];
  }, []);
  return <svg className="auth-guilloche" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
    <g className="auth-guilloche-rosette">{Array.from({ length: 36 }, (_, i) => <ellipse key={i} cx="500" cy="500" rx="300" ry="132" transform={`rotate(${i * 5} 500 500)`} />)}</g>
    <g className="auth-guilloche-bands">{waves.map((d, i) => <path key={i} d={d} />)}</g>
    <circle cx="500" cy="500" r="468" /><circle cx="500" cy="500" r="476" />
  </svg>;
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordField = useRef(null);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to sign in. Please try again.');
      // Keep the username, and put the cursor back where the fix is most likely needed.
      requestAnimationFrame(() => { passwordField.current?.focus(); passwordField.current?.select(); });
    } finally {
      setBusy(false);
    }
  };
  const watchCaps = e => setCapsLock(Boolean(e.getModifierState?.('CapsLock')));
  return <div className="auth">
    <aside className="auth-panel">
      <Guilloche />
      <div className="auth-emblem">
        <img src={crest} alt="Arab Academy for Science, Technology and Maritime Transport · International Examination Centre" width="900" height="698" decoding="async" fetchPriority="high" />
        <div className="auth-lockup" aria-hidden="true"><strong>AAST</strong><i /><span>Finance</span></div>
      </div>
      <p className="auth-institution">Arab Academy for Science, Technology <span>&amp;</span> Maritime Transport</p>
    </aside>

    <main className="auth-main">
      <MotionSurface className="auth-card" distance={10}>
        <header className="auth-heading"><span className="auth-eyebrow"><Lock size={12} strokeWidth={2.4} />AAST Finance</span><h1>Sign in</h1></header>
        <form onSubmit={submit} aria-describedby={error ? 'auth-error' : undefined}>
          {error && <div id="auth-error" className="auth-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
          <div className="auth-field">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false" autoFocus required value={username} onChange={e => setUsername(e.target.value)} aria-invalid={Boolean(error)} />
          </div>
          <div className="auth-field">
            <div className="auth-label-row"><label htmlFor="password">Password</label>{capsLock && <span className="auth-caps" role="status">Caps Lock is on</span>}</div>
            <div className="auth-password">
              <input id="password" name="password" ref={passwordField} type={visible ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} onKeyDown={watchCaps} onKeyUp={watchCaps} onBlur={() => setCapsLock(false)} aria-invalid={Boolean(error)} />
              <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>
          <button type="submit" className="auth-submit" disabled={busy} aria-busy={busy}>{busy ? <><span className="auth-spinner" aria-hidden="true" />Signing in…</> : <>Sign in<ArrowRight size={17} /></>}</button>
        </form>
        <p className="auth-help"><strong>New to the team?</strong> Ask your administrator to create an account.</p>
      </MotionSurface>
      <footer className="auth-footer">© {new Date().getFullYear()} AAST · International Examination Centre</footer>
    </main>
  </div>;
}
