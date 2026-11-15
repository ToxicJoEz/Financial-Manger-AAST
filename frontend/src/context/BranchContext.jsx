import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import { AuthContext } from './AuthContext';
import { setBranches } from '../Constants';

// Branches are managed by admins and the main mod. They load after sign-in and fill the shared branch lists
// (Constants.js). The app re-renders once when they first arrive; later changes show as screens re-render.
export const BranchContext = createContext({ branches: [], reload: async () => {} });
export function BranchProvider({ children }) {
  const { user } = useContext(AuthContext);
  const [branches, setList] = useState([]);
  const reload = useCallback(async () => {
    try {
      const { data } = await axios.get('/branches');
      setBranches(data);
      setList(data);
    } catch {
      // Keep the lists already in place.
    }
  }, []);
  useEffect(() => {
    if (user) reload();
  }, [user, reload]);
  return <BranchContext.Provider value={{ branches, reload }} key={branches.length ? 'loaded' : 'default'}>{children}</BranchContext.Provider>;
}
