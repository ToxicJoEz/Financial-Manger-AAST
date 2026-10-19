import { useEffect, useContext, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { Loader2, ShieldAlert } from 'lucide-react';
const SSOHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    ssoLoginHandler
  } = useContext(AuthContext);
  const [error, setError] = useState('');
  const hasFired = useRef(false);
  const incomingToken = useRef(searchParams.get('token'));
  useEffect(() => {
    const processSSO = async () => {
      // Prevent React StrictMode from firing this twice and triggering our Replay Attack protection!
      if (hasFired.current) return;
      hasFired.current = true;
      const token = incomingToken.current;
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      if (!token) {
        setError('No SSO token found in the URL. Access denied.');
        return;
      }
      try {
        const {
          data
        } = await axios.post('/auth/sso', {
          token
        });
        // Successfully verified and auto-provisioned by backend!
        ssoLoginHandler(data.user, data.token);
        incomingToken.current = null;
        navigate('/', { replace: true }); // Do not leave the callback in browser history
      } catch (err) {
        setError(err.response?.data?.message || 'SSO Handshake Failed');
      }
    };
    processSSO();
  }, [searchParams, navigate, ssoLoginHandler]);
  if (error) {
    return <div className="state-page flex items-center justify-center min-h-screen">
        <div className="state-content error-card max-w-md w-full">
          <ShieldAlert className="sso-error-icon appearance-mx-auto" />
          <h1>Let’s get you signed in</h1>
          <p className="sso-error-msg">{error}</p>
          <button onClick={() => navigate('/login')} className="btn-primary">
            Back to sign in
          </button>
        </div>
      </div>;
  }
  return <div className="state-page flex flex-col items-center justify-center min-h-screen">
      <div className="state-content flex flex-col items-center">
        <Loader2 className="sso-loader" />
        <h2>Authenticating via AAST Portal...</h2>
        <p className="sso-subtitle">Please wait while we verify your secure token.</p>
      </div>
    </div>;
};
export default SSOHandler;
