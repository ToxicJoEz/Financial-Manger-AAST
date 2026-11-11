import { canSeePayroll, canCheckBranchMoney } from './utils/access';
import MoneyChecks from './pages/MoneyChecks';
import ActivityLog from './pages/ActivityLog';
import FinanceLayout from './layouts/FinanceLayout';
import Income from './pages/Income';
import Notifications from './pages/Notifications';
import CourseCatalog from './pages/CourseCatalog';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { useContext, useEffect, useState } from 'react';
import axios from 'axios';
import SubCourseCatalog from './pages/SubCourseCatalog';
import Login from './pages/Login';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import SSOHandler from './pages/SSOHandler';
import DashboardLayout from './layouts/DashboardLayout';
import Profile from './pages/Profile';
import ManageUsers from './pages/ManageUsers';
import Instructors from './pages/Instructors';
import Courses from './pages/Courses';
import Finances from './pages/Finances';
import Students from './pages/Students';
import { WorkspaceMotion } from './components/WorkspaceMotion';

// Kicks guests out to the login screen
const ProtectedRoute = ({
  children
}) => {
  const {
    user,
    loading
  } = useContext(AuthContext);
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center appearance-bg-gray-50 appearance-text-gray-500 appearance-font-medium">Verifying Secure Session...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// Kicks already-logged-in users out to the dashboard
const PublicRoute = ({
  children
}) => {
  const {
    user,
    loading
  } = useContext(AuthContext);
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
};
import { Toaster } from 'react-hot-toast';
const CycleRoute = () => { const { courseId, subCourseId } = useParams(); return <Courses key={(courseId || 'all') + ':' + (subCourseId || '')} />; };
// Private umbrellas open their sub-umbrellas; group umbrellas open their cycles.
const UmbrellaRoute = () => {
  const { courseId } = useParams();
  const [kind, setKind] = useState(null);
  useEffect(() => {
    let active = true;
    setKind(null);
    axios.get('/courses/' + courseId).then(({ data }) => { if (active) setKind(data.isPrivate ? 'private' : 'group'); }).catch(() => { if (active) setKind('group'); });
    return () => { active = false; };
  }, [courseId]);
  if (!kind) return <div className="loading-state"><span className="loading-spinner" />Loading course…</div>;
  return kind === 'private' ? <SubCourseCatalog key={courseId} courseId={courseId} /> : <Courses key={courseId} />;
};
const FinanceRoute = () => {
  const { user } = useContext(AuthContext);
  return ['admin', 'mod'].includes(user.role) ? <FinanceLayout /> : <Navigate to="/" replace />;
};
// Finance opens on Payroll for admins and the main mod; branch mods have no payroll.
const FinanceHome = () => {
  const { user } = useContext(AuthContext);
  return <Navigate to={canSeePayroll(user) ? 'payroll' : 'income'} replace />;
};
const PayrollRoute = () => {
  const { user } = useContext(AuthContext);
  return canSeePayroll(user) ? <Finances /> : <Navigate to="/finances/income" replace />;
};
// The activity log is for admins and the main mod only.
const LogsRoute = () => {
  const { user } = useContext(AuthContext);
  return canSeePayroll(user) ? <ActivityLog /> : <Navigate to="/" replace />;
};
// Branch money checks are for admins and the main mod only.
const ChecksRoute = () => {
  const { user } = useContext(AuthContext);
  return canCheckBranchMoney(user) ? <MoneyChecks /> : <Navigate to="/finances/income" replace />;
};
const App = () => {
  return <WorkspaceMotion><AuthProvider>
      <Toaster position="top-right" toastOptions={{
        style: {
          borderRadius: '6px',
          border: '1px solid #dfe6d7',
          fontSize: '13px',
          background: '#fff',
          color: '#26334d'
        }
      }} />
      <BrowserRouter>
        <Routes>
          {/* Public Routes (Guests Only) */}
          <Route path="/login" element={<PublicRoute>
                <Login />
              </PublicRoute>} />
          <Route path="/sso" element={<SSOHandler />} />
          <Route path="/sso-login" element={<SSOHandler />} />
          
          {/* Protected Routes (Wrapped in the Global Dashboard Layout) */}
          <Route element={<ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>}>
            <Route path="/" element={<Home />} />
            <Route path="/register-user" element={<Navigate to="/users" replace state={{ add: true }} />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/users" element={<ManageUsers />} />
            <Route path="/logs" element={<LogsRoute />} />
            <Route path="/employees" element={<Instructors />} /><Route path="/instructors" element={<Navigate to="/employees" replace />} />
            <Route path="/courses" element={<CourseCatalog />} />
            <Route path="/courses/cycles" element={<CycleRoute />} />
            <Route path="/courses/:courseId" element={<UmbrellaRoute />} />
            <Route path="/courses/:courseId/sub/:subCourseId" element={<CycleRoute />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/students" element={<Students />} />
            <Route path="/finances" element={<FinanceRoute />}>
              <Route index element={<FinanceHome />} />
              <Route path="income" element={<Income />} />
              <Route path="payroll" element={<PayrollRoute />} />
              <Route path="checks" element={<ChecksRoute />} />
            </Route>
          </Route>

          {/* Catch-all for undefined routes */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider></WorkspaceMotion>;
};
export default App;
