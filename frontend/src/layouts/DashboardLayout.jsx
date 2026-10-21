import StudentRequestReviewDialog from '../components/StudentRequestReviewDialog';
import AssignmentReviewDialog from '../components/AssignmentReviewDialog';
import { RequestReviewContext } from '../context/RequestReviewContext';
import { useContext, useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate, useLocation, useOutlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Brand, initials } from '../components/WorkspaceUI';
import { MotionRegion, MotionSurface } from '../components/WorkspaceMotion';
import { AnimatePresence } from 'framer-motion';
import { LayoutDashboard, BookOpen, Users, Wallet, Settings2, LogOut, Bell, ChevronRight, Menu, X, Check, Search, UserRound, PanelLeftClose, GraduationCap } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

const pageNames = { '/': 'Overview', '/notifications': 'Notifications', '/courses': 'Courses', '/students': 'Students', '/employees': 'Employees', '/instructors': 'Employees', '/finances': 'Finance', '/finances/income': 'Finance / Income', '/finances/payroll': 'Finance / Payroll', '/users': 'Team & access', '/profile': 'My profile', '/register-user': 'Invite a colleague' };
const plainText = (html = '') => new DOMParser().parseFromString(html, 'text/html').body.textContent || '';

export default function DashboardLayout() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const [notifications, setNotifications] = useState([]);
  const [reviewRequest, setReviewRequest] = useState(null);
  const reviewLoad = useRef(0);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const notificationRef = useRef(null);
  const searchRef = useRef(null);
  const sidebarRef = useRef(null);
  const menuRef = useRef(null);
  const isManager = ['admin', 'mod'].includes(user.role);

  useEffect(() => {
    let alive = true;
    const fetchNotifications = () => axios.get('/notifications/history').then(({ data }) => { if (alive) { setNotifications(data.items); setUnreadTotal(data.unread); } }).catch(() => {});
    fetchNotifications();
    window.addEventListener('notifications-updated', fetchNotifications);
    const interval = setInterval(fetchNotifications, 30000);
    return () => { alive = false; clearInterval(interval); window.removeEventListener('notifications-updated', fetchNotifications); };
  }, [user]);
  useEffect(() => { setMobileOpen(false); setShowNotifications(false); }, [location.pathname]);
  useEffect(() => {
    const dismiss = e => { if (!notificationRef.current?.contains(e.target)) setShowNotifications(false); };
    const keyboard = e => {
      if (e.key === 'Escape') { setMobileOpen(false); setShowNotifications(false); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !document.querySelector('[role="dialog"]')) { e.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', keyboard); };
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const main = document.querySelector('.workspace-body');
    const wasInert = main.inert;
    const oldOverflow = document.body.style.overflow;
    main.inert = true;
    document.body.style.overflow = 'hidden';
    sidebarRef.current.querySelector('a, button')?.focus();
    const trap = e => {
      if (e.key !== 'Tab') return;
      const controls = [...sidebarRef.current.querySelectorAll('a, button')].filter(el => el.getClientRects().length);
      if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls.at(-1).focus(); }
      if (!e.shiftKey && document.activeElement === controls.at(-1)) { e.preventDefault(); controls[0].focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { main.inert = wasInert; document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', trap); menuRef.current?.focus(); };
  }, [mobileOpen]);

  const unread = unreadTotal;
  const nav = [{ to: '/', name: 'Overview', icon: LayoutDashboard }, { to: '/courses', name: 'Courses', icon: BookOpen }, { to: '/students', name: 'Students', icon: GraduationCap }, ...(isManager ? [{ to: '/employees', name: 'Employees', icon: Users }, { to: '/finances', name: 'Finance', icon: Wallet }] : [])];
  const openRequestReview = async (id, kind = 'INSTRUCTOR') => {
    if (!isManager) return;
    const load = ++reviewLoad.current;
    setShowNotifications(false);
    try {
      const { data } = await axios.get(kind === 'STUDENT' ? `/student-requests/${id}` : `/assignments/${id}`);
      if (load === reviewLoad.current) setReviewRequest({ ...data, kind });
    } catch (error) {
      if (load === reviewLoad.current) toast.error(error.response?.data?.error || 'Could not open this request.');
      window.dispatchEvent(new Event('notifications-updated'));
    }
  };
  const openNotification = async n => {
    if (!n.isRead) {
      try { await axios.put(`/notifications/${n.id}/read`); setUnreadTotal(value => Math.max(0, value - 1)); setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, isRead: true } : item)); }
      catch { toast.error('Could not mark notification as read'); }
    }
    if (isManager && n.status === 'PENDING') await openRequestReview(n.relatedId, n.request?.kind);
    else if (n.request?.kind === 'STUDENT' && !n.request.courseId) navigate('/students');
    else navigate('/courses/cycles', { state: { search: n.request?.course?.name || '' } });
    setShowNotifications(false);
  };
  const searchCourses = e => {
    e.preventDefault();
    if (!search.trim()) return;
    navigate('/courses/cycles', { state: { search: search.trim() } });
    setSearch('');
  };

  return <RequestReviewContext.Provider value={openRequestReview}><div className="workspace">
    <a className="skip-link" href="#main-content">Skip to content</a>
    {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside ref={sidebarRef} className={`sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Main navigation">
      <div className="sidebar-brand"><Link to="/" aria-label="AAST Finance overview"><Brand /></Link><button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><PanelLeftClose size={20} /></button></div>
      <div className="nav-section-label">Workspace</div>
      <nav className="side-nav">{nav.map(({ to, name, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}><Icon size={19} strokeWidth={1.8} /><span>{name}</span>{to === '/finances' && <span className="nav-tag">EGP</span>}</NavLink>)}</nav>
      <div className="nav-section-label administration-label">Settings</div>
      <nav className="side-nav">{isManager && <NavLink to="/users" className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}><Settings2 size={19} strokeWidth={1.8} />Team & access</NavLink>}<NavLink to="/profile" className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}><UserRound size={19} strokeWidth={1.8} />My profile</NavLink></nav>
      <div className="sidebar-bottom">
        <div className="account-row"><Link to="/profile" className="account-link"><span className="avatar">{initials(user.firstName || user.username)}</span><span className="account-name">{user.firstName || user.username}<small>{user.role === 'mod' ? 'Moderator' : user.role === 'admin' ? 'Administrator' : 'Accountant'}</small></span></Link></div><button className="sidebar-logout" onClick={() => { logout(); navigate('/login'); }}><LogOut size={18} /><span>Sign out</span></button>
      </div>
    </aside>
    <div className="workspace-body">
      <header className="topbar">
        <div className="breadcrumb"><button ref={menuRef} className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}><Menu size={21} /></button><span>Workspace</span><ChevronRight size={14} /><strong>{pageNames[location.pathname] || (location.pathname.startsWith('/courses/') ? 'Cycles' : 'Finance')}</strong></div>
        <form className="global-search" onSubmit={searchCourses}><Search size={17} /><input ref={searchRef} aria-label="Search workspace courses" placeholder="Find a cycle…" value={search} onChange={e => setSearch(e.target.value)} /><kbd>Ctrl K</kbd></form>
        <div className="topbar-right"><div className="notification-anchor" ref={notificationRef}>
          <button className={`icon-button notification-trigger ${showNotifications ? 'selected' : ''}`} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={showNotifications} onClick={() => setShowNotifications(!showNotifications)}><Bell size={20} strokeWidth={1.8} />{unread > 0 && <span className="notification-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}</button>
          <AnimatePresence>{showNotifications && <MotionSurface key="notifications" exit={{ opacity: 0, y: -3 }} className="notification-panel" aria-label="Notifications"><div className="panel-heading"><h3>Your updates {unread > 0 && <span className="count-chip">{unread}</span>}</h3><button className="icon-button" aria-label="Close notifications" onClick={() => setShowNotifications(false)}><X size={17} /></button></div>{unread > 0 && <button className="text-button mark-read" onClick={async () => { try { await axios.put('/notifications/read-all'); setUnreadTotal(0); setNotifications(prev => prev.map(n => ({ ...n, isRead: true }))); } catch { toast.error('Could not update notifications'); } }}><Check size={15} />Mark all as read</button>}<div className="notification-list">{notifications.length ? notifications.slice(0, 5).map(n => <button key={n.id} className={`notification-item ${!n.isRead ? 'unread' : ''}`} onClick={() => openNotification(n)}><strong>{n.title}</strong><p>{plainText(n.message)}</p><small>{n.isResolved ? `Resolved by ${n.resolvedBy}` : new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small></button>) : <div className="empty-state"><span className="empty-icon"><Bell size={28} /></span><h3>You're all caught up</h3><p>New assignment updates will land here.</p></div>}</div><Link className="notification-view-all" to="/notifications" onClick={() => setShowNotifications(false)}>View all notifications<ChevronRight size={16} /></Link></MotionSurface>}</AnimatePresence>
        </div><Link className="top-avatar" to="/profile" aria-label="My profile">{initials(user.firstName || user.username)}</Link></div>
      </header>
      <main id="main-content" className="workspace-main"><MotionRegion transitionKey={location.pathname === '/finances' || location.pathname.startsWith('/finances/') ? '/finances' : location.pathname} className="page-transition">{outlet}</MotionRegion></main>
      <footer className="workspace-footer"><span><span className="footer-dot" />AAST Finance</span><span>A little clarity. A better workday.</span></footer>
    </div>
  </div><AnimatePresence>{reviewRequest && (reviewRequest.kind === 'STUDENT' ? <StudentRequestReviewDialog key={reviewRequest.id} request={reviewRequest} onClose={() => setReviewRequest(null)} /> : <AssignmentReviewDialog key={reviewRequest.id} request={reviewRequest} onClose={() => setReviewRequest(null)} />)}</AnimatePresence></RequestReviewContext.Provider>;
}


