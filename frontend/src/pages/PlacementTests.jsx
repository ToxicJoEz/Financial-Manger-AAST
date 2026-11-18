import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNames } from '../context/NamesContext';
import { cleanPhone } from '../utils/people';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { AnimatePresence, m } from 'framer-motion';
import { ClipboardCheck, Plus, Search, Pencil, Trash2, UserPlus, UserCheck, X, AlertTriangle, ArrowRight, CircleCheck, Hourglass, CalendarDays, IdCard, FilePenLine, Users } from 'lucide-react';
import PrivateBadge from '../components/PrivateBadge';
import { AuthContext } from '../context/AuthContext';
import { PageHeading } from '../components/WorkspaceUI';
import { MotionTab } from '../components/WorkspaceMotion';
import Dialog from '../components/Dialog';
import CustomFilterDropdown from '../components/CustomFilterDropdown';
import EnrollmentDialog from '../components/EnrollmentDialog';
import { branchName, canSeePayroll } from '../utils/access';
import '../styles/_placements.scss';

// Placement tests. Admins and the main mod create a test for a student; the testing office enters the result
// (score out of 55, recommended level, purpose); admins and the main mod place the student in a cycle. A student is
// placed as soon as they join any cycle after the test, however that happened.
const day = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
// Cross-fades its content when the key changes while the box glides to the new height (no holding the old
// height and then snapping).
function SmoothRegion({ transitionKey, children }) {
  const inner = useRef(null);
  const [height, setHeight] = useState(null);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(inner.current);
    return () => observer.disconnect();
  }, []);
  return <div className="smooth-region" style={{ height: height ?? 'auto' }}>
    <div ref={inner} className="smooth-region-inner">
      {/* The leaving content is lifted out of the flow while it fades, so the box never collapses in between
          (which made the page scrollbar flicker); the height glides straight from old to new. */}
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div key={transitionKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>{children}</m.div>
      </AnimatePresence>
    </div>
  </div>;
}
const TABS = [['awaiting', 'Awaiting result', FilePenLine, 'pay'], ['unplaced', 'Not placed yet', Hourglass, 'wait'], ['placed', 'Placed', CircleCheck, 'done'], ['all', 'All tests', ClipboardCheck, 'all']];
const Score = ({ test, max = 55 }) => test.score == null ? <span className="placement-score is-empty">—</span> : <span className="placement-score">{test.score}<small>/{max}</small></span>;

export default function PlacementTests() {
  const { nameOf } = useNames();
  const { user } = useContext(AuthContext);
  // Admins and the main mod create tests and place students; the testing office fills in results.
  const manager = canSeePayroll(user);
  const [status, setStatus] = useState(manager ? 'unplaced' : 'awaiting'), [search, setSearch] = useState(''), [query, setQuery] = useState(''), [branch, setBranch] = useState(''), [level, setLevel] = useState(''), [purpose, setPurpose] = useState('');
  // Ticked students (admins and the main mod), to place several in one course together.
  const [picked, setPicked] = useState([]), [bulk, setBulk] = useState(null);
  const [data, setData] = useState(null), [refresh, setRefresh] = useState(0), [shownKey, setShownKey] = useState(''), [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false), [editFor, setEditFor] = useState(null), [resultFor, setResultFor] = useState(null), [placing, setPlacing] = useState(null), [enrolling, setEnrolling] = useState(null), [removing, setRemoving] = useState(null), [regFor, setRegFor] = useState(null);
  useEffect(() => { const t = setTimeout(() => setQuery(search.trim()), 250); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    const key = [status, query, branch, level, purpose].join(':');
    setLoading(true);
    axios.get('/placements', { params: { status, search: query || undefined, branch: branch || undefined, level: level || undefined, purpose: purpose || undefined }, signal: controller.signal })
      .then(({ data }) => { setData(data); setShownKey(key); })
      .catch(e => { if (!controller.signal.aborted) toast.error(e.response?.data?.error || 'Tests could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, query, branch, level, purpose, refresh]);
  // A new tab or filter starts with nothing ticked.
  useEffect(() => { setPicked([]); }, [status, query, branch, level, purpose]);
  const reload = () => { setPicked([]); setRefresh(n => n + 1); window.dispatchEvent(new Event('notifications-updated')); };
  async function remove(test) {
    try { await axios.delete('/placements/' + test.id); toast.success('Test deleted'); setRemoving(null); reload(); }
    catch (e) { toast.error(e.response?.data?.error || 'The test could not be deleted.'); }
  }
  const rows = data?.rows || [];
  const max = data?.maxScore || 55;
  // The tab the rows on screen belong to (changes once its rows have arrived).
  const shownStatus = shownKey.split(':')[0];
  const missingReg = rows.filter(t => !t.placed && t.score != null && !t.student.registrationNumber).length;
  // Students who can be ticked: a result entered, not placed yet.
  const selectable = manager ? rows.filter(t => t.score != null && !t.placed) : [];
  const empty = { awaiting: manager ? 'No tests are waiting for a result' : 'No tests waiting for your result', unplaced: 'Everyone tested is placed', placed: 'No one placed from a test yet', all: 'No placement tests yet' }[shownStatus] || 'No placement tests yet';
  return <section className="placements-page">
    <PageHeading eyebrow="Placement" title="Tests" description={manager ? 'Create a test for a student; the testing office adds the result, then you place them in a course.' : 'Tests waiting for their result, for your branches.'}>
      {manager && <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} />New test</button>}
    </PageHeading>
    <div className="section-tabs" aria-label="Placement tests">{TABS.map(([value, label, Icon, tone]) => <MotionTab key={value} active={status === value} onClick={() => setStatus(value)}><Icon size={15} className={'status-tab-icon tone-' + tone} aria-hidden="true" />{label}<span>{data?.counts?.[value] ?? 0}</span></MotionTab>)}</div>
    {/* Follows the rows on screen (not the tab just clicked), and slides in and out smoothly. */}
    <AnimatePresence initial={false}>{manager && shownStatus === 'unplaced' && missingReg > 0 && <m.div key="reg-note" className="placement-reg-wrap" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}><p className="placement-reg-note"><IdCard size={16} /><span><strong>{missingReg} waiting student{missingReg === 1 ? ' has' : 's have'} no registration ID.</strong> Click their name, or “Add ID”, to set one before placing them.</span></p></m.div>}</AnimatePresence>
    <div className={'panel placements-panel' + (loading && data ? ' is-refreshing' : '')}>
      <div className="filter-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search tests" placeholder="Search name, phone or registration ID…" value={search} onChange={e => setSearch(e.target.value)} /></div>{(data?.branches?.length || 0) > 1 && <div className="filter-select"><CustomFilterDropdown value={branch} onChange={setBranch} placeholder="All branches" options={data.branches.map(b => ({ value: b, label: branchName(b) }))} /></div>}<div className="filter-select"><CustomFilterDropdown value={level} onChange={setLevel} placeholder="All levels" options={(data?.levels || []).map(l => ({ value: l, label: l }))} /></div><div className="filter-select"><CustomFilterDropdown value={purpose} onChange={setPurpose} placeholder="All purposes" options={(data?.purposes || []).map(p => ({ value: p, label: p }))} /></div></div>
      {/* Several ticked students: place them all in one course. */}
      <AnimatePresence initial={false}>{picked.length > 0 && <m.div key="bulk-bar" className="placement-bulk-wrap" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}><div className="placement-bulk-bar"><span><Users size={16} /><strong>{picked.length} selected</strong>{new Set(rows.filter(t => picked.includes(t.id)).map(t => t.level)).size > 1 && <small>Different recommended levels</small>}</span><div><button type="button" className="text-button" onClick={() => setPicked([])}>Clear</button><button type="button" className="placement-place-button" onClick={() => setBulk({ tests: rows.filter(t => picked.includes(t.id)) })}>Place together<ArrowRight size={14} /></button></div></div></m.div>}</AnimatePresence>
      <SmoothRegion transitionKey={data ? shownKey : 'loading'}>
        {!data ? <div className="loading-state" role="status"><span className="loading-spinner" />Loading tests…</div> : !rows.length ? <div className="empty-state"><ClipboardCheck size={28} /><h3>{query ? 'No matching tests' : empty}</h3><p>{query ? 'Try another search.' : manager ? 'Use “New test” when a student comes in for a placement test.' : 'New tests from the main mod appear here.'}</p></div> :
          <div className="table-scroll"><table className="data-table placements-table">
            <thead><tr>{manager && <th className="select-column">{selectable.length > 0 && <input type="checkbox" aria-label="Select all waiting students shown" checked={selectable.length > 0 && selectable.every(t => picked.includes(t.id))} onChange={e => setPicked(e.target.checked ? selectable.map(t => t.id) : [])} />}</th>}<th>Tested</th><th>Student</th><th>Result</th><th>Status</th><th aria-label="Actions" /></tr></thead>
            <tbody>{rows.map((t, i) => {
              const done = t.score != null;
              return <tr key={t.id} className={(!t.placed && done && !t.student.registrationNumber ? 'is-missing-reg' : '') + (!done && !t.placed ? ' is-awaiting' : '')} style={{ '--row-delay': Math.min(i, 12) * 25 + 'ms' }}>
                {manager && <td className="select-column">{done && !t.placed && <input type="checkbox" aria-label={'Select ' + t.student.name} checked={picked.includes(t.id)} onChange={() => setPicked(p => p.includes(t.id) ? p.filter(x => x !== t.id) : [...p, t.id])} />}</td>}
                <td className="placements-when"><strong>{day(t.testedAt)}</strong><small>{branchName(t.branch)}</small></td>
                <td className="placements-student">{manager && !t.placed && !t.student.registrationNumber ? <button type="button" className="placements-name-button" title="Set a registration ID" onClick={() => setRegFor(t)}><strong dir="auto">{t.student.name}</strong></button> : <strong dir="auto">{t.student.name}</strong>}{t.student.registrationNumber ? <small className="placements-reg">Reg. {t.student.registrationNumber}</small> : <span className="placement-noreg"><IdCard size={12} />No registration ID{manager && !t.placed && <button type="button" className="text-button" onClick={() => setRegFor(t)}>Add ID</button>}</span>}{t.student.mobile && <small className="placements-phone">{t.student.mobile}</small>}<small className="placements-by">Created by {nameOf(t.enteredBy)}{t.resultBy ? ` · result by ${nameOf(t.resultBy)}` : ''}</small></td>
                {/* Score, recommended level and purpose together. */}
                <td className="placements-result">{done ? <div className="placement-result"><Score test={t} max={max} /><span className="placement-level" title="Recommended level">{t.level}</span>{t.purpose && <span className="placement-purpose" title="Purpose">{t.purpose}</span>}</div> : <span className="muted">No result yet</span>}</td>
                <td>{t.placed ? <span className="placement-status is-placed"><CircleCheck size={13} />In {t.placed.cycle.name}</span> : done ? <span className="placement-status is-waiting"><Hourglass size={13} />Not placed yet</span> : <span className="placement-status is-awaiting"><FilePenLine size={13} />Awaiting result</span>}</td>
                <td className="placements-actions-cell"><div className="placements-actions">
                  {!t.placed && (!done ? <button className="placement-place-button is-result" onClick={() => setResultFor(t)}><FilePenLine size={14} />Enter result</button> : manager && <button className="placement-place-button" onClick={() => setPlacing(t)}>Place<ArrowRight size={14} /></button>)}
                  {manager ? <button className="icon-button" aria-label={'Edit ' + t.student.name} title="Edit student and test" onClick={() => setEditFor(t)}><Pencil size={15} /></button> : done && !t.placed && <button className="icon-button" aria-label={'Edit result for ' + t.student.name} title="Edit result" onClick={() => setResultFor(t)}><Pencil size={15} /></button>}
                  {manager && !t.placed && <button className="icon-button danger" aria-label={'Delete test for ' + t.student.name} title="Delete test" onClick={() => setRemoving(t)}><Trash2 size={15} /></button>}
                </div></td>
              </tr>;
            })}</tbody>
          </table></div>}
      </SmoothRegion>
    </div>
    <AnimatePresence>{creating && <CreateTestDialog key="create" branches={data?.branches || []} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); if (status !== 'awaiting') setStatus('awaiting'); reload(); }} />}</AnimatePresence>
    <AnimatePresence>{editFor && <EditTestDialog key="edit" test={editFor} levels={data?.levels || []} purposes={data?.purposes || []} branches={data?.branches || []} max={max} onClose={() => setEditFor(null)} onSaved={() => { setEditFor(null); reload(); }} />}</AnimatePresence>
    <AnimatePresence>{resultFor && <ResultDialog key="result" test={resultFor} levels={data?.levels || []} purposes={data?.purposes || []} max={max} onClose={() => setResultFor(null)} onSaved={() => { setResultFor(null); reload(); }} />}</AnimatePresence>
    <AnimatePresence>{removing && <Dialog key="remove" title="Delete test" onClose={() => setRemoving(null)}><div className="modal-content card placement-dialog"><h3><Trash2 size={18} />Delete <span dir="auto">{removing.student.name}</span>'s test?</h3><p className="muted">{removing.score != null ? `Score ${removing.score}/${max} · ${removing.level} · ` : 'No result yet · '}{branchName(removing.branch)}. The student stays; only this test is removed.</p><div className="payment-entry-actions"><button className="btn-secondary" onClick={() => setRemoving(null)}>Cancel</button><button className="btn-primary btn-danger-solid" onClick={() => remove(removing)}>Delete test</button></div></div></Dialog>}</AnimatePresence>
    <AnimatePresence>{regFor && <RegistrationDialog key="reg" test={regFor} onClose={() => setRegFor(null)} onSaved={() => { setRegFor(null); reload(); }} />}</AnimatePresence>
    <AnimatePresence>{placing && <PlaceDialog key="place" test={placing} max={max} onClose={() => setPlacing(null)} onPick={cycle => { setEnrolling({ cycle, test: placing }); setPlacing(null); }} />}</AnimatePresence>
    <AnimatePresence>{bulk && !bulk.cycle && <PlaceDialog key="bulk-place" tests={bulk.tests} max={max} onClose={() => setBulk(null)} onPick={cycle => setBulk(b => ({ ...b, cycle }))} />}</AnimatePresence>
    <AnimatePresence>{bulk?.cycle && <BulkEnrollDialog key="bulk-enroll" cycle={bulk.cycle} tests={bulk.tests} max={max} onClose={() => setBulk(null)} onDone={() => { setBulk(null); reload(); }} />}</AnimatePresence>
    <AnimatePresence>{enrolling && <EnrollmentDialog key="enroll" course={enrolling.cycle} initialStudent={{ ...enrolling.test.student, level: enrolling.test.level, score: enrolling.test.score, purpose: enrolling.test.purpose }} onClose={() => setEnrolling(null)} onSaved={() => { toast.success(`${enrolling.test.student.name} placed in ${enrolling.cycle.name}`); reload(); }} />}</AnimatePresence>
  </section>;
}

// Admins and the main mod: a new test for a student (existing or new) at a branch. The result comes later.
function CreateTestDialog({ branches, onClose, onSaved }) {
  // A new student is the usual case (walk-ins), so that tab comes first and opens by default.
  const [student, setStudent] = useState(null), [isNew, setIsNew] = useState(true);
  const [newStudent, setNewStudent] = useState({ name: '', mobile: '', registrationNumber: '' });
  const [match, setMatch] = useState(null), [branch, setBranch] = useState(branches[0] || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save(e) {
    e?.preventDefault(); setError('');
    if (!student && !isNew) return setError('Choose the student, or create a new one.');
    if (isNew && !newStudent.name.trim()) return setError('Enter the student name.');
    if (!branch) return setError('Choose the branch.');
    setBusy(true);
    try {
      const { data } = await axios.post('/placements', { branch, ...(isNew ? { newStudent } : { studentId: student.id }) });
      if (data.siblings?.length) toast(`Same phone as ${data.siblings.join(', ')}: saved as a separate student.`, { icon: 'ℹ️', duration: 7000 });
      toast.success('Test created. It waits for the testing office to add the result.');
      onSaved();
    } catch (err) {
      // The student already exists (same name and phone): offer to use them instead.
      if (err.response?.status === 409 && err.response.data.existing) setMatch(err.response.data.existing);
      else setError(err.response?.data?.error || 'The test could not be created.');
    } finally { setBusy(false); }
  }
  return <Dialog title="New placement test" onClose={busy ? () => {} : onClose}>
    <form className="modal-content card placement-dialog" onSubmit={save}>
      <h3><ClipboardCheck size={18} />New placement test</h3>
      <p className="muted">Choose who is taking the test. The testing office enters the score, level and purpose afterwards.</p>
      <div className="section-tabs"><button type="button" className={isNew ? 'active' : ''} onClick={() => { setIsNew(true); setStudent(null); }}>New student</button><button type="button" className={!isNew ? 'active' : ''} onClick={() => { setIsNew(false); setMatch(null); }}>Existing student</button></div>
      {isNew ? <div className="placement-new-student">
        <label>Full name *<input className="input-field" required autoFocus value={newStudent.name} onChange={e => { setNewStudent(s => ({ ...s, name: e.target.value })); setMatch(null); }} /></label>
        <label>Phone<input className="input-field" value={newStudent.mobile} onChange={e => { setNewStudent(s => ({ ...s, mobile: cleanPhone(e.target.value) })); setMatch(null); }} /></label>
        <label>Registration ID (optional)<input className="input-field" value={newStudent.registrationNumber} onChange={e => setNewStudent(s => ({ ...s, registrationNumber: e.target.value }))} /></label>
        {match && <div className="placement-match" role="alert"><AlertTriangle size={16} /><div><strong>This student already exists</strong><span dir="auto">{match.name} · {match.mobile || 'no phone'}{match.registrationNumber ? ' · ' + match.registrationNumber : ''}</span></div><button type="button" className="btn-sm btn-primary" onClick={() => { setStudent(match); setIsNew(false); setMatch(null); }}>Use this student</button></div>}
      </div> : <StudentSearch selected={student} onSelect={setStudent} />}
      <label>Branch *<CustomFilterDropdown allowClear={false} value={branch} onChange={setBranch} options={branches.map(b => ({ value: b, label: branchName(b) }))} placeholder="Choose branch" /></label>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || (!student && !isNew)}>{busy ? 'Creating…' : 'Create test'}</button></div>
    </form>
  </Dialog>;
}

// The testing office (and admins / the main mod): the score out of 55, the recommended level and the purpose.
function ResultDialog({ test, levels, purposes, max, onClose, onSaved }) {
  // The score can't go above the maximum (or below 0): typing more is capped as you type.
  const capScore = value => { if (value === '') return ''; const n = Number(value); return !Number.isFinite(n) ? '' : n > max ? String(max) : n < 0 ? '0' : value; };
  const [form, setForm] = useState({ score: test.score == null ? '' : capScore(String(test.score)), level: test.level || '', purpose: test.purpose || '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const editing = test.score != null;
  async function save(e) {
    e.preventDefault(); setError('');
    const score = Number(form.score);
    if (form.score === '' || !Number.isFinite(score) || score < 0 || score > max) return setError(`Enter the score: a number from 0 to ${max}.`);
    if (!form.level) return setError('Choose the recommended level.');
    if (!form.purpose) return setError('Choose the purpose of the test.');
    setBusy(true);
    try { await axios.put('/placements/' + test.id, form); toast.success(editing ? 'Result updated' : 'Result saved'); onSaved(); }
    catch (err) { setError(err.response?.data?.error || 'The result could not be saved.'); }
    finally { setBusy(false); }
  }
  return <Dialog title={editing ? 'Edit result' : 'Enter result'} onClose={busy ? () => {} : onClose}>
    <form className="modal-content card placement-dialog" onSubmit={save}>
      <h3><FilePenLine size={18} />{editing ? 'Edit result' : 'Enter result'} · <span dir="auto">{test.student.name}</span></h3>
      <p className="muted">{test.student.registrationNumber ? 'Reg. ' + test.student.registrationNumber + ' · ' : ''}{test.student.mobile || 'No phone'} · {branchName(test.branch)} · created {day(test.testedAt)}</p>
      <div className="placement-fields">
        <label>Score (out of {max}) *<span className="placement-score-input"><input className="input-field" type="number" step="any" min="0" max={max} required autoFocus value={form.score} onChange={e => setForm(f => ({ ...f, score: capScore(e.target.value) }))} /><b>/ {max}</b></span></label>
        <label>Recommended level *<CustomFilterDropdown searchable allowClear={false} value={form.level} onChange={v => setForm(f => ({ ...f, level: v }))} options={levels.map(l => ({ value: l, label: l }))} placeholder="Choose level" /></label>
        <label>Purpose *<CustomFilterDropdown allowClear={false} value={form.purpose} onChange={v => setForm(f => ({ ...f, purpose: v }))} options={purposes.map(p => ({ value: p, label: p }))} placeholder="Choose purpose" /></label>
      </div>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save result'}</button></div>
    </form>
  </Dialog>;
}

// The main mod gives a tested student their registration ID before placing them.
function RegistrationDialog({ test, onClose, onSaved }) {
  const [value, setValue] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save(e) {
    e.preventDefault(); setError('');
    if (!value.trim()) return setError('Enter the registration ID.');
    setBusy(true);
    try { await axios.put('/students/' + test.student.id, { registrationNumber: value.trim() }); toast.success('Registration ID saved'); onSaved(); }
    catch (err) { setError(err.response?.data?.error || 'The registration ID could not be saved.'); }
    finally { setBusy(false); }
  }
  return <Dialog title="Add registration ID" onClose={busy ? () => {} : onClose}>
    <form className="modal-content card placement-dialog" onSubmit={save}>
      <h3><IdCard size={18} />Registration ID for <span dir="auto">{test.student.name}</span></h3>
      <p className="muted">{test.student.mobile || 'No phone'} · tested {day(test.testedAt)}{test.level ? ' · ' + test.level : ''}</p>
      <label>Registration ID *<input className="input-field" autoFocus value={value} onChange={e => setValue(e.target.value)} /></label>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save ID'}</button></div>
    </form>
  </Dialog>;
}

// Finds students by name, phone or registration ID (basic details only).
function StudentSearch({ selected, onSelect }) {
  const [q, setQ] = useState(''), [rows, setRows] = useState([]), [loading, setLoading] = useState(false);
  useEffect(() => {
    if (selected) return;
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(() => axios.get('/placements/students', { params: { search: q || undefined }, signal: controller.signal })
      .then(({ data }) => setRows(data.students)).catch(() => {}).finally(() => { if (!controller.signal.aborted) setLoading(false); }), 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q, selected]);
  if (selected) return <div className="enrollment-selected-student"><UserCheck size={22} /><div><strong dir="auto">{selected.name}</strong><small>{selected.registrationNumber || 'No registration ID'}{selected.mobile ? ' · ' + selected.mobile : ''}</small></div><button type="button" className="icon-button" aria-label="Change student" onClick={() => onSelect(null)}><X size={17} /></button></div>;
  return <div className="enrollment-student-picker">
    <div className="search-field"><Search size={17} /><input autoFocus aria-label="Find a student" placeholder="Search name, phone or registration ID…" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="enrollment-student-results">{rows.map(s => <button type="button" key={s.id} className="enrollment-student-result" onClick={() => onSelect(s)}><span className="enrollment-student-avatar" dir="auto">{s.name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join(' ')}</span><span><strong dir="auto">{s.name}</strong><small>{s.registrationNumber || 'No registration ID'}{s.mobile ? ' · ' + s.mobile : ''}</small></span><span className="enrollment-pick-label">Select</span></button>)}
      {!loading && !rows.length && <p className="enrollment-picker-empty">No matching students. Use "New student" to create one.</p>}{loading && <p className="enrollment-picker-empty" role="status">Searching…</p>}</div>
  </div>;
}

// Choose the cycle to place a tested student in: open cycles of the recommended level in their branch first.
// Choose the cycle to place one tested student, or several together (tests), in.
function PlaceDialog({ test: single, tests: many, max = 55, onClose, onPick }) {
  const group = many || [single];
  const test = group[0];
  const sameLevel = group.every(t => String(t.level).toUpperCase() === String(test.level).toUpperCase());
  const sameBranch = group.every(t => t.branch === test.branch);
  const [q, setQ] = useState(''), [branchOnly, setBranchOnly] = useState(sameBranch), [levelOnly, setLevelOnly] = useState(sameLevel), [rows, setRows] = useState(null), [shown, setShown] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const key = [q, branchOnly, levelOnly].join(':');
    const t = setTimeout(() => axios.get('/cycles', { params: { search: q || (levelOnly ? test.level : undefined), status: 'active', branch: branchOnly ? test.branch : undefined, pageSize: 100 }, signal: controller.signal })
      .then(({ data }) => { setRows(data.rows); setShown(key); }).catch(() => { if (!controller.signal.aborted) { setRows([]); setShown(key); } }), 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [q, branchOnly, levelOnly, test.branch, test.level]);
  // The umbrella's own name must be the level ("PTE"), not just contain it ("SePTEmber").
  const cycles = (rows || []).filter(c => !levelOnly || String(c.parentCourse?.name || '').trim().toUpperCase() === test.level.trim().toUpperCase()).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  return <Dialog title="Place in a course" onClose={onClose}>
    <div className="modal-content card placement-dialog">
      <h3><UserPlus size={18} />{group.length > 1 ? `Place ${group.length} students together` : <>Place <span dir="auto">{test.student.name}</span></>}</h3>
      {group.length > 1 ? <p className="muted">{group.map(t => t.student.name).join(', ')} · {sameLevel ? <>recommended <strong>{test.level}</strong></> : 'different recommended levels'}</p> : <p className="muted">Recommended level <strong>{test.level}</strong> · score {test.score}/{max}{test.purpose ? ' · ' + test.purpose : ''} · tested in {branchName(test.branch)}</p>}
      <div className="search-field"><Search size={17} /><input autoFocus aria-label="Find a cycle" value={q} placeholder="Search cycles by name…" onChange={e => setQ(e.target.value)} /></div>
      <div className="placement-filters"><label className="policy-check"><input type="checkbox" checked={levelOnly} onChange={e => setLevelOnly(e.target.checked)} />Only {test.level} cycles</label><label className="policy-check"><input type="checkbox" checked={branchOnly} onChange={e => setBranchOnly(e.target.checked)} />Only {branchName(test.branch)}</label></div>
      <SmoothRegion transitionKey={rows === null ? 'loading' : shown}>
        <div className="placement-cycles">{rows === null ? <p className="muted">Finding running cycles…</p> : !cycles.length ? <p className="muted placement-none">No running {levelOnly ? test.level + ' ' : ''}cycles{branchOnly ? ' in ' + branchName(test.branch) : ''}. Untick a filter, or create the cycle first.</p> : cycles.map(c => <button type="button" key={c.id} className="placement-cycle" onClick={() => onPick(c)}><span className="placement-cycle-main"><strong>{c.name}<PrivateBadge record={c} /></strong><small>{branchName(c.branch)} · {(c.enrollments || []).length} student{(c.enrollments || []).length === 1 ? '' : 's'} · {Number(c.courseFee || 0).toLocaleString()} EGP</small></span><span className="placement-cycle-start"><CalendarDays size={14} /><span><small>Starts</small><b>{c.startDate ? day(c.startDate) : '—'}</b></span></span><ArrowRight size={16} className="placement-cycle-go" /></button>)}</div>
      </SmoothRegion>
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button></div>
    </div>
  </Dialog>;
}

// Enrolls several tested students in one cycle at once: all paying the standard tuition, or all exempt.
// (A discount is per student: enroll that student on their own.) Each enrollment is saved one by one, and the
// result of each is shown, so one refusal (a full private cycle, say) doesn't stop the rest.
function BulkEnrollDialog({ cycle, tests, max, onClose, onDone }) {
  const fee = Number(cycle.courseFee || 0);
  const [type, setType] = useState(fee > 0 ? 'FULL' : 'EXEMPT'), [metadata, setMetadata] = useState({});
  const [busy, setBusy] = useState(false), [results, setResults] = useState(null);
  async function enrollAll() {
    setBusy(true);
    const out = [];
    for (const t of tests) {
      try {
        await axios.post(`/cycles/${cycle.id}/enrollments`, { studentId: t.student.id, tuitionType: type, recordPayment: type === 'FULL', exempt: type === 'EXEMPT', amountPaid: type === 'FULL' ? fee : 0, paymentMethod: metadata.paymentMethod });
        out.push({ test: t, ok: true });
      } catch (e) {
        out.push({ test: t, ok: false, error: e.response?.data?.error || 'Could not be enrolled.' });
      }
      setResults([...out]);
    }
    setBusy(false);
    const placed = out.filter(r => r.ok).length;
    if (placed) toast.success(`${placed} placed in ${cycle.name}`);
    window.dispatchEvent(new Event('notifications-updated'));
  }
  const failed = results?.filter(r => !r.ok) || [];
  return <Dialog title="Place students together" onClose={busy ? () => {} : results ? onDone : onClose}>
    <div className="modal-content card placement-dialog">
      <h3><Users size={18} />Place {tests.length} students in {cycle.name}<PrivateBadge record={cycle} /></h3>
      <p className="muted">{branchName(cycle.branch)} · starts {cycle.startDate ? day(cycle.startDate) : '—'} · tuition {fee.toLocaleString()} EGP</p>
      <ul className="placement-bulk-list">{tests.map(t => { const r = results?.find(x => x.test.id === t.id); return <li key={t.id} className={r ? (r.ok ? 'is-done' : 'is-failed') : ''}><span dir="auto">{t.student.name}</span><small>{t.level} · {t.score}/{max}</small>{r && (r.ok ? <span className="placement-status is-placed"><CircleCheck size={13} />Placed</span> : <span className="placement-bulk-error">{r.error}</span>)}</li>; })}</ul>
      {!results && <>
        <fieldset className="management-choice" disabled={busy}><legend>Tuition for all of them</legend>
          <label className="policy-check"><input type="radio" name="bulk-tuition" checked={type === 'FULL'} disabled={fee === 0} onChange={() => setType('FULL')} />Full payment · {fee.toLocaleString()} EGP each</label>
          <label className="policy-check"><input type="radio" name="bulk-tuition" checked={type === 'EXEMPT'} onChange={() => setType('EXEMPT')} />Exempt · no tuition</label>
        </fieldset>
        {type === 'FULL' && <div className="payment-choice-panel"><p><strong>{fee.toLocaleString()} EGP</strong> recorded as paid for each student.</p><label>Payment method<CustomFilterDropdown allowClear={false} value={metadata.paymentMethod || 'UNSPECIFIED'} onChange={paymentMethod => setMetadata({ paymentMethod })} options={[{ value: 'UNSPECIFIED', label: 'Unspecified' }, { value: 'CASH', label: 'Cash' }, { value: 'ONLINE', label: 'Online' }, { value: 'CARD', label: 'Card' }]} /></label><small className="muted">Receipt numbers differ per student: add them on each student afterwards if needed.</small></div>}
        <p className="policy-note">For a discount, place that student on their own instead.</p>
      </>}
      {results && failed.length > 0 && !busy && <p className="alert-error">{failed.length} could not be placed. They stay in “Not placed yet”.</p>}
      <div className="payment-entry-actions">{results && !busy ? <button type="button" className="btn-primary" onClick={onDone}>Done</button> : <><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={busy} onClick={enrollAll}>{busy ? `Placing ${results?.length || 0} of ${tests.length}…` : `Place ${tests.length} students`}</button></>}</div>
    </div>
  </Dialog>;
}

// Admins and the main mod: correct anything about a test at any time, placed or not: the student's name, phone and
// registration ID, the branch, and the result (score out of 55, level, purpose).
function EditTestDialog({ test, levels, purposes, branches, max, onClose, onSaved }) {
  const cap = value => { if (value === '') return ''; const n = Number(value); return !Number.isFinite(n) ? '' : n > max ? String(max) : n < 0 ? '0' : value; };
  const [form, setForm] = useState({
    name: test.student.name || '', mobile: test.student.mobile || '', registrationNumber: test.student.registrationNumber || '',
    branch: test.branch, score: test.score == null ? '' : cap(String(test.score)), level: test.level || '', purpose: test.purpose || ''
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  async function save(e) {
    e.preventDefault(); setError('');
    if (!form.name.trim()) return setError('Enter the student name.');
    const anyResult = form.score !== '' || form.level || form.purpose;
    if (anyResult && (form.score === '' || !form.level || !form.purpose)) return setError('Fill in the score, level and purpose together.');
    setBusy(true);
    try {
      const student = test.student;
      if (form.name.trim() !== (student.name || '') || form.mobile.trim() !== (student.mobile || '') || form.registrationNumber.trim() !== (student.registrationNumber || ''))
        await axios.put('/students/' + student.id, { name: form.name.trim(), mobile: form.mobile.trim(), registrationNumber: form.registrationNumber.trim() });
      await axios.put('/placements/' + test.id, { branch: form.branch, ...(anyResult ? { score: form.score, level: form.level, purpose: form.purpose } : {}) });
      toast.success('Saved');
      onSaved();
    } catch (err) { setError(err.response?.data?.error || 'The changes could not be saved.'); }
    finally { setBusy(false); }
  }
  return <Dialog title="Edit test" onClose={busy ? () => {} : onClose}>
    <form className="modal-content card placement-dialog" onSubmit={save}>
      <h3><Pencil size={18} />Edit <span dir="auto">{test.student.name}</span>'s test</h3>
      <p className="muted">Created {day(test.testedAt)}{test.placed ? ` · placed in ${test.placed.cycle.name}` : ''}. Changes to the student apply everywhere they appear.</p>
      <fieldset className="placement-edit-group"><legend>Student</legend>
        <label>Full name *<input className="input-field" required value={form.name} onChange={e => set('name', e.target.value)} /></label>
        <div className="placement-fields placement-fields-2"><label>Phone<input className="input-field" inputMode="tel" value={form.mobile} onChange={e => set('mobile', cleanPhone(e.target.value))} /></label><label>Registration ID<input className="input-field" value={form.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} /></label></div>
      </fieldset>
      <fieldset className="placement-edit-group"><legend>Test</legend>
        <label>Branch<CustomFilterDropdown allowClear={false} value={form.branch} onChange={v => set('branch', v)} options={branches.map(b => ({ value: b, label: branchName(b) }))} /></label>
        <div className="placement-fields">
          <label>Score (out of {max})<span className="placement-score-input"><input className="input-field" type="number" step="any" min="0" max={max} value={form.score} onChange={e => set('score', cap(e.target.value))} /><b>/ {max}</b></span></label>
          <label>Recommended level<CustomFilterDropdown searchable allowClear={false} value={form.level} onChange={v => set('level', v)} options={levels.map(l => ({ value: l, label: l }))} placeholder="Choose level" /></label>
          <label>Purpose<CustomFilterDropdown allowClear={false} value={form.purpose} onChange={v => set('purpose', v)} options={purposes.map(p => ({ value: p, label: p }))} placeholder="Choose purpose" /></label>
        </div>
      </fieldset>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  </Dialog>;
}
