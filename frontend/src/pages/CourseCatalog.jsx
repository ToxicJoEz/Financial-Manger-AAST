import PrivateBadge from '../components/PrivateBadge';
import { getBranchColor } from '../utils/branchColors';
import { BRANCHES } from '../Constants';
import { branchScopeOf, branchName, canSeePayroll } from '../utils/access';
import { getCourseBranch, setCourseBranch } from '../utils/courseBranch';
import PermanentDeleteDialog from '../components/PermanentDeleteDialog';
import { useContext, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BookOpen, Plus, Search, ArrowUpRight, Pencil, Archive, RotateCcw, Layers, MapPin, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext';
import { PageHeading, EmptyState } from '../components/WorkspaceUI';
import { MotionRegion } from '../components/WorkspaceMotion';
import Dialog from '../components/Dialog';
const cyclesNote = (course, b) => (course.byBranch?.[b]?.cycles ? <small>{course.byBranch[b].cycles} cycles</small> : null);
export default function CourseCatalog() {
  const {
      user
    } = useContext(AuthContext),
    // Umbrellas are created and managed by admins and the main mod.
    manager = canSeePayroll(user);
  const location = useLocation(),
    navigate = useNavigate();
  const [permanentTarget, setPermanentTarget] = useState(null);
  // Which branches may run cycles under an umbrella (new umbrellas: Miami only).
  const [branchEdit, setBranchEdit] = useState(null);
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
  const [courses, setCourses] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const [search, setSearch] = useState(''),
    [archived, setArchived] = useState(false);
  // Branch filter: branch mods always see their own branch; others pick one (or all) with the branch buttons.
  const scope = branchScopeOf(user);
  // Users choose among their own branches only; branch mods see their one branch as a fixed tab.
  const ownBranches = user.role === 'user' ? BRANCHES.filter(b => String(user.branches || '').split(',').includes(b)) : scope ? [scope] : BRANCHES;
  const [pickedBranch, setPickedBranch] = useState(() => (ownBranches.includes(getCourseBranch()) ? getCourseBranch() : ''));
  const branch = scope || pickedBranch;
  const pickBranch = value => {
    setPickedBranch(value);
    setCourseBranch(value);
  };
  // Counts for the chosen branch; an umbrella with nothing there shows zero rather than disappearing.
  const countsFor = course =>
    branch && !scope
      ? { cycles: course.byBranch?.[branch]?.cycles || 0, active: course.byBranch?.[branch]?.active || 0, completed: course.byBranch?.[branch]?.completed || 0, branches: [branch] }
      : { cycles: course.cycleCount, active: course.activeCount, completed: course.completedCount, branches: course.branches };
  const [editing, setEditing] = useState(null),
    [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [isPrivate, setIsPrivate] = useState(false),
    [bookPrice, setBookPrice] = useState('0'),
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
  function open(course = {}) {
    setEditing(course);setIsPrivate(Boolean(course.isPrivate));
    setName(course.name || '');
    setCode(course.code || '');
    setBookPrice(String(course.bookPrice ?? 0));
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
        bookPrice, isPrivate,
        code
      });else await axios.post('/courses', {
        name,
        bookPrice, isPrivate,
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
  // With a branch chosen (or for users, who only see their branches), umbrellas with no cycles there are hidden.
  // Branch mods still see umbrellas open for their branch, so they can start the first cycle there.
  const hasCyclesHere = c => (branch ? countsFor(c).cycles : c.cycleCount) > 0;
  const shownForBranch = c => (scope ? hasCyclesHere(c) || (c.allowedBranches || []).includes(scope) : branch || user.role === 'user' ? hasCyclesHere(c) : true);
  const visible = courses.filter(c => Boolean(c.archivedAt) === archived && shownForBranch(c) && (!search || `${c.name} ${c.code}`.toLowerCase().includes(search.toLowerCase().trim())));
  return <div className="courses-page course-catalog">
    <PageHeading eyebrow="The course collection" title="Courses" description={scope ? `Course umbrellas and your ${branchName(scope)} cycles.` : 'One course. Every cycle, together.'}>{scope ? <div className="branch-picker is-fixed" aria-label="Your branch"><span className="active" style={{ '--branch-color': getBranchColor(scope) }}>{branchName(scope)}</span></div> : ownBranches.length > 0 && <div className="branch-picker" role="group" aria-label="Show branch">{ownBranches.length > 1 && <button type="button" className={!branch ? 'active' : ''} aria-pressed={!branch} onClick={() => pickBranch('')}>{user.role === 'user' ? 'All my branches' : 'All branches'}</button>}{ownBranches.map(b => <button key={b} type="button" className={branch === b ? 'active' : ''} aria-pressed={branch === b} style={{ '--branch-color': getBranchColor(b) }} onClick={() => pickBranch(branch === b ? '' : b)}>{branchName(b)}</button>)}</div>}{manager && <button className="btn-primary" onClick={() => open()}><Plus size={16} />New course umbrella</button>}</PageHeading>
    <div className="catalog-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search courses" placeholder="Search course name or code…" value={search} onChange={e => setSearch(e.target.value)} /></div><span className="muted">{visible.length} courses</span>{manager && <button className="text-button" aria-pressed={archived} onClick={() => setArchived(!archived)}>{archived ? 'Back to current courses' : 'Show archived'}</button>}<Link className="text-button" to="/courses/cycles">All cycles<ArrowUpRight size={15} /></Link></div>
    {user.role === 'user' && !user.branches && <div className="panel empty-state no-branches-note"><h3>No branches assigned yet</h3><p>Ask the main mod or an admin to choose the branches you can view. Courses and students will appear here then.</p></div>}
    {loading ? <div className="loading-state"><span className="loading-spinner" />Loading courses…</div> : error ? <EmptyState title="Courses could not be loaded" description="Check your connection and try again."><button className="btn-secondary" onClick={() => {
        setLoading(true);
        load();
      }}>Try again</button></EmptyState> : <MotionRegion transitionKey={archived ? 'archive' : 'current'}><div className="course-grid">{visible.map(course => <article key={course.id} className={'course-tile catalog-card catalog-tone-' + [...course.code].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3}>
      <Link className="catalog-card-link" to={'/courses/' + course.id}><div className="catalog-card-top"><span className="course-tile-icon"><BookOpen size={24} /></span><span className="catalog-code">{course.code}</span></div><div className="catalog-title-row"><h2>{course.name}<PrivateBadge record={course}/></h2><ArrowUpRight size={21} /></div><p className="catalog-description">{branch ? `${countsFor(course).cycles} ${countsFor(course).cycles === 1 ? 'cycle' : 'cycles'} in ${branchName(branch)}.` : course.cycleCount ? `${course.cycleCount} ${course.cycleCount === 1 ? 'cycle' : 'cycles'}. One connected view.` : 'A home for your next cycle.'}</p><p className="catalog-book-price">{course.isPrivate ? `Private tuition · ${course.subCourseCount || 0} sub-umbrella${course.subCourseCount === 1 ? '' : 's'} · Books priced per sub-umbrella` : `Books · ${Number(course.bookPrice || 0).toLocaleString()} EGP`}</p><div className="catalog-stat-row"><span><Layers size={16} /><strong>{countsFor(course).active}</strong> active</span><span><strong>{countsFor(course).completed}</strong> completed</span>{course.archivedCount > 0 && <span><strong>{course.archivedCount}</strong> archived</span>}</div><div className="catalog-branches"><MapPin size={15} aria-hidden="true" /><div className="catalog-branch-list"><small className="catalog-open-label">Open for</small>{(course.allowedBranches || []).map(b => <span key={b} className={countsFor(course).branches.includes(b) || course.byBranch?.[b] ? 'has-cycles' : 'no-cycles'} title={course.byBranch?.[b] ? `${course.byBranch[b].cycles} cycles in ${branchName(b)}` : `No ${branchName(b)} cycles yet`} style={{ '--branch-color': getBranchColor(b) }}><i aria-hidden="true" />{b}</span>)}{branch && !countsFor(course).cycles && <span className="catalog-no-branches">No {branchName(branch)} cycles yet</span>}</div></div></Link>
      <div className="catalog-card-footer"><Link to={'/courses/' + course.id}>{course.isPrivate ? 'Explore sub-umbrellas' : 'Explore cycles'}<ArrowUpRight size={15} /></Link>{manager && <div><button className="icon-button" aria-label={'Branches for ' + course.name} title="Open for branches" onClick={() => setBranchEdit({ course, branches: [...(course.allowedBranches || [])] })}><MapPin size={15} /></button><button className="icon-button" aria-label={'Edit ' + course.name} onClick={() => open(course)}><Pencil size={15} /></button>{course.archivedAt ? <button className="icon-button" disabled={busy} aria-label={'Restore ' + course.name} onClick={() => restore(course)}><RotateCcw size={15} /></button> : <button className="icon-button" aria-label={'Archive ' + course.name} onClick={() => {
                setRemoving(course);
                setFormError('');
              }}><Archive size={15} /></button>}<button className="icon-button danger" aria-label={"Permanently delete " + course.name} title="Permanently delete" onClick={() => setPermanentTarget(course)}><Trash2 size={15} /></button></div>}</div>
    </article>)}</div>{!visible.length && <EmptyState title={search ? 'No matching courses' : archived ? 'No archived courses' : branch ? `No ${branchName(branch)} cycles yet` : 'Your course collection starts here'} description={search ? 'Try another course name or code.' : 'Create a course, then add its individual cycles.'}>{manager && !archived && !search && <button className="btn-primary" onClick={() => open()}>Create course</button>}</EmptyState>}</MotionRegion>}
    {branchEdit && <Dialog title="Open for branches" onClose={busy ? () => {} : () => setBranchEdit(null)}><div className="modal-content card umbrella-branches-dialog">
      <h3><MapPin size={18} />{branchEdit.course.name}: open for</h3>
      <p className="muted">Only these branches can run {branchEdit.course.name} cycles, and their branch mods see this umbrella. Cycles that already exist stay where they are.</p>
      <div className="umbrella-branch-options">{BRANCHES.map(b => { const on = branchEdit.branches.includes(b); return <button key={b} type="button" role="checkbox" aria-checked={on} className={on ? 'active' : ''} style={{ '--branch-color': getBranchColor(b) }} onClick={() => setBranchEdit(e => ({ ...e, branches: on ? e.branches.filter(x => x !== b) : [...e.branches, b] }))}>{branchName(b)}{cyclesNote(branchEdit.course, b)}</button>; })}</div>
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setBranchEdit(null)}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !branchEdit.branches.length} onClick={saveBranches}>{busy ? 'Saving…' : 'Save branches'}</button></div>
    </div></Dialog>}
    {permanentTarget && <PermanentDeleteDialog kind="course" record={permanentTarget} onClose={() => setPermanentTarget(null)} onDeleted={() => {setPermanentTarget(null);load();toast.success("Course permanently deleted");}} />}
    {editing && <Dialog title={editing.id ? 'Edit course umbrella' : 'New course umbrella'} onClose={busy ? () => {} : () => setEditing(null)}><div className="modal-content card catalog-editor"><h3>{editing.id ? 'Edit course umbrella' : 'New course umbrella'}</h3><p className="muted">Book prices apply when students pay. Previous payments keep their original price.</p><form onSubmit={save}><label htmlFor="catalog-name">Course name</label><input id="catalog-name" className="input-field" required maxLength={120} value={name} placeholder="KET" onChange={e => setName(e.target.value)} /><label htmlFor="catalog-code">Course code</label><input id="catalog-code" className="input-field" required maxLength={120} value={code} placeholder="1T1036" onChange={e => setCode(e.target.value)} /><label className="private-type-choice"><input type="checkbox" checked={isPrivate} disabled={Boolean(editing.id && (editing.cycleCount || editing.subCourseCount))} onChange={e=>setIsPrivate(e.target.checked)}/>Private courses umbrella</label><p className="muted">{editing.cycleCount ? 'Course type is fixed once cycles exist.' : isPrivate ? 'Organized into sub-umbrellas (e.g. KET, PET). Each sub-umbrella sets its own book price; its cycles hold up to 3 students.' : 'Group cycles share the umbrella name and book price.'}</p>{!isPrivate && <><label htmlFor="catalog-book-price">Book price (EGP)</label><input id="catalog-book-price" className="input-field" type="number" required min="0" step="0.01" value={bookPrice} onChange={e=>setBookPrice(e.target.value)}/><p className="muted">Previous purchases keep their original price.</p></>}{formError && <p role="alert" className="alert-error">{formError}</p>}<div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save course'}</button></div></form></div></Dialog>}
    {removing && <Dialog title="Archive course" onClose={busy ? () => {} : () => setRemoving(null)}><div className="modal-content card catalog-editor"><h3>Archive {removing.name}?</h3><p>All of its cycles must be archived first. Their records and cycle numbers will stay preserved.</p>{formError && <p role="alert" className="alert-error">{formError}</p>}<div className="payment-entry-actions"><button className="btn-secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={archive}>{busy ? 'Archiving…' : 'Archive course'}</button></div></div></Dialog>}
  </div>;
}
