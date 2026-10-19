import { useContext, useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate, useLocation, useOutlet } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Brand, initials } from '../components/WorkspaceUI';
import { MotionRegion, MotionSurface } from '../components/WorkspaceMotion';
import { AnimatePresence } from 'framer-motion';
import { LayoutDashboard, BookOpen, Users, Wallet, Settings2, LogOut, Bell, ChevronRight, Menu, X, Check, Search, UserRound, PanelLeftClose, GraduationCap } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

const pageNames = { '/': 'Overview', '/courses': 'Courses', '/students': 'Students', '/instructors': 'Instructors', '/finances': 'Payroll', '/users': 'Team & access', '/profile': 'My profile', '/register-user': 'Invite a colleague' };
const plainText = (html = '') => new DOMParser().parseFromString(html, 'text/html').body.textContent || '';

export default function DashboardLayout() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const [notifications, setNotifications] = useState([]);
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
    const fetchNotifications = () => axios.get('/notifications').then(({ data }) => { if (alive) setNotifications(data); }).catch(() => {});
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => { alive = false; clearInterval(interval); };
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

  const unread = notifications.filter(n => !n.isRead).length;
  const nav = [{ to: '/', name: 'Overview', icon: LayoutDashboard }, { to: '/courses', name: 'Courses', icon: BookOpen }, { to: '/students', name: 'Students', icon: GraduationCap }, ...(isManager ? [{ to: '/instructors', name: 'Instructors', icon: Users }, { to: '/finances', name: 'Payroll', icon: Wallet }] : [])];
  const openNotification = async n => {
    if (!n.isRead) {
      try { await axios.put(`/notifications/${n.id}/read`); setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, isRead: true } : item)); }
      catch { toast.error('Could not mark notification as read'); }
    }
    navigate('/courses', { state: { openReviewId: n.type === 'ASSIGNMENT_REQUEST' && !n.isResolved ? n.relatedId : null } });
    setShowNotifications(false);
  };
  const searchCourses = e => {
    e.preventDefault();
    if (!search.trim()) return;
    navigate('/courses', { state: { search: search.trim() } });
    setSearch('');
  };

  return <div className="workspace">
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
        <div className="breadcrumb"><button ref={menuRef} className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}><Menu size={21} /></button><span>Workspace</span><ChevronRight size={14} /><strong>{pageNames[location.pathname] || 'Finance'}</strong></div>
        <form className="global-search" onSubmit={searchCourses}><Search size={17} /><input ref={searchRef} aria-label="Search workspace courses" placeholder="Find a course…" value={search} onChange={e => setSearch(e.target.value)} /><kbd>Ctrl K</kbd></form>
        <div className="topbar-right"><div className="notification-anchor" ref={notificationRef}>
          <button className={`icon-button notification-trigger ${showNotifications ? 'selected' : ''}`} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={showNotifications} onClick={() => setShowNotifications(!showNotifications)}><Bell size={20} strokeWidth={1.8} />{unread > 0 && <span className="unread-dot" />}</button>
          <AnimatePresence>{showNotifications && <MotionSurface key="notifications" exit={{ opacity: 0, y: -3 }} className="notification-panel" aria-label="Notifications"><div className="panel-heading"><h3>Your updates {unread > 0 && <span className="count-chip">{unread}</span>}</h3><button className="icon-button" aria-label="Close notifications" onClick={() => setShowNotifications(false)}><X size={17} /></button></div>{unread > 0 && <button className="text-button mark-read" onClick={async () => { try { await axios.put('/notifications/read-all'); setNotifications(prev => prev.map(n => ({ ...n, isRead: true }))); } catch { toast.error('Could not update notifications'); } }}><Check size={15} />Mark all as read</button>}<div className="notification-list">{notifications.length ? notifications.map(n => <button key={n.id} className={`notification-item ${!n.isRead ? 'unread' : ''}`} onClick={() => openNotification(n)}><strong>{n.title}</strong><p>{plainText(n.message)}</p><small>{n.isResolved ? `Resolved by ${n.resolvedBy}` : new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small></button>) : <div className="empty-state"><span className="empty-icon"><Bell size={28} /></span><h3>You're all caught up</h3><p>New assignment updates will land here.</p></div>}</div></MotionSurface>}</AnimatePresence>
        </div><Link className="top-avatar" to="/profile" aria-label="My profile">{initials(user.firstName || user.username)}</Link></div>
      </header>
      <main id="main-content" className="workspace-main"><MotionRegion transitionKey={location.pathname} className="page-transition">{outlet}</MotionRegion></main>
      <footer className="workspace-footer">{import.meta.env.VITE_DEMO_MODE === 'true' && <span>Demo · Changes are temporary</span>}<span><span className="footer-dot" />AAST Finance</span><span>A little clarity. A better workday.</span></footer>
    </div>
  </div>;
}


