import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

// Full names for everyone, so screens show "Youssef Wael" instead of the sign-in username "joe-admin".
// Stored records (the activity log, who recorded a payment…) keep usernames; they are turned into names here.
const NamesContext = createContext({ nameOf: u => u || '', withNames: t => t || '' });
export function NamesProvider({ children }) {
  const [names, setNames] = useState({});
  useEffect(() => {
    let alive = true;
    const load = () => axios.get('/users/directory').then(({ data }) => { if (alive) setNames(data.names || {}); }).catch(() => {});
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    window.addEventListener('names-updated', load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('names-updated', load); };
  }, []);
  const nameOf = useCallback(username => (username ? names[username] || username : ''), [names]);
  // "@joe-admin" anywhere in a message becomes "Youssef Wael" (longest usernames first, so similar ones don't clash).
  const order = useMemo(() => Object.keys(names).sort((a, b) => b.length - a.length), [names]);
  const withNames = useCallback(text => {
    let out = String(text || '');
    for (const u of order) if (out.includes('@' + u)) out = out.split('@' + u).join(names[u]);
    return out;
  }, [order, names]);
  return <NamesContext.Provider value={{ nameOf, withNames }}>{children}</NamesContext.Provider>;
}
export const useNames = () => useContext(NamesContext);
