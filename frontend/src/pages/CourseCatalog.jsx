import { getBranchColor } from '../utils/branchColors';
import { BRANCHES } from '../Constants';
import { branchName, canSeePayroll } from '../utils/access';
import PermanentDeleteDialog from '../components/PermanentDeleteDialog';
import PrivateCycleImportDialog from '../components/PrivateCycleImportDialog';
import { useContext, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AnimatePresence } from 'framer-motion';
import { BookOpen, Plus, Search, ArrowUpRight, Pencil, Archive, RotateCcw, Layers, MapPin, Trash2, ChevronRight, FileSpreadsheet, UserRound } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext';
import { PageHeading, EmptyState } from '../components/WorkspaceUI';
import { MotionRegion } from '../components/WorkspaceMotion';
import Dialog from '../components/Dialog';
import { SECTIONS, SectionHero, useCourseBranch, CourseBranchPicker, openInBranch, countsFor } from '../components/courses/CourseSection';

const cyclesNote = (course, b) => (course.byBranch?.[b]?.cycles ? <small>{course.byBranch[b].cycles} cycles</small> : null);
const tone = text => [...String(text || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;

// One section of Courses (Group or Private): its umbrellas. Umbrellas created here stay in this section.
export default function CourseCatalog({ section = 'group' }) {
  const info = SECTIONS[section];
  const isPrivate = section === 'private';
  const { user } = useContext(AuthContext),
    // Umbrellas are created and managed by admins and the main mod.
    manager = canSeePayroll(user);
  const location = useLocation(),
    navigate = useNavigate();
  const picker = useCourseBranch(user);
  const { branch, ownBranches } = picker;
  const [permanentTarget, setPermanentTarget] = useState(null);
  // Which branches may run cycles under an umbrella (new umbrellas: Miami only).
  const [branchEdit, setBranchEdit] = useState(null);
  const [courses, setCourses] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const [search, setSearch] = useState(''),
    [archived, setArchived] = useState(false);
  // Search by student: umbrellas whose cycles have a student with this name or phone number.
  const [studentHits, setStudentHits] = useState(new Map());
  const [editing, setEditing] = useState(null),
    [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [bookPrice, setBookPrice] = useState('0'),
    [formError, setFormError] = useState(''),
    [busy, setBusy] = useState(false),
    [removing, setRemoving] = useState(null);
  const [importOpen, setImportOpen] = useState(false),
    [instructors, setInstructors] = useState([]);
  async function load() {
    try {
      const { data } = await axios.get('/courses');
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
    const q = search.trim();
    if (q.length < 2) return setStudentHits(new Map());
    let active = true;
    const t = setTimeout(() => {
      axios
        .get('/courses/student-matches', { params: { q } })
        .then(({ data }) => active && setStudentHits(new Map(data.map(m => [m.courseId, m]))))
        .catch(() => active && setStudentHits(new Map()));
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [search]);
  async function saveBranches() {
    setBusy(true);
    try {
      await axios.put('/courses/' + branchEdit.course.id + '/branches', { branches: branchEdit.branches });
      toast.success(`${branchEdit.course.name} is open for ${branchEdit.branches.map(branchName).join(', ')}`);
      setBranchEdit(null);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Branches could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  function open(course = {}) {
    setEditing(course);
    setName(course.name || '');
    setCode(course.code || '');
    setBookPrice(String(course.bookPrice ?? 0));
    setFormError('');
  }
  useEffect(() => {
    const state = location.state;
    if (state?.create && manager) {
      open();
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, manager]);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const body = { name, bookPrice, isPrivate, ...(isPrivate ? {} : { code }) };
      if (editing.id) await axios.put('/courses/' + editing.id, body);
      else await axios.post('/courses', body);
      setEditing(null);
      await load();
      toast.success(editing.id ? 'Umbrella updated' : 'Umbrella created');
    } catch (e) {
      setFormError(e.response?.data?.error || e.response?.data?.message || 'The umbrella could not be saved.');
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
      toast.success('Umbrella archived');
    } catch (e) {
      setFormError(e.response?.data?.error || 'Could not archive the umbrella.');
    } finally {
      setBusy(false);
    }
  }
  async function restore(course) {
    setBusy(true);
    try {
      await axios.post('/courses/' + course.id + '/restore');
      await load();
      toast.success('Umbrella restored');
    } catch {
      toast.error('Could not restore the umbrella');
    } finally {
      setBusy(false);
    }
  }
  async function openImport() {
    try {
      const { data } = await axios.get('/instructors', { params: { picker: 1 } });
      setInstructors(data);
      setImportOpen(true);
    } catch {
      toast.error('Employees could not be loaded for the import.');
    }
  }
  const q = search.toLowerCase().trim();
  const inSection = courses.filter(c => Boolean(c.isPrivate) === isPrivate);
  // Umbrellas show in a branch once they are open for it, even before their first cycle there.
  const visible = inSection.filter(c => Boolean(c.archivedAt) === archived && (archived || openInBranch(c, branch, ownBranches)) && (!q || `${c.name} ${c.code || ''}`.toLowerCase().includes(q) || studentHits.has(c.id)));
  const describe = course => {
    const n = countsFor(course, branch);
    if (branch) return n.cycles ? `${n.cycles} ${n.cycles === 1 ? 'cycle' : 'cycles'} in ${branchName(branch)}.` : `Open in ${branchName(branch)}, ready for its first cycle.`;
    return course.cycleCount ? `${course.cycleCount} ${course.cycleCount === 1 ? 'cycle' : 'cycles'}. One connected view.` : 'A home for your next cycle.';
  };
  return <div className={`courses-page course-catalog section-${section}`}>
    <SectionHero section={section}>
      <nav className="course-breadcrumb" aria-label="Breadcrumb"><Link to="/courses">Courses</Link><ChevronRight size={14} /><span>{info.label}</span></nav>
      <PageHeading eyebrow={info.short} title={info.label} description={info.blurb}>
        <CourseBranchPicker user={user} {...picker} />
        {manager && isPrivate && <button className="btn-secondary export-format-excel" onClick={openImport}><FileSpreadsheet size={16} />Import private courses</button>}
        {manager && <button className="btn-primary" onClick={() => open()}><Plus size={16} />New {isPrivate ? 'private' : 'group'} umbrella</button>}
      </PageHeading>
    </SectionHero>
    <div className="catalog-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search umbrellas or students" placeholder={isPrivate ? 'Search umbrella, student name or phone…' : 'Search course name, code, student name or phone…'} value={search} onChange={e => setSearch(e.target.value)} /></div><span className="muted">{visible.length} {visible.length === 1 ? 'umbrella' : 'umbrellas'}</span>{manager && <button className="text-button" aria-pressed={archived} onClick={() => setArchived(!archived)}>{archived ? 'Back to current umbrellas' : 'Show archived'}</button>}<Link className="text-button" to="/courses/cycles" state={{ section }}>All {info.short.toLowerCase()} cycles<ArrowUpRight size={15} /></Link></div>
    {user.role === 'user' && !user.branches && <div className="panel empty-state no-branches-note"><h3>No branches assigned yet</h3><p>Ask the main mod or an admin to choose the branches you can view. Courses and students will appear here then.</p></div>}
    {loading ? <div className="loading-state"><span className="loading-spinner" />Loading umbrellas…</div> : error ? <EmptyState title="Courses could not be loaded" description="Check your connection and try again."><button className="btn-secondary" onClick={() => {
        setLoading(true);
        load();
      }}>Try again</button></EmptyState> : <MotionRegion transitionKey={archived ? 'archive' : 'current'}><div className="course-grid">{visible.map(course => {
      const n = countsFor(course, branch);
      const hit = studentHits.get(course.id);
      return <article key={course.id} className={'course-tile catalog-card catalog-tone-' + tone(course.code || course.name)}>
      <Link className="catalog-card-link" to={'/courses/' + course.id} state={hit ? { search: search.trim() } : undefined}><div className="catalog-card-top"><span className="course-tile-icon">{isPrivate ? <UserRound size={24} /> : <BookOpen size={24} />}</span>{course.code && <span className="catalog-code">{course.code}</span>}</div><div className="catalog-title-row"><h2>{course.name}</h2><ArrowUpRight size={21} /></div><p className="catalog-description">{describe(course)}</p>{hit && <p className="catalog-student-hit"><Search size={13} aria-hidden="true" /><span>Student{hit.count === 1 ? '' : 's'}: <strong>{hit.students.join(', ')}</strong>{hit.count > hit.students.length ? ` +${hit.count - hit.students.length}` : ''}</span></p>}<p className="catalog-book-price">{isPrivate ? 'Private tuition · ' : ''}Books · {Number(course.bookPrice || 0).toLocaleString()} EGP</p><div className="catalog-stat-row"><span><Layers size={16} /><strong>{n.active}</strong> active</span><span><strong>{n.completed}</strong> completed</span>{course.archivedCount > 0 && <span><strong>{course.archivedCount}</strong> archived</span>}</div><div className="catalog-branches"><MapPin size={15} aria-hidden="true" /><div className="catalog-branch-list"><small className="catalog-open-label">Open for</small>{(course.allowedBranches || []).map(b => <span key={b} className={n.branches.includes(b) || course.byBranch?.[b] ? 'has-cycles' : 'no-cycles'} title={course.byBranch?.[b] ? `${course.byBranch[b].cycles} cycles in ${branchName(b)}` : `No ${branchName(b)} cycles yet`} style={{ '--branch-color': getBranchColor(b) }}><i aria-hidden="true" />{b}</span>)}</div></div></Link>
      <div className="catalog-card-footer"><Link to={'/courses/' + course.id}>Explore cycles<ArrowUpRight size={15} /></Link>{manager && <div><button className="icon-button" aria-label={'Branches for ' + course.name} title="Open for branches" onClick={() => setBranchEdit({ course, branches: [...(course.allowedBranches || [])] })}><MapPin size={15} /></button><button className="icon-button" aria-label={'Edit ' + course.name} onClick={() => open(course)}><Pencil size={15} /></button>{course.archivedAt ? <button className="icon-button" disabled={busy} aria-label={'Restore ' + course.name} onClick={() => restore(course)}><RotateCcw size={15} /></button> : <button className="icon-button" aria-label={'Archive ' + course.name} onClick={() => {
                setRemoving(course);
                setFormError('');
              }}><Archive size={15} /></button>}<button className="icon-button danger" aria-label={'Permanently delete ' + course.name} title="Permanently delete" onClick={() => setPermanentTarget(course)}><Trash2 size={15} /></button></div>}</div>
    </article>;
    })}</div>{!visible.length && <EmptyState icon={info.icon} title={search ? 'Nothing matches' : archived ? 'No archived umbrellas' : branch ? `No ${info.short.toLowerCase()} umbrellas open in ${branchName(branch)}` : `No ${info.short.toLowerCase()} umbrellas yet`} description={search ? 'Try another course name, code, student name or phone number.' : isPrivate ? 'Create a private umbrella such as KET or IELTS, or import a private-course workbook.' : 'Create a group umbrella, then add its cycles.'}>{manager && !archived && !search && <button className="btn-primary" onClick={() => open()}>New {isPrivate ? 'private' : 'group'} umbrella</button>}</EmptyState>}</MotionRegion>}
    {branchEdit && <Dialog title="Open for branches" onClose={busy ? () => {} : () => setBranchEdit(null)}><div className="modal-content card umbrella-branches-dialog">
      <h3><MapPin size={18} />{branchEdit.course.name}: open for</h3>
      <p className="muted">Only these branches can run {branchEdit.course.name} cycles. The umbrella shows in each of them right away. Cycles that already exist stay where they are.</p>
      <div className="umbrella-branch-options">{BRANCHES.map(b => { const on = branchEdit.branches.includes(b); return <button key={b} type="button" role="checkbox" aria-checked={on} className={on ? 'active' : ''} style={{ '--branch-color': getBranchColor(b) }} onClick={() => setBranchEdit(e => ({ ...e, branches: on ? e.branches.filter(x => x !== b) : [...e.branches, b] }))}>{branchName(b)}{cyclesNote(branchEdit.course, b)}</button>; })}</div>
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setBranchEdit(null)}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !branchEdit.branches.length} onClick={saveBranches}>{busy ? 'Saving…' : 'Save branches'}</button></div>
    </div></Dialog>}
    {permanentTarget && <PermanentDeleteDialog kind="course" record={permanentTarget} onClose={() => setPermanentTarget(null)} onDeleted={() => { setPermanentTarget(null); load(); toast.success('Umbrella permanently deleted'); }} />}
    {editing && <Dialog title={editing.id ? 'Edit umbrella' : `New ${isPrivate ? 'private' : 'group'} umbrella`} onClose={busy ? () => {} : () => setEditing(null)}><div className={`modal-content card catalog-editor section-${section}`}><span className={`section-chip is-${section}`}><info.icon size={13} />{info.label}</span><h3>{editing.id ? `Edit ${editing.name}` : `New ${isPrivate ? 'private' : 'group'} umbrella`}</h3><p className="muted">{isPrivate ? `Its cycles are named after it (${(name || 'KET').toUpperCase()} 1, ${(name || 'KET').toUpperCase()} 2…) and hold up to 3 students. Private umbrellas have no course code.` : 'Group cycles share the umbrella name, course code and book price.'}</p><form onSubmit={save}><label htmlFor="catalog-name">{isPrivate ? 'Umbrella name' : 'Course name'}</label><input id="catalog-name" className="input-field" required maxLength={120} value={name} placeholder="KET" onChange={e => setName(e.target.value)} />{!isPrivate && <><label htmlFor="catalog-code">Course code</label><input id="catalog-code" className="input-field" required maxLength={120} value={code} placeholder="1T1036" onChange={e => setCode(e.target.value)} /><p className="muted">Each group umbrella needs its own code.</p></>}<label htmlFor="catalog-book-price">Book price (EGP)</label><input id="catalog-book-price" className="input-field" type="number" required min="0" step="0.01" value={bookPrice} onChange={e => setBookPrice(e.target.value)} /><p className="muted">Applies to new book purchases. Previous payments keep their original price.</p>{formError && <p role="alert" className="alert-error">{formError}</p>}<div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : editing.id ? 'Save changes' : 'Create umbrella'}</button></div></form></div></Dialog>}
    {removing && <Dialog title="Archive umbrella" onClose={busy ? () => {} : () => setRemoving(null)}><div className="modal-content card catalog-editor"><h3>Archive {removing.name}?</h3><p>All of its cycles must be archived first. Their records and cycle numbers will stay preserved.</p>{formError && <p role="alert" className="alert-error">{formError}</p>}<div className="payment-entry-actions"><button className="btn-secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={archive}>{busy ? 'Archiving…' : 'Archive umbrella'}</button></div></div></Dialog>}
    <AnimatePresence>{importOpen && <PrivateCycleImportDialog instructors={instructors} onClose={() => setImportOpen(false)} onImported={() => load()} onSaved={() => { setImportOpen(false); load(); }} />}</AnimatePresence>
  </div>;
}
