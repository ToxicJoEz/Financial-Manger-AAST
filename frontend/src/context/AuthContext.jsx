import { createContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const incomingSSO = useRef(new URLSearchParams(window.location.search).has('token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Configure axios defaults
  axios.defaults.baseURL = import.meta.env.VITE_API_URL || '/api';

  useEffect(() => {
    const checkUserLoggedIn = async () => {
      // FIX: Race condition! If a new SSO token is arriving in the URL, skip local session restore completely!
      if (incomingSSO.current) {
        setLoading(false);
        return;
      }

      const token = localStorage.getItem('token');
      if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        try {
          const { data } = await axios.get('/auth/me');
          setUser(data.user);
        } catch (error) {
          console.error("Token expired or invalid");
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
        }
      }
      setLoading(false);
    };
    checkUserLoggedIn();
  }, []);

  useEffect(()=>{
    if(!user)return;
    let timer;const fields=new Set();
    const invalid=event=>{
      const input=event.target;if(!input.form)return;
      const previous=input.previousElementSibling;
      fields.add(input.getAttribute('aria-label')||input.name||input.id||(previous?.tagName==='LABEL'?previous.textContent.slice(0,100):`${input.type||'Input'} field`));
      clearTimeout(timer);timer=setTimeout(()=>{const invalidFields=[...fields];fields.clear();axios.post('/activity-events',{action:'FORM_VALIDATION_FAILED',message:'Form submission blocked by missing or invalid fields.',fields:invalidFields,page:window.location.pathname}).catch(()=>console.warn('Form activity could not reach the server.'));},120);
    };
    document.addEventListener('invalid',invalid,true);
    return()=>{clearTimeout(timer);document.removeEventListener('invalid',invalid,true);};
  },[user]);

  const login = async (username, password) => {
    const { data } = await axios.post('/auth/login', { username, password });
    localStorage.setItem('token', data.token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await axios.post('/auth/logout'); } finally {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    }
  };

  const ssoLoginHandler = (userData, token) => {
    localStorage.setItem('token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, ssoLoginHandler }}>
      {children}
    </AuthContext.Provider>
  );
};
