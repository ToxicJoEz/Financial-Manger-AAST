import { useContext, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BookOpen, Plus, Search, ArrowUpRight, Pencil, Archive, RotateCcw, Layers, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext';
import { PageHeading, EmptyState } from '../components/WorkspaceUI';
import { MotionRegion } from '../components/WorkspaceMotion';
import Dialog from '../components/Dialog';
export default function CourseCatalog() {
  const {
      user
    } = useContext(AuthContext),
    manager = ['admin', 'mod'].includes(user.role);
  const location = useLocation(),
    navigate = useNavigate();
  const [courses, setCourses] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const [search, setSearch] = useState(() => sessionStorage.getItem('aast-catalog-search') || ''),
    [archived, setArchived] = useState(() => sessionStorage.getItem('aast-catalog-archived') === 'true');
  const [editing, setEditing] = useState(null),
    [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [formError, setFormError] = useState(''),
    [busy, setBusy] = useState(false),
    [removing, setRemoving] = useState(null);
  async function load() {
    try {
      const {
        data
      } = await axios.get('/courses');
      setCourses(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    sessionStorage.setItem('aast-catalog-search', search);
  }, [search]);
  useEffect(() => {
    sessionStorage.setItem('aast-catalog-archived', String(archived));
  }, [archived]);
  function open(course = {}) {
    setEditing(course);
    setName(course.name || '');
    setCode(course.code || '');
    setFormError('');
  }
  useEffect(() => {
    const state = location.state;
    if (state?.status || state?.search || state?.openReviewId) navigate('/courses/cycles', {
      state,
      replace: true
    });else if (state?.create && manager) {
      open();
      navigate('/courses', {
        replace: true,
        state: null
      });
    }
  }, [location.state, manager, navigate]);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      if (editing.id) await axios.put('/courses/' + editing.id, {
        name,
        code
      });else await axios.post('/courses', {
        name,
        code
      });
      setEditing(null);
      await load();
      toast.success(editing.id ? 'Course updated' : 'Course created');
    } catch (e) {
      setFormError(e.response?.data?.error || e.response?.data?.message || 'The course could not be saved. Its code may already be in use.');
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    setBusy(true);
    setFormError('');
    try {
      await axios.delete('/courses/' + removing.id);
      setRemoving(null);
      await load();
      toast.success('Course archived');
    } catch (e) {
      setFormError(e.response?.data?.error || 'Could not archive the course.');
    } finally {
      setBusy(false);
    }
  }
  async function restore(course) {
    setBusy(true);
    try {
      await axios.post('/courses/' + course.id + '/restore');
      await load();
      toast.success('Course restored');
    } catch {
      toast.error('Could not restore course');
    } finally {
      setBusy(false);
    }
  }
  const visible = courses.filter(c => Boolean(c.archivedAt) === archived && (!search || `${c.name} ${c.code}`.toLowerCase().includes(search.toLowerCase().trim())));
  return <div className="courses-page course-catalog">
    <PageHeading eyebrow="The course collection" title="Courses" description="One course. Every cycle, together.">{manager && <button className="btn-primary" onClick={() => open()}><Plus size={16} />New course</button>}</PageHeading>
    <div className="catalog-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search courses" placeholder="Search course name or code…" value={search} onChange={e => setSearch(e.target.value)} /></div><span className="muted">{visible.length} courses</span>{manager && <button className="text-button" aria-pressed={archived} onClick={() => setArchived(!archived)}>{archived ? 'Back to current courses' : 'Show archived'}</button>}<Link className="text-button" to="/courses/cycles">All cycles<ArrowUpRight size={15} /></Link></div>
    {loading ? <div className="loading-state"><span className="loading-spinner" />Loading courses…</div> : error ? <EmptyState title="Courses could not be loaded" description="Check your connection and try again."><button className="btn-secondary" onClick={() => {
        setLoading(true);
        load();
      }}>Try again</button></EmptyState> : <MotionRegion transitionKey={archived ? 'archive' : 'current'}><div className="course-grid">{visible.map((course, index) => <article key={course.id} className={'course-tile catalog-card catalog-tone-' + [...course.code].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3}>
      <Link className="catalog-card-link" to={'/courses/' + course.id}><div className="catalog-card-top"><span className="course-tile-icon"><BookOpen size={24} /></span><span className="catalog-code">{course.code}</span></div><div className="catalog-title-row"><h2>{course.name}</h2><ArrowUpRight size={21} /></div><p className="catalog-description">{course.cycleCount ? `${course.cycleCount} ${course.cycleCount === 1 ? 'cycle' : 'cycles'}. One connected view.` : 'A home for your next cycle.'}</p><div className="catalog-stat-row"><span><Layers size={16} /><strong>{course.activeCount}</strong> active</span><span><strong>{course.completedCount}</strong> completed</span>{course.archivedCount > 0 && <span><strong>{course.archivedCount}</strong> archived</span>}</div><div className="catalog-branches"><MapPin size={14} />{course.branches.length ? course.branches.join(' · ') : 'No branches yet'}</div></Link>
      <div className="catalog-card-footer"><Link to={'/courses/' + course.id}>Explore cycles<ArrowUpRight size={15} /></Link>{manager && <div><button className="icon-button" aria-label={'Edit ' + course.name} onClick={() => open(course)}><Pencil size={15} /></button>{course.archivedAt ? <button className="icon-button" disabled={busy} aria-label={'Restore ' + course.name} onClick={() => restore(course)}><RotateCcw size={15} /></button> : <button className="icon-button" aria-label={'Archive ' + course.name} onClick={() => {
                setRemoving(course);
                setFormError('');
              }}><Archive size={15} /></button>}</div>}</div>
    </article>)}</div>{!visible.length && <EmptyState title={search ? 'No matching courses' : archived ? 'No archived courses' : 'Your course collection starts here'} description={search ? 'Try another course name or code.' : 'Create a course, then add its individual cycles.'}>{manager && !archived && !search && <button className="btn-primary" onClick={() => open()}>Create course</button>}</EmptyState>}</MotionRegion>}
    {editing && <Dialog title={editing.id ? 'Edit course' : 'Create course'} onClose={busy ? () => {} : () => setEditing(null)}><div className="modal-content card catalog-editor"><h3>{editing.id ? 'Edit course' : 'Create course'}</h3><p className="muted">Just a name and code. Teaching details belong to each cycle.</p><form onSubmit={save}><label htmlFor="catalog-name">Course name</label><input id="catalog-name" className="input-field" required maxLength={120} value={name} placeholder="KET" onChange={e => setName(e.target.value)} /><label htmlFor="catalog-code">Course code</label><input id="catalog-code" className="input-field" required maxLength={120} value={code} placeholder="1T1036" onChange={e => setCode(e.target.value)} />{formError && <p role="alert" className="alert-error">{formError}</p>}<div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save course'}</button></div></form></div></Dialog>}
    {removing && <Dialog title="Archive course" onClose={busy ? () => {} : () => setRemoving(null)}><div className="modal-content card catalog-editor"><h3>Archive {removing.name}?</h3><p>All of its cycles must be archived first. Their records and cycle numbers will stay preserved.</p>{formError && <p role="alert" className="alert-error">{formError}</p>}<div className="payment-entry-actions"><button className="btn-secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={archive}>{busy ? 'Archiving…' : 'Archive course'}</button></div></div></Dialog>}
  </div>;
}
