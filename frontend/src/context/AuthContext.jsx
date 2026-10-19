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

  const login = async (username, password) => {
    const { data } = await axios.post('/auth/login', { username, password });
    localStorage.setItem('token', data.token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
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
