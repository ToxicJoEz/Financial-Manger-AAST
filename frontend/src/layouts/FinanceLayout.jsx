import { NavLink, useLocation, useOutlet } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { MotionRegion } from '../components/WorkspaceMotion';
import { PageHeading } from '../components/WorkspaceUI';
import { TrendingUp, Wallet, ClipboardCheck } from 'lucide-react';
import { canSeePayroll } from '../utils/access';
import '../styles/_financeHub.scss';
export default function FinanceLayout() {
  const {
    user
  } = useContext(AuthContext);
  const location = useLocation();
  const outlet = useOutlet();
  const manager = ['admin', 'mod'].includes(user.role);
  return <div className="finance-hub"><PageHeading eyebrow="ACADEMY FINANCES" title="Finance" description={canSeePayroll(user) ? "Course income and employee payroll, in one place." : "Course income and money checks."} /><nav className="finance-main-tabs" aria-label="Finance sections">{canSeePayroll(user) && <NavLink to="/finances/payroll"><Wallet size={18} />Payroll</NavLink>}<NavLink to="/finances/income"><TrendingUp size={18} />Income</NavLink>{manager && <NavLink to="/finances/checks"><ClipboardCheck size={18} />Fouad checks</NavLink>}</nav><MotionRegion transitionKey={location.pathname} className="finance-tab-content">{outlet}</MotionRegion></div>;
}
