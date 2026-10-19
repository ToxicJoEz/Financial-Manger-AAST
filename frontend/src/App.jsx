import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { useContext } from 'react';
import Login from './pages/Login';
import Home from './pages/Home';
import RegisterUser from './pages/RegisterUser';
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
const App = () => {
  return <WorkspaceMotion><AuthProvider>
      <Toaster position="top-right" toastOptions={{
        style: {
          borderRadius: '6px',
          border: '1px solid #dfe6d7',
          fontSize: '13px',
          background: '#fff',
          color: '#324d2d'
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
            <Route path="/register-user" element={<RegisterUser />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/users" element={<ManageUsers />} />
            <Route path="/instructors" element={<Instructors />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/students" element={<Students />} />
            <Route path="/finances" element={<Finances />} />
          </Route>

          {/* Catch-all for undefined routes */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider></WorkspaceMotion>;
};
export default App;
