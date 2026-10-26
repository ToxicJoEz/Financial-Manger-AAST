import PrivateBadge from '../components/PrivateBadge';
import { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Bell, Search, Check, Plus, Trash2, RotateCcw, ArrowUpRight, ChevronLeft, ChevronRight, Clock3, CheckCircle, XCircle } from 'lucide-react';
import { RequestReviewContext } from '../context/RequestReviewContext';
import { AuthContext } from '../context/AuthContext';
import { PageHeading } from '../components/WorkspaceUI';
import { MotionRegion } from '../components/WorkspaceMotion';
import CustomFilterDropdown from '../components/CustomFilterDropdown';
import '../styles/_notifications.scss';

const actions = { ASSIGN: { label: "Add employee", Icon: Plus }, REMOVE: { label: "Remove employee", Icon: Trash2 }, REPLACE: { label: "Replace employee", Icon: RotateCcw }, OTHER: { label: 'Update', Icon: Bell } };
const statuses = { PENDING: 'Pending', APPROVED: 'Accepted', REJECTED: 'Rejected', RESOLVED: 'Resolved', OTHER: 'Update' };
const text = html => new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '';
const announce = () => window.dispatchEvent(new Event('notifications-updated'));

export default function Notifications() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const openRequestReview = useContext(RequestReviewContext);
  const manager = ['admin', 'mod'].includes(user.role);
  const [status, setStatus] = useState(''), [action, setAction] = useState(''), [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [refresh, setRefresh] = useState(0), [saving, setSaving] = useState(false);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    axios.get('/notifications/history', { params: { status, action, unread: unreadOnly || undefined, search: query, page }, signal: controller.signal })
      .then(({ data }) => setData(data)).catch(e => { if (!controller.signal.aborted) setError(e.response?.data?.error || 'Notifications could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, action, unreadOnly, query, page, refresh]);
  useEffect(() => {
    const update = () => setRefresh(value => value + 1);
    const interval = setInterval(update, 30000);
    window.addEventListener('notifications-updated', update);
    return () => { clearInterval(interval); window.removeEventListener('notifications-updated', update); };
  }, []);
  useEffect(() => { if (!loading && data && page > 1 && page > Math.max(1, Math.ceil(data.total / data.pageSize))) setPage(Math.max(1, Math.ceil(data.total / data.pageSize))); }, [data, loading, page]);
  const markRead = async n => {
    if (n.isRead) return true;
    try { await axios.put(`/notifications/${n.id}/read`); announce(); return true; }
    catch { toast.error('Could not mark notification as read.'); return false; }
  };
  const open = async n => {
    if (!await markRead(n)) return;
    if (manager && n.status === 'PENDING' && n.request) openRequestReview(n.relatedId, n.request?.kind);
    else if (n.request?.kind === 'STUDENT' && !n.request.courseId) navigate('/students');
    else if (n.request) navigate('/courses/cycles', { state: { search: n.request.course?.name || '' } });
  };
  const clear = () => { setStatus(''); setAction(''); setUnreadOnly(false); setSearch(''); setQuery(''); setPage(1); };
  const filtered = status || action || unreadOnly || search;
  return <section className="notifications-page">
    <PageHeading eyebrow="WORKSPACE ACTIVITY" title="Notifications" description="Requests, decisions, and updates — with a clear view of what needs attention.">
      <button className="btn-secondary" disabled={!data?.unread || saving} onClick={async () => { setSaving(true); try { await axios.put('/notifications/read-all'); announce(); } catch { toast.error('Could not mark notifications as read.'); } finally { setSaving(false); } }}><Check size={16} />Mark all as read</button>
    </PageHeading>
    <div className="notification-overview"><span className="notification-overview-icon"><Bell size={24} /></span><div><strong>{data?.unread ?? '—'} unread</strong><p>Reading a notification does not approve or reject its request.</p></div></div>
    <div className="panel notifications-center">
      <div className="notification-status-tabs" aria-label="Notification status">{[['', 'All activity', Bell], ['PENDING', 'Pending', Clock3], ['APPROVED', 'Accepted', CheckCircle], ['REJECTED', 'Rejected', XCircle], ['RESOLVED', 'Resolved', Check]].map(([value, label, Icon]) => <button type="button" key={value} aria-pressed={status === value} className={status === value ? 'active' : ''} onClick={() => { setStatus(value); setPage(1); }}><Icon size={15} />{label}</button>)}</div>
      <div className="notification-filters"><div className="search-field"><Search size={17} /><input aria-label="Search notifications" value={search} placeholder="Search notification messages…" onChange={e => setSearch(e.target.value)} /></div><div className="notification-action-filter"><CustomFilterDropdown value={action} onChange={value => { setAction(value); setPage(1); }} placeholder="All actions" options={Object.entries(actions).filter(([key]) => key !== 'OTHER').map(([value, entry]) => ({ value, label: value === 'ASSIGN' ? 'Add' : value === 'REMOVE' ? 'Remove' : 'Replace' }))} /></div><label className="notification-unread-filter"><input type="checkbox" checked={unreadOnly} onChange={e => { setUnreadOnly(e.target.checked); setPage(1); }} />Unread only</label>{filtered && <button className="text-button" onClick={clear}>Clear filters</button>}</div>
      <div className="notification-result-heading"><span>{loading ? 'Updating activity…' : `${data?.total || 0} notifications`}</span><span>Newest first</span></div>
      <MotionRegion transitionKey={loading ? 'loading' : error ? 'error' : [status, action, unreadOnly, query, page].join(':')} className="notification-results">
        {loading ? <div className="loading-state" role="status"><span className="loading-spinner" />Loading notifications…</div> : error ? <div className="empty-state"><h3>{error}</h3><button className="btn-secondary" onClick={() => setRefresh(value => value + 1)}>Try again</button></div> : !data?.items.length ? <div className="empty-state"><Bell size={30} /><h3>{filtered ? 'No matching notifications' : 'You’re all caught up'}</h3><p>{filtered ? 'Try a different status, action, or search.' : 'New requests and decisions will appear here.'}</p>{filtered && <button className="btn-secondary" onClick={clear}>Clear filters</button>}</div> : <ul className="notification-history-list">{data.items.map(n => {
          const { label: instructorLabel, Icon } = actions[n.action] || actions.OTHER;
          const label = n.request?.kind === 'STUDENT' ? (n.action === 'REMOVE' ? 'Remove student' : 'Add student') : instructorLabel;
          return <li key={n.id} className={`notification-history-item action-${n.action.toLowerCase()} ${!n.isRead ? 'is-unread' : ''}`}><span className="notification-action-icon"><Icon size={20} /></span><div className="notification-history-body"><div className="notification-entry-tags"><span className="notification-action-tag">{label}</span>{n.status !== 'OTHER' && <span className={`notification-status status-${n.status.toLowerCase()}`}>{statuses[n.status] || 'Update'}</span>}{!n.isRead && <span className="notification-new">Unread</span>}</div><h2>{n.title}</h2><p>{text(n.message)}</p><div className="notification-context">{n.request?.course?.name && <strong>{n.request.course.name}<PrivateBadge record={n.request.course}/></strong>}{n.request?.submittedBy?.username && <span>Requested by <b>@{n.request.submittedBy.username}</b></span>}{n.resolvedBy && <span>Resolved by <b>@{n.resolvedBy}</b></span>}<time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></div><div className="notification-entry-actions">{n.request && <button className="text-button" onClick={() => open(n)}>{manager && n.status === 'PENDING' ? 'Review request' : n.request?.kind === 'STUDENT' && !n.request.courseId ? 'View students' : 'View cycle'}<ArrowUpRight size={14} /></button>}{!n.isRead && <button className="notification-read-button" onClick={() => markRead(n)}><Check size={14} />Mark as read</button>}</div></div></li>;
        })}</ul>}
      </MotionRegion>
      {!loading && !error && data?.total > data?.pageSize && <nav className="notification-pagination" aria-label="Notification pages"><span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span><div><button className="btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} />Previous</button><button className="btn-secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next<ChevronRight size={15} /></button></div></nav>}
    </div>
  </section>;
}
