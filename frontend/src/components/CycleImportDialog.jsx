import {recordClientFailure} from '../utils/activity';
import CycleScheduleFields from './CycleScheduleFields';
import { suggestCourseFee } from '../utils/importFee';
import { useState } from 'react';
import axios from 'axios';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import Dialog from './Dialog';
import CustomFilterDropdown from './CustomFilterDropdown';
import { BRANCH_OPTIONS } from '../Constants';
const money = value => Number(value || 0).toLocaleString('en-EG', {
  maximumFractionDigits: 2
});
export default function CycleImportDialog({
  parent,
  instructors,
  manager,
  onClose,
  onImported,
  onSaved
}) {
  const [page, setPage] = useState(0);
  const [file, setFile] = useState(null),
    [preview, setPreview] = useState(null),
    [choices, setChoices] = useState({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState(null);
  const [form, setForm] = useState({
    cycleNumber: String(parent.nextCycleNumber || ''),
    branch: '',
    courseFee: '',
    venue: '', classStartTime: '', classEndTime: '',
    totalHours: '',
    startDate: '',
    endDate: '',
    details: '',
    instructorId: '',
    hourlyRate: '',
    paymentDate: ''
  });
  const set = (key, value) => setForm(old => ({
    ...old,
    [key]: value
  }));
  const choice = (reg, key, value) => setChoices(old => ({
    ...old,
    [reg]: {
      ...old[reg],
      [key]: value
    }
  }));
  async function readFile(selectedFile) {
    if (busy) return;
    setFile(selectedFile);
    setError('');
    if (!selectedFile || !selectedFile.name.toLowerCase().endsWith('.xlsx')) {if(selectedFile)recordClientFailure('Rejected cycle workbook: choose an .xlsx registration roster.',selectedFile.name);return setError('Choose an .xlsx registration roster.');}
    if (selectedFile.size > 2 * 1024 * 1024) {recordClientFailure('Rejected cycle workbook: the workbook exceeds 2 MB.',selectedFile.name);return setError('The workbook must be smaller than 2 MB.');}
    setBusy(true);
    try {
      const {
        data
      } = await axios.post(`/imports/${parent.id}/preview`, selectedFile, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(selectedFile.name)
        }
      });
      setPage(0);
      setPreview(data);
      setForm(old => ({
        ...old,
        courseFee: suggestCourseFee(data.rows),
        startDate: data.startDate,
        endDate: data.endDate
      }));
      setChoices(Object.fromEntries(data.rows.map(row => [row.registrationNumber, {
        profile: row.differences.length ? '' : 'fill',
        feeMode: '',
        customFee: String(row.amount),
        confirmSameName: false
      }])));
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || 'Could not read the workbook.');
    } finally {
      setBusy(false);
    }
  }
  async function commit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const {
        data
      } = await axios.post(`/imports/${parent.id}/commit`, {
        ...form,
        choices,
        previewToken: preview.previewToken
      });
      setResult(data);
      onImported?.(data);
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || 'Import failed. Nothing was saved. Refresh the preview if records have changed.');
    } finally {
      setBusy(false);
    }
  }
  const fee = Number(form.courseFee),
    rows = preview?.rows || [];
  const blocked = preview?.courseMismatch || rows.some(r => r.issues.length);
  function reviewReasons(row) {
    const c = choices[row.registrationNumber] || {};
    const reasons = [];
    if (!c.profile) reasons.push('Choose how to handle the existing student details.');
    if (row.sameName && !c.confirmSameName) reasons.push('Confirm this student is different from the matching name with another registration number.');
    if (form.courseFee !== '') {
      if (row.amount > fee) reasons.push(`Payment exceeds the standard fee of ${money(fee)} EGP.`);
      if (row.amount < fee && !c.feeMode) reasons.push(`Paid ${money(row.amount)} of ${money(fee)} EGP: choose partial payment or a discounted fee.`);
      if (c.feeMode === 'discount' && !manager) reasons.push('A manager must confirm this discount.');
      if (c.feeMode === 'discount' && (c.customFee === '' || !Number.isFinite(Number(c.customFee)) || Number(c.customFee) < row.amount || Number(c.customFee) > fee)) reasons.push(`Enter a discounted fee between ${money(row.amount)} and ${money(fee)} EGP.`);
      if (c.feeMode === 'exempt' && row.amount !== 0) reasons.push('An exemption cannot include a positive payment.');
    }
    return reasons;
  }
  const pendingRows = rows.map((row, index) => ({ row, index, reasons: reviewReasons(row) })).filter(item => item.reasons.length);
  const requiresReview = pendingRows.length > 0;
  function jumpToStudent(index) {
    setPage(Math.floor(index / 25));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const article = document.getElementById(`import-student-${index}`);
      article?.scrollIntoView({ behavior: 'auto', block: 'center' });
      article?.focus({ preventScroll: true });
    }));
  }
  const missingFields = [];
  if (!form.cycleNumber) missingFields.push('Cycle number');
  if (!form.branch) missingFields.push('Branch');
  if (!form.startDate) missingFields.push('Start date');
  if (!form.endDate) missingFields.push('End date');
  if (form.courseFee === '') missingFields.push('Standard tuition fee');
  if (manager && form.instructorId && form.hourlyRate === '') missingFields.push("Employee hourly rate");
  const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en', {timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date()).map(part => [part.type, part.value]));
  const finishesOnImport = Boolean(form.endDate && form.endDate <= `${dateParts.year}-${dateParts.month}-${dateParts.day}`);
  const expected = rows.reduce((sum, row) => {
    const c = choices[row.registrationNumber];
    return sum + (c?.feeMode === 'discount' ? Number(c.customFee || 0) : c?.feeMode === 'exempt' ? 0 : fee);
  }, 0);
  return <Dialog title="Import cycle from Excel" onClose={busy ? () => {} : onClose}><div className="modal-content card cycle-import">
  <div className="import-heading"><span className="import-symbol"><FileSpreadsheet size={24} /></span><div><span className="eyebrow">REGISTRATION IMPORT</span><h3>{result ? 'Cycle ready' : 'Import cycle from Excel'}</h3></div><button className="icon-button" aria-label="Close import" disabled={busy} onClick={onClose}><X size={20} /></button></div>
  {result ? <div className="import-success"><CheckCircle2 size={40} /><h3>{result.cycleName} was created</h3><p>{result.enrolled} students enrolled · {result.created} new · {result.reused} existing</p><p className="muted">{result.isFinished ? "Marked completed automatically because its end date is today or earlier. " : "Imported as an active cycle. "}Payments and student details are saved. {form.instructorId && !manager ? "The employee request is awaiting manager approval." : ''}</p><button className="btn-primary" onClick={() => onSaved(result)}>View cycle</button></div> : <>
  <div className="student-form-group"><label htmlFor="import-parent">Course umbrella</label><input id="import-parent" className="input-field" readOnly value={`${parent.name} · ${parent.code}`} /></div>
  <p className="muted">One registration roster creates one cycle. Fields marked <Required /> are required; other fields are optional.</p>
  {error && <div className="alert-error" role="alert">{error}</div>}
  {!preview ? <div><label className="import-dropzone" htmlFor="import-file"><Upload size={30} /><strong>{file?.name || 'Choose a registration workbook'}<Required /></strong><span>.xlsx · Up to 2 MB · Up to 1,000 students</span><input id="import-file" type="file" accept=".xlsx" required disabled={busy} onChange={e => { const selected = e.target.files[0]; if (selected) readFile(selected); e.target.value = ''; }} /></label>{busy && <p role="status" className="policy-note">Reading workbook…</p>}<div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button></div></div> : <form onSubmit={commit}>
   <div className="import-file-bar"><FileSpreadsheet size={18} /><span>{file?.name} · {rows.length} students</span><button type="button" className="text-button" disabled={busy} onClick={() => {
              setPreview(null);
              setError('');
            }}>Change file</button></div>
   {preview.courseMismatch && <div className="alert-error" role="alert">The file course code ({preview.courseCode || 'missing'}) does not match {parent.code}. Choose the correct umbrella or correct the source file.</div>}
   <h4>Cycle details</h4><div className="import-form-grid">
    <Field label="Cycle number" id="import-number"><input id="import-number" className="input-field" required type="number" min="1" max="2147483647" step="1" value={form.cycleNumber} onChange={e => set('cycleNumber', e.target.value)} /></Field>
    <Field label="Branch" id="import-branch"><CustomFilterDropdown id="import-branch" required options={BRANCH_OPTIONS} value={form.branch} onChange={value => set('branch', value)} placeholder="Choose branch" allowClear={true} /></Field>
    <Field label="Start date · from Excel" id="import-start"><input id="import-start" className="input-field" required type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} /></Field>
    <Field label="End date · from Excel" id="import-end"><input id="import-end" className="input-field" required type="date" min={form.startDate} value={form.endDate} onChange={e => set('endDate', e.target.value)} /></Field>
    <Field label="Standard tuition fee (EGP)" id="import-fee" hint="Suggested from the most common payment amount. You can edit it."><input id="import-fee" className="input-field" required type="number" min="0" step="0.01" value={form.courseFee} onChange={e => {
                set('courseFee', e.target.value);

              }} /></Field>
    <CycleScheduleFields value={form} onChange={setForm} />
    <Field label="Total teaching hours · optional" id="import-hours"><input id="import-hours" className="input-field" type="number" min="0.01" step="0.01" value={form.totalHours} onChange={e => set('totalHours', e.target.value)} /></Field>
    <Field label="Employee · optional" id="import-instructor"><CustomFilterDropdown id="import-instructor" options={instructors.map(i => ({
                value: i.id,
                label: i.name
              }))} value={form.instructorId} onChange={value => set('instructorId', value)} placeholder="Assign later" /></Field>
    {manager && form.instructorId && <Field label="Employee hourly rate (EGP)" id="import-rate"><input id="import-rate" className="input-field" required type="number" min="0" step="0.01" value={form.hourlyRate} onChange={e => set('hourlyRate', e.target.value)} /></Field>}
    <Field label="Actual payment date · optional, applies to this roster" id="import-payment-date"><input id="import-payment-date" className="input-field" type="date" max={new Date().toISOString().slice(0, 10)} value={form.paymentDate} onChange={e => set('paymentDate', e.target.value)} /></Field>
   </div><p className="policy-note" role="status">{finishesOnImport ? "This cycle will be marked completed: its end date is today or earlier in Cairo. Employee payment is not recorded automatically." : 'This cycle will remain active because its end date is in the future.'}</p><p className="policy-note">Leave payment date empty if unknown. Imported opening balances will be labelled with the import date, not an assumed payment date.{!manager && " Employee selections require manager approval. Only managers can confirm discounted fees."}</p>
   <Field label="Description · optional" id="import-description"><textarea id="import-description" className="input-field" maxLength={2000} value={form.details} onChange={e => set('details', e.target.value)} /></Field>
   <div className="import-summary"><div><small>Students</small><strong>{rows.length}</strong></div><div><small>Expected tuition</small><strong>{money(expected)} EGP</strong></div><div><small>Collected</small><strong>{money(rows.reduce((sum, r) => sum + r.amount, 0))} EGP</strong></div><div><small>Remaining</small><strong>{money(Math.max(0, expected - rows.reduce((sum, r) => sum + r.amount, 0)))} EGP</strong></div></div>
   <h4>Review students & payments</h4><p className="muted">Matching registration numbers reuse existing students. Conflicting names must be corrected before importing.</p>
   {manager && <div className="import-bulk-discount"><div><strong>Discount lower payments together</strong><p>Sets each discounted fee to the amount already paid, leaving no remaining balance. You can still edit individual students.</p></div><button className="btn-secondary" type="button" disabled={busy || form.courseFee === '' || !rows.some(row => row.amount < fee)} onClick={() => setChoices(old => {
     const next = {...old};
     for (const row of rows) if (row.amount < fee) next[row.registrationNumber] = {...next[row.registrationNumber], feeMode: 'discount', customFee: String(row.amount)};
     return next;
   })}>Discount all lower payments ({form.courseFee === '' ? 0 : rows.filter(row => row.amount < fee).length})</button></div>}
   <div className="import-roster">{rows.slice(page * 25, (page + 1) * 25).map((row, index) => {
              const c = choices[row.registrationNumber] || {};
              const below = form.courseFee !== '' && row.amount < fee;
              const reasons = reviewReasons(row);
              return <article id={`import-student-${page * 25 + index}`} tabIndex={-1} className={`import-student ${row.issues.length ? 'has-conflict' : reasons.length ? 'needs-review' : ''}`} key={row.row}>
    <div className="import-student-heading"><div><strong dir="auto">{row.name}</strong><small>{row.englishName || 'No English name'} · {row.registrationNumber} · Excel row {row.row}</small></div><span className="import-badge">{row.existing ? 'Existing student' : 'New student'}</span></div>
    {reasons.length > 0 && <div className="import-review-reasons"><strong>Action needed</strong><ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
    <div className="import-student-facts"><span>Paid <b>{money(row.amount)} EGP</b></span><span>{row.paymentMethod === 'CASH' ? 'Cash' : row.paymentMethod === 'ONLINE' ? 'Online' : 'Unknown method'}</span><span>رقم الحافظة: {row.receiptNumber || '—'}</span><span>Mobile: {row.mobile || '—'}</span><span>Born: {row.dateOfBirth || '—'}</span><span>Nationality: {row.nationality || '—'}</span><span>Birthplace: {row.placeOfBirth || '—'}</span></div>
    {row.issues.map(issue => <p className="alert-error" key={issue}><AlertTriangle size={14} />{issue}{row.existing && <span> Existing record: {row.existing.name}</span>}</p>)}
    {row.amount > fee && form.courseFee !== '' && <p className="alert-error">The course fee is {money(fee)} EGP. A payment of {money(row.amount)} EGP cannot be imported.</p>}
    {row.sameName && <label className="policy-check"><input type="checkbox" checked={c.confirmSameName || false} onChange={e => choice(row.registrationNumber, 'confirmSameName', e.target.checked)} />A student with this name has another registration number. I verified these are separate students.</label>}
    {row.existing && !row.issues.length && <><label htmlFor={`profile-${index}`}>Existing student details<Required /></label>{row.differences.length > 0 && <div className="policy-note">{row.differences.map(d => <p key={d.field}>{{
                        englishName: 'English name',
                        mobile: 'Mobile',
                        dateOfBirth: 'Date of birth',
                        nationality: 'Nationality',
                        placeOfBirth: 'Place of birth'
                      }[d.field]}: existing “{d.existing}” → Excel “{d.incoming}”</p>)}</div>}<CustomFilterDropdown required id={`profile-${index}`} value={c.profile} onChange={value => choice(row.registrationNumber, 'profile', value)} allowClear={true} placeholder="Resolve student details" options={[{
                    value: 'keep',
                    label: 'Keep existing details'
                  }, {
                    value: 'fill',
                    label: 'Fill empty fields only'
                  }, {
                    value: 'replace',
                    label: 'Update provided details from Excel'
                  }]} /></>}
    {below && <div className="import-fee-choice"><label htmlFor={`fee-${index}`}>Payment is below the standard fee<Required /></label><CustomFilterDropdown required id={`fee-${index}`} value={c.feeMode} onChange={value => choice(row.registrationNumber, 'feeMode', value)} allowClear={true} placeholder="Choose partial payment or discount" options={[{
                    value: 'partial',
                    label: `Partial payment · ${money(fee - row.amount)} EGP still owed`
                  }, ...(manager ? [{
                    value: 'discount',
                    label: 'Discounted student · set applicable fee'
                  }] : []), ...(row.amount === 0 ? [{
                    value: 'exempt',
                    label: 'Exempt · no tuition owed'
                  }] : [])]} />{c.feeMode === 'discount' && <Field label="Applicable discounted fee (EGP)" id={`custom-${index}`}><input id={`custom-${index}`} className="input-field" required type="number" min={row.amount} max={fee} step="0.01" value={c.customFee} onChange={e => choice(row.registrationNumber, 'customFee', e.target.value)} /></Field>}</div>}
   </article>;
            })}</div>
   {rows.length > 25 && <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous students</button><span>Page {page + 1} of {Math.ceil(rows.length / 25)}</span><button type="button" className="btn-secondary" disabled={(page + 1) * 25 >= rows.length} onClick={() => setPage(page + 1)}>Next students</button></div>}
   {requiresReview && <div className="import-review-summary" role="status"><strong>{pendingRows.length} {pendingRows.length === 1 ? 'student needs' : 'students need'} a choice before importing</strong><p>{pendingRows[0].row.name} ({pendingRows[0].row.registrationNumber}): {pendingRows[0].reasons[0]}</p><button className="btn-secondary" type="button" onClick={() => jumpToStudent(pendingRows[0].index)}>Go to first unresolved student</button></div>}
   <div className="payment-entry-actions import-footer"><button className="btn-secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><span className="muted">{blocked ? 'Resolve source conflicts to continue.' : missingFields.length ? `Required: ${missingFields.join(', ')}.` : requiresReview ? `${pendingRows.length} student ${pendingRows.length === 1 ? 'choice' : 'choices'} still needed.` : 'Ready to create the cycle.'}</span><button className="btn-primary" disabled={busy || blocked || requiresReview || missingFields.length > 0}>{busy ? 'Importing…' : `Create cycle & enroll ${rows.length} students`}</button></div>
  </form>}
  </>}
 </div></Dialog>;
}
function Field({
  label,
  id,
  children,
  hint
}) {
  return <div className="student-form-group"><label htmlFor={id}>{label}{children?.props?.required && <Required />}</label>{children}{hint && <small className="muted">{hint}</small>}</div>;
}

function Required() { return <span className="required-marker" aria-label="required">*</span>; }
