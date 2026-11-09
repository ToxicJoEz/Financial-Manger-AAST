import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { BookOpen, Plus, Search, ArrowUpRight, Pencil, Archive, RotateCcw, Layers, MapPin, Trash2, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import { AuthContext } from '../context/AuthContext';
import { PageHeading, EmptyState } from '../components/WorkspaceUI';
import { MotionRegion } from '../components/WorkspaceMotion';
import Dialog from '../components/Dialog';
import PermanentDeleteDialog from '../components/PermanentDeleteDialog';
import PrivateCycleImportDialog from '../components/PrivateCycleImportDialog';
import { getBranchColor } from '../utils/branchColors';

// A private umbrella holds sub-umbrellas (KET, PET, ...); each sub-umbrella holds numbered cycles.
export default function SubCourseCatalog({ courseId }) {
  const { user } = useContext(AuthContext),
    manager = ['admin', 'mod'].includes(user.role);
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const [search, setSearch] = useState(''),
    [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState(null),
    [name, setName] = useState(''),
    [bookPrice, setBookPrice] = useState('0'),
    [formError, setFormError] = useState(''),
    [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null),
    [permanentTarget, setPermanentTarget] = useState(null),
    [importOpen, setImportOpen] = useState(false),
    [instructors, setInstructors] = useState([]);
  async function load() {
    try {
      const { data } = await axios.get(`/courses/${courseId}/sub-courses`);
      setData(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);
  function open(sub = {}) {
    setEditing(sub);
    setName(sub.name || '');
    setBookPrice(String(sub.bookPrice ?? 0));
    setFormError('');
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      if (editing.id) await axios.put('/sub-courses/' + editing.id, { name, bookPrice });
      else await axios.post(`/courses/${courseId}/sub-courses`, { name, bookPrice });
      toast.success(editing.id ? 'Sub-umbrella updated' : 'Sub-umbrella created');
      setEditing(null);
      await load();
    } catch (e) {
      setFormError(e.response?.data?.error || 'The sub-umbrella could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    setBusy(true);
    setFormError('');
    try {
      await axios.delete('/sub-courses/' + removing.id);
      setRemoving(null);
      toast.success('Sub-umbrella archived');
      await load();
    } catch (e) {
      setFormError(e.response?.data?.error || 'Could not archive the sub-umbrella.');
    } finally {
      setBusy(false);
    }
  }
  async function restore(sub) {
    setBusy(true);
    try {
      await axios.post('/sub-courses/' + sub.id + '/restore');
      toast.success('Sub-umbrella restored');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not restore the sub-umbrella');
    } finally {
      setBusy(false);
    }
  }
  async function openImport() {
    try {
      const { data } = await axios.get('/instructors');
      setInstructors(data);
      setImportOpen(true);
    } catch {
      toast.error('Employees could not be loaded for the import.');
    }
  }
  if (loading) return <div className="loading-state"><span className="loading-spinner" />Loading sub-umbrellas…</div>;
  if (error || !data)
    return <section className="panel"><EmptyState title="This private course could not be loaded" description="Check your connection and try again."><button className="btn-secondary" onClick={() => { setLoading(true); load(); }}>Try again</button></EmptyState></section>;
  const { parent, subCourses } = data;
  const visible = subCourses.filter(sub => Boolean(sub.archivedAt) === archived && (!search || sub.name.toLowerCase().includes(search.toLowerCase().trim())));
  return <div className="courses-page course-catalog sub-course-catalog">
    <nav className="course-breadcrumb" aria-label="Breadcrumb"><Link to="/courses">Courses</Link><ChevronRight size={14} /><span>{parent.name}</span></nav>
    <PageHeading eyebrow={parent.code} title={parent.name} description="Private tuition, organized by sub-umbrella. Each sub-umbrella numbers its own cycles.">
      {manager && !parent.archivedAt && <><button className="btn-secondary export-format-excel" onClick={openImport}><FileSpreadsheet size={16} />Import private courses</button><button className="btn-primary" onClick={() => open()}><Plus size={16} />New sub-umbrella</button></>}
    </PageHeading>
    <div className="catalog-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search sub-umbrellas" placeholder="Search sub-umbrellas…" value={search} onChange={e => setSearch(e.target.value)} /></div><span className="muted">{visible.length} sub-umbrellas</span>{manager && <button className="text-button" aria-pressed={archived} onClick={() => setArchived(!archived)}>{archived ? 'Back to current sub-umbrellas' : 'Show archived'}</button>}</div>
    <MotionRegion transitionKey={archived ? 'archive' : 'current'}><div className="course-grid">{visible.map(sub => <article key={sub.id} className={'course-tile catalog-card catalog-tone-' + [...sub.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3}>
      <Link className="catalog-card-link" to={`/courses/${parent.id}/sub/${sub.id}`}><div className="catalog-card-top"><span className="course-tile-icon"><BookOpen size={24} /></span><span className="catalog-code">{parent.code}</span></div><div className="catalog-title-row"><h2>{sub.name}</h2><ArrowUpRight size={21} /></div><p className="catalog-description">{sub.cycleCount ? `${sub.cycleCount} ${sub.cycleCount === 1 ? 'cycle' : 'cycles'} · next is ${sub.name} ${sub.nextCycleNumber}` : `A home for ${sub.name} 1.`}</p><p className="catalog-book-price">Books · {Number(sub.bookPrice || 0).toLocaleString()} EGP</p><div className="catalog-stat-row"><span><Layers size={16} /><strong>{sub.activeCount}</strong> active</span><span><strong>{sub.completedCount}</strong> completed</span>{sub.archivedCount > 0 && <span><strong>{sub.archivedCount}</strong> archived</span>}</div><div className="catalog-branches"><MapPin size={15} aria-hidden="true" /><div className="catalog-branch-list">{sub.branches.length ? sub.branches.map(branch => <span key={branch} style={{ '--branch-color': getBranchColor(branch) }}><i aria-hidden="true" />{branch}</span>) : <span className="catalog-no-branches">No branches yet</span>}</div></div></Link>
      <div className="catalog-card-footer"><Link to={`/courses/${parent.id}/sub/${sub.id}`}>Explore cycles<ArrowUpRight size={15} /></Link>{manager && <div><button className="icon-button" aria-label={'Edit ' + sub.name} onClick={() => open(sub)}><Pencil size={15} /></button>{sub.archivedAt ? <button className="icon-button" disabled={busy} aria-label={'Restore ' + sub.name} onClick={() => restore(sub)}><RotateCcw size={15} /></button> : <button className="icon-button" aria-label={'Archive ' + sub.name} onClick={() => { setRemoving(sub); setFormError(''); }}><Archive size={15} /></button>}<button className="icon-button danger" aria-label={'Permanently delete ' + sub.name} title="Permanently delete" onClick={() => setPermanentTarget(sub)}><Trash2 size={15} /></button></div>}</div>
    </article>)}</div>{!visible.length && <EmptyState title={search ? 'No matching sub-umbrellas' : archived ? 'No archived sub-umbrellas' : 'Start with a sub-umbrella'} description={search ? 'Try another name.' : 'Create a sub-umbrella such as KET or PET, then add its cycles. Importing a private-course workbook can also create them.'}>{manager && !archived && !search && !parent.archivedAt && <button className="btn-primary" onClick={() => open()}>Create sub-umbrella</button>}</EmptyState>}</MotionRegion>
    {permanentTarget && <PermanentDeleteDialog kind="subCourse" record={permanentTarget} onClose={() => setPermanentTarget(null)} onDeleted={() => { setPermanentTarget(null); load(); toast.success('Sub-umbrella permanently deleted'); }} />}
    {editing && <Dialog title={editing.id ? 'Edit sub-umbrella' : 'Create sub-umbrella'} onClose={busy ? () => {} : () => setEditing(null)}><div className="modal-content card catalog-editor"><h3>{editing.id ? `Edit ${editing.name}` : `New sub-umbrella in ${parent.name}`}</h3><p className="muted">Its cycles are named after it ({(name || 'KET').toUpperCase()} 1, {(name || 'KET').toUpperCase()} 2…). Renaming updates current cycle names; past payroll and receipts keep their original names.</p><form onSubmit={save}><label htmlFor="sub-name">Sub-umbrella name</label><input id="sub-name" className="input-field" required maxLength={120} value={name} placeholder="KET" onChange={e => setName(e.target.value)} /><label htmlFor="sub-book-price">Book price (EGP)</label><input id="sub-book-price" className="input-field" type="number" required min="0" step="0.01" value={bookPrice} onChange={e => setBookPrice(e.target.value)} /><small className="muted">Applies to new book purchases. Previous payments keep their original price.</small>{formError && <p role="alert" className="alert-error">{formError}</p>}<div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : editing.id ? 'Save changes' : 'Create sub-umbrella'}</button></div></form></div></Dialog>}
    {removing && <Dialog title="Archive sub-umbrella" onClose={busy ? () => {} : () => setRemoving(null)}><div className="modal-content card catalog-editor"><h3>Archive {removing.name}?</h3><p>All of its cycles must be archived first. Their records and cycle numbers stay preserved.</p>{formError && <p role="alert" className="alert-error">{formError}</p>}<div className="payment-entry-actions"><button className="btn-secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={archive}>{busy ? 'Archiving…' : 'Archive sub-umbrella'}</button></div></div></Dialog>}
    <AnimatePresence>{importOpen && <PrivateCycleImportDialog parent={parent} instructors={instructors} onClose={() => setImportOpen(false)} onImported={() => load()} onSaved={() => { setImportOpen(false); load(); }} />}</AnimatePresence>
  </div>;
}
