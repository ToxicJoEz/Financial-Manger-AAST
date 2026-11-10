import { NavLink, useLocation, useOutlet } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { MotionRegion } from '../components/WorkspaceMotion';
import { PageHeading } from '../components/WorkspaceUI';
import { TrendingUp, Wallet, ClipboardCheck } from 'lucide-react';
import { canSeePayroll, canCheckBranchMoney } from '../utils/access';
import '../styles/_financeHub.scss';
export default function FinanceLayout() {
  const {
    user
  } = useContext(AuthContext);
  const location = useLocation();
  const outlet = useOutlet();
  return <div className="finance-hub"><PageHeading eyebrow="ACADEMY FINANCES" title="Finance" description={canSeePayroll(user) ? "Course income, employee payroll and branch money checks." : "Course income for your branch."} /><nav className="finance-main-tabs" aria-label="Finance sections">{canSeePayroll(user) && <NavLink to="/finances/payroll"><Wallet size={18} />Payroll</NavLink>}<NavLink to="/finances/income"><TrendingUp size={18} />Income</NavLink>{canCheckBranchMoney(user) && <NavLink to="/finances/checks"><ClipboardCheck size={18} />Checks</NavLink>}</nav><MotionRegion transitionKey={location.pathname} className="finance-tab-content">{outlet}</MotionRegion></div>;
}
