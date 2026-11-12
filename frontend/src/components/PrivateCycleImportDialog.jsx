import { useRef, useState } from 'react';
import axios from 'axios';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import Dialog from './Dialog';
import PrivateBadge from './PrivateBadge';
import EmployeePicker from './EmployeePicker';
import CustomFilterDropdown from './CustomFilterDropdown';
import DateInput from './DateInput';
import { BRANCH_OPTIONS, PRIVATE_SEAT_LIMIT } from '../Constants';
import { recordClientFailure } from '../utils/activity';

const Field = ({ label, children }) => <label className="private-import-field"><span>{label.endsWith(' *') ? label.slice(0, -2) : label}{label.endsWith(' *') && <b className="private-required"> *</b>}</span>{children}</label>;
const PAGE = 10;
const money = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

// Each card is one private cycle: students whose workbook rows share merged cells are imported together.
export default function PrivateCycleImportDialog({ instructors, onClose, onImported, onSaved }) {
  const root = useRef(null);
  const [preview, setPreview] = useState(null),
    [rows, setRows] = useState([]),
    [selected, setSelected] = useState([]),
    [typedNumbers, setTypedNumbers] = useState({}),
    [bookPrices, setBookPrices] = useState({}),
    [employees, setEmployees] = useState({}),
    [students, setStudents] = useState({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [dirty, setDirty] = useState(false),
    [page, setPage] = useState(0),
    [result, setResult] = useState(null),
    [fileName, setFileName] = useState(''),
    [branch, setBranch] = useState('');
  const rowById = new Map(rows.map(r => [r.id, r]));
  const groups = preview?.groups || [];
  const update = (id, field, value) => { setRows(old => old.map(r => (r.id === id ? { ...r, [field]: value } : r))); setDirty(true); };
  const updateCycle = (group, field, value) => update(group.rowIds[0], field, value);
  const employee = (id, field, value) => setEmployees(old => ({ ...old, [id]: { ...old[id], [field]: value } }));
  const defaultStudent = r => (r.matches.length === 1 && !r.matches[0].deletedAt ? r.matches[0].id : '');
  function apply(data, keepChoices) {
    setPreview(data);
    setRows(data.rows);
    setStudents(old => Object.fromEntries(data.rows.map(r => [r.id, keepChoices && r.matches.some(s => s.id === old[r.id] && !s.deletedAt) ? old[r.id] : defaultStudent(r)])));
    setBookPrices(old => Object.fromEntries(data.newUmbrellas.map(name => [name, old[name] ?? '0'])));
    setDirty(false);
  }
  async function upload(file) {
    if (busy || !file) return;
    setError('');
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 2 * 1024 * 1024) {
      recordClientFailure('Rejected private workbook: use an .xlsx file under 2 MB.', file.name);
      return setError('Choose an .xlsx workbook smaller than 2 MB.');
    }
    setBusy(true);
    try {
      const { data } = await axios.post(`/imports/private/preview`, file, { headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) } });
      apply(data, false);
      setSelected(data.groups.filter(g => !g.alreadyImported).map(g => g.id));
      setEmployees(Object.fromEntries(data.sheets.map(s => [s.id, { mode: '', name: s.name, employeeId: '' }])));
      setTypedNumbers({});
      setPage(0);
      setBranch('');
      setFileName(file.name);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not read workbook.');
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    setBusy(true);
    setError('');
    try {
      const { data } = await axios.post(`/imports/private/review`, { previewToken: preview.previewToken, edits: Object.fromEntries(rows.map(r => [r.id, r])), numbers: typedNumbers });
      apply(data, true);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not review changes.');
    } finally {
      setBusy(false);
    }
  }
  const chosen = groups.filter(g => selected.includes(g.id));
  async function commit() {
    if (busy || dirty) return;
    const invalid = root.current?.querySelector('input:invalid');
    if (invalid) { invalid.reportValidity(); return; }
    setBusy(true);
    setError('');
    try {
      const { data } = await axios.post(`/imports/private/commit`, {
        previewToken: preview.previewToken,
        rowIds: chosen.flatMap(g => g.rowIds),
        numbers: Object.fromEntries(chosen.map(g => [g.id, g.cycleNumber])),
        newUmbrellas: Object.fromEntries(Object.entries(bookPrices).map(([name, bookPrice]) => [name, { bookPrice }])),
        employees,
        students
      });
      setResult(data);
      await onImported?.(data);
      window.dispatchEvent(new Event('employees-updated'));
    } catch (e) {
      setError(e.response?.data?.error || 'Nothing was imported. Review the preview and try again.');
    } finally {
      setBusy(false);
    }
  }
  const sheets = preview?.sheets.filter(s => chosen.some(g => g.sheetId === s.id)) || [];
  const neededUmbrellas = (preview?.newUmbrellas || []).filter(name => chosen.some(g => g.umbrellaName === name));
  const groupProblems = group => {
    const members = group.rowIds.map(id => rowById.get(id)).filter(Boolean);
    return [
      ...(!dirty ? group.errors : []),
      ...(group.alreadyImported ? ['Already imported; deselect this cycle.'] : []),
      ...(!dirty ? members.flatMap(r => r.errors.map(e => `${r.name}: ${e}`)) : []),
      ...members.filter(r => r.matches.length && !students[r.id]).map(r => `${r.name}: choose the existing student matching this phone number.`)
    ];
  };
  const unresolved = chosen.filter(g => groupProblems(g).length);
  const employeeProblems = sheets.flatMap(sheet => {
    const e = employees[sheet.id];
    const reason = !e?.mode ? 'Choose Existing employee or Create new employee.' : e.mode === 'existing' && !e.employeeId ? 'Select the existing employee.' : e.mode === 'new' && !e.name.trim() ? 'Enter the new employee name.' : '';
    return reason ? [{ sheet, reason }] : [];
  });
  const missingEmployees = employeeProblems.length > 0;
  function jumpToGroup(id) {
    setPage(Math.floor(groups.findIndex(g => g.id === id) / PAGE));
    requestAnimationFrame(() => requestAnimationFrame(() => { const element = document.getElementById('private-group-' + id); element?.scrollIntoView({ block: 'center', behavior: 'smooth' }); element?.focus({ preventScroll: true }); }));
  }
  const changeAll = value => { setBranch(value); setRows(old => old.map(r => ({ ...r, branch: value }))); setDirty(true); };
  const toggleGroup = (id, on) => setSelected(old => (on ? [...old, id] : old.filter(x => x !== id)));
  const total = chosen.reduce((n, g) => n + g.rowIds.reduce((m, id) => m + (Number(rowById.get(id)?.amount) || 0), 0), 0);
  const studentCount = chosen.reduce((n, g) => n + g.rowIds.length, 0);
  return <Dialog title="Import private courses" onClose={busy ? () => {} : onClose}><div ref={root} className="modal-content card private-course-import"><header className="import-heading"><span className="import-symbol"><FileSpreadsheet size={24} /></span><div><span className="eyebrow">PRIVATE COURSE IMPORT</span><h3>{result ? 'Private cycles created' : 'Review your private courses'}</h3></div><button className="icon-button" disabled={busy} onClick={onClose} aria-label="Close import"><X size={20} /></button></header>
    {result ? <div className="import-success"><CheckCircle2 size={38} /><h3>{result.cycles.length} private cycles created</h3><p>{result.enrolled} students · {result.created} new · {result.reused} existing students reused{result.createdUmbrellas?.length ? ` · New private umbrellas: ${result.createdUmbrellas.join(', ')}` : ''}</p><button className="btn-primary" onClick={() => onSaved(result)}>Done</button></div> : <>
      <p className="muted">Each course entry is filed into its private umbrella ("PET 2" becomes level 2 of PET). Umbrellas that don't exist yet are created. Students whose rows share merged cells are one cycle, up to {PRIVATE_SEAT_LIMIT} students; a merged amount is split equally between them. Payment and Books columns are ignored.</p>
      {error && <div className="alert-error" role="alert">{error}</div>}
      <label className="import-dropzone"><Upload size={24} /><strong>{busy ? 'Working…' : fileName || 'Choose a private-course workbook'}</strong><span>.xlsx · All employee sheets · Up to 500 students</span><input aria-label="Private course workbook" type="file" accept=".xlsx" disabled={busy} onChange={e => { upload(e.target.files[0]); e.target.value = ''; }} /></label>
      {preview && <>
        <div className="private-import-summary"><span><strong>{chosen.length}</strong> cycles selected</span><span><strong>{studentCount}</strong> students</span><span><strong>{sheets.length}</strong> employee sheets</span><span>Tuition <strong>{money(total)} EGP</strong></span><PrivateBadge record={{ isPrivate: true }} /></div>
        {preview.warnings.map(w => <p key={w} className="policy-note">{w}</p>)}
        <section className="private-import-checklist" aria-label="Import requirements" aria-live="polite"><h4>What is needed to import?</h4><p>Each selected cycle needs an umbrella name, a level (1 and up), a branch the umbrella is open for, start date, positive teaching hours and an hourly rate. Each student needs a name, valid phone and tuition amount (0 for exempt). Each sheet needs an employee choice.</p>
          {!selected.length && <p className="alert-error">Select at least one cycle to import.</p>}
          {dirty && <div className="policy-note"><strong>Your latest edits have not been checked.</strong> Click <button type="button" className="text-button" disabled={busy} onClick={review}>Review changes</button> to validate them. Then the import button can become available.</div>}
          {employeeProblems.length > 0 && <div><strong>Employee choices still needed</strong><ul>{employeeProblems.map(({ sheet, reason }) => <li key={sheet.id}><button type="button" className="text-button" onClick={() => document.getElementById('private-sheet-' + sheet.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}>{sheet.name}: {reason}</button></li>)}</ul></div>}
          {unresolved.length > 0 && <div><strong>Cycles still needing attention · click to open</strong><ul>{unresolved.map(g => <li key={g.id}><button type="button" className="text-button" onClick={() => jumpToGroup(g.id)}>{g.umbrellaName || 'Cycle'} {g.cycleNumber ?? ''} · {g.sheet}, row {g.sourceRows.join('/')}: {groupProblems(g).join(' ')}</button></li>)}</ul></div>}
          {!dirty && selected.length > 0 && !unresolved.length && !missingEmployees && <p className="private-import-ready"><CheckCircle2 size={16} />All required information is complete.</p>}
        </section>
        <section className="private-import-section"><h4>1. Choose branch and employees</h4><Field label="Set branch for all cycles *"><CustomFilterDropdown value={branch} onChange={changeAll} options={BRANCH_OPTIONS} placeholder="Choose branch" /></Field><p className="muted">You can override individual cycle branches below. Hourly rates are pre-filled from the Duration column when it shows one (e.g. "20 Hrs / 180 EGP"); check and edit each cycle's rate below.</p>
          <div className="private-import-employees">{sheets.map(s => { const e = employees[s.id] || {}; return <article id={'private-sheet-' + s.id} key={s.id}><div className="private-import-sheet"><strong dir="auto">{s.name}</strong><small>{chosen.filter(g => g.sheetId === s.id).length} private cycles</small></div><div className="section-tabs"><button type="button" className={e.mode === 'existing' ? 'active' : ''} onClick={() => setEmployees(old => ({ ...old, [s.id]: { ...old[s.id], mode: 'existing', employeeId: '' } }))}>Existing employee</button><button type="button" className={e.mode === 'new' ? 'active' : ''} onClick={() => setEmployees(old => ({ ...old, [s.id]: { ...old[s.id], mode: 'new', employeeId: '' } }))}>Create new employee</button></div>{e.mode === 'existing' ? <Field label="Assign these cycles to *"><EmployeePicker id={`private-employee-${s.id}`} value={e.employeeId} onChange={v => employee(s.id, 'employeeId', v)} options={instructors.map(i => ({ value: i.id, label: `${i.name}${i.employeeId ? ' · ' + i.employeeId : ''}` }))} /></Field> : e.mode === 'new' ? <><Field label="New employee name *"><input className="input-field" maxLength={160} value={e.name} onChange={v => employee(s.id, 'name', v.target.value)} /></Field><Field label="Employee ID · optional"><input className="input-field" maxLength={80} value={e.employeeId} onChange={v => employee(s.id, 'employeeId', v.target.value)} /></Field></> : <p className="policy-note">Choose an existing employee or create a new one.</p>}</article>; })}</div>
        </section>
        {neededUmbrellas.length > 0 && <section className="private-import-section"><h4>2. New private umbrellas</h4><p className="muted">These private umbrellas don't exist yet and will be created with the import, open for the branches their cycles run in. Set each one's book price; you can change it later.</p><div className="private-import-new-subs">{neededUmbrellas.map(name => <Field key={name} label={`${name} book price (EGP) *`}><input className="input-field" type="number" min="0" step="0.01" required value={bookPrices[name] ?? '0'} onChange={e => setBookPrices(old => ({ ...old, [name]: e.target.value }))} /></Field>)}</div></section>}
        <section className="private-import-section"><h4>{neededUmbrellas.length ? '3' : '2'}. Review cycles</h4><label className="policy-check"><input type="checkbox" checked={groups.filter(g => !g.alreadyImported).length > 0 && groups.filter(g => !g.alreadyImported).every(g => selected.includes(g.id))} onChange={e => setSelected(e.target.checked ? groups.filter(g => !g.alreadyImported).map(g => g.id) : [])} />Select all available cycles</label><p className="muted">Dates use DD/MM/YY. End dates may stay empty when unknown. Tuition is fully paid; 0 means exempt. When students in one cycle paid different amounts, the highest is the standard fee and the others are recorded as discounted.</p>
          <div className="private-import-rows">{groups.slice(page * PAGE, page * PAGE + PAGE).map(group => {
            const members = group.rowIds.map(id => rowById.get(id)).filter(Boolean), lead = members[0], on = selected.includes(group.id), problems = groupProblems(group);
            if (!lead) return null;
            return <article id={'private-group-' + group.id} tabIndex={-1} key={group.id} className={`private-import-row ${problems.length ? 'needs-review' : ''}`}>
              <header><label className="policy-check"><input type="checkbox" disabled={group.alreadyImported} checked={on} onChange={e => toggleGroup(group.id, e.target.checked)} /><strong>{group.umbrellaName || 'Umbrella name needed'} {group.cycleNumber ?? ''}</strong></label><small>{group.sheet} · Row {group.sourceRows.join(', ')}{group.alreadyImported ? ' · Already imported' : ''}{group.newUmbrella ? ' · New umbrella' : ''}</small></header>
              {members.length > 1 && <p className="private-import-group"><Users size={14} />{members.length} students share this cycle{group.sharedAmount ? ` · ${money(group.sharedAmount.total)} EGP split equally (${members.map(m => money(m.amount)).join(' + ')})` : ''}</p>}
              <fieldset className="private-import-grid" disabled={!on}>
                <Field label="Umbrella *"><input className="input-field" maxLength={120} value={lead.umbrellaName ?? ''} onChange={e => updateCycle(group, 'umbrellaName', e.target.value)} /></Field>
                <Field label={`Level (1–4) *${group.numberSource === 'file' ? ' · from file' : ''}`}><input className="input-field" type="number" min="1" max="4" step="1" required value={typedNumbers[group.id] ?? group.cycleNumber ?? ''} onChange={e => { setTypedNumbers(old => ({ ...old, [group.id]: e.target.value })); setDirty(true); }} /></Field>
                <Field label="Branch *"><CustomFilterDropdown value={lead.branch} options={BRANCH_OPTIONS} onChange={v => updateCycle(group, 'branch', v)} placeholder="Choose branch" /></Field>
                <Field label="Start date *"><DateInput className="input-field" value={lead.startDate} onChange={e => updateCycle(group, 'startDate', e.target.value)} /></Field>
                <Field label="End date · optional"><DateInput className="input-field" min={lead.startDate || undefined} value={lead.endDate} onChange={e => updateCycle(group, 'endDate', e.target.value)} /></Field>
                <Field label="Teaching hours *"><input className="input-field" type="number" min="0.01" step="0.01" value={lead.hours} onChange={e => updateCycle(group, 'hours', e.target.value)} /></Field>
                <Field label="Employee hourly rate (EGP) *"><input className="input-field" type="number" min="0" step="0.01" placeholder="Enter manually" value={lead.hourlyRate ?? ''} onChange={e => updateCycle(group, 'hourlyRate', e.target.value)} /></Field>
              </fieldset>
              {lead.dateIssues?.endDate && !lead.endDate && <label className="policy-check"><input type="checkbox" checked={Boolean(lead.clearEndDate)} onChange={e => updateCycle(group, 'clearEndDate', e.target.checked)} />Confirm end date is unknown</label>}
              <div className="private-import-students">{members.map(row => <div key={row.id} className="private-import-student">
                <fieldset className="private-import-grid" disabled={!on}>
                  <Field label="Student name *"><input className="input-field" maxLength={160} value={row.name} onChange={e => update(row.id, 'name', e.target.value)} /></Field>
                  <Field label="Phone number *"><input className="input-field" value={row.mobile} onChange={e => update(row.id, 'mobile', e.target.value)} /></Field>
                  <Field label="Tuition paid (EGP) *"><input className="input-field" type="number" min="0" step="0.01" value={row.amount} onChange={e => update(row.id, 'amount', e.target.value)} /></Field>
                </fieldset>
                <div className="private-student-match">{row.matches.length ? <><strong>Phone matches {row.matches.length === 1 ? 'an existing student' : 'multiple students'}</strong><CustomFilterDropdown value={students[row.id] || ''} onChange={id => setStudents(old => ({ ...old, [row.id]: id }))} options={row.matches.filter(s => !s.deletedAt).map(s => ({ value: s.id, label: `${s.name} · ${s.registrationNumber || 'No registration ID'} · ${s.mobile}` }))} placeholder="Choose matching student" />{row.matches.some(s => s.deletedAt) && <p className="policy-note">Archived matches must be restored before they can be used.</p>}</> : <span>New student · No matching phone number</span>}</div>
                {row.notes.map((note, i) => <p key={i} className="private-import-note"><AlertTriangle size={14} />{note}</p>)}
              </div>)}</div>
              {!dirty && problems.length > 0 && <ul className="alert-error">{problems.map(e => <li key={e}>{e}</li>)}</ul>}
            </article>;
          })}</div>
          {groups.length > PAGE && <div className="private-import-pagination"><button className="btn-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={15} />Previous</button><span>{page + 1} / {Math.ceil(groups.length / PAGE)}</span><button className="btn-secondary" disabled={(page + 1) * PAGE >= groups.length} onClick={() => setPage(p => p + 1)}>Next<ChevronRight size={15} /></button></div>}
        </section>
        <footer className="private-import-footer"><div><strong>{dirty ? 'Review edited data before importing' : unresolved.length ? `${unresolved.length} selected cycles need review` : missingEmployees ? 'Complete employee choices' : 'Ready to create private cycles'}</strong><small>All selected cycles are saved together. A failed import leaves no partial records.</small></div><div><button className="btn-secondary" disabled={busy} onClick={review}>{busy ? 'Working…' : 'Review changes'}</button><button className="btn-primary" disabled={busy || dirty || !selected.length || unresolved.length > 0 || missingEmployees} onClick={commit}>{busy ? 'Working…' : `Import ${selected.length} private cycles`}</button></div></footer>
      </>}
      <div className="payment-entry-actions"><button className="btn-secondary" disabled={busy} onClick={onClose}>Close</button></div>
    </>}
  </div></Dialog>;
}
