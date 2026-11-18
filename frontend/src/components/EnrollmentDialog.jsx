import '../styles/_placements.scss';
import { cleanPhone } from '../utils/people';
import PrivateBadge from './PrivateBadge';
import { toast } from 'react-hot-toast';
import PaymentFields from './PaymentFields';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { canSeePayroll } from '../utils/access';
import { UserCheck, X, ClipboardCheck } from 'lucide-react';
import axios from 'axios';
import Dialog from './Dialog';
import StudentProfileFields from './StudentProfileFields';
import EnrollmentStudentPicker from './EnrollmentStudentPicker';

// Students who took a placement test and are not in a course yet; picking one enrolls (places) them.
function TestedStudentPicker({ courseId, selected, onSelect, disabled }) {
  const [rows, setRows] = useState(null), [q, setQ] = useState('');
  useEffect(() => {
    if (selected) return;
    const controller = new AbortController();
    axios.get('/placements/for-cycle/' + courseId, { signal: controller.signal }).then(({ data }) => setRows(data.rows)).catch(() => { if (!controller.signal.aborted) setRows([]); });
    return () => controller.abort();
  }, [courseId, selected]);
  if (selected) return <div className="enrollment-selected-student"><UserCheck size={22}/><div><strong dir="auto">{selected.name}</strong><small>{selected.registrationNumber || 'No registration ID'}{selected.mobile ? ` · ${selected.mobile}` : ''}{selected.level ? <> · <span className="tested-student-meta">Tested: {selected.level}{selected.score != null ? ` (${selected.score}/55)` : ''}{selected.purpose ? ` · ${selected.purpose}` : ''}</span></> : null}</small></div><button type="button" className="icon-button" disabled={disabled} aria-label="Change selected student" onClick={() => onSelect(null)}><X size={17}/></button></div>;
  const shown = (rows || []).filter(r => !q.trim() || [r.student.name, r.student.mobile, r.student.registrationNumber, r.level].some(v => String(v || '').toLowerCase().includes(q.trim().toLowerCase())));
  return <div className="enrollment-student-picker">
    <div className="search-field"><input aria-label="Search tested students" placeholder="Search name, phone or level…" value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="enrollment-student-results">{rows === null ? <p className="enrollment-picker-empty" role="status">Loading tested students…</p> : !shown.length ? <p className="enrollment-picker-empty">{rows.length ? 'No matching tested students.' : 'No tested students are waiting to be placed.'}</p> : shown.map(r => <button type="button" key={r.id} className="enrollment-student-result" disabled={disabled} onClick={() => onSelect({ ...r.student, level: r.level, score: r.score, purpose: r.purpose })}><span className="enrollment-student-avatar"><ClipboardCheck size={16}/></span><span><strong dir="auto">{r.student.name}</strong><small>{r.student.mobile || 'No phone'} · <span className="tested-student-meta">{r.level} · {r.score}/55{r.purpose ? ` · ${r.purpose}` : ''}</span> · {new Date(r.testedAt).toLocaleDateString('en-GB')}</small></span><span className="enrollment-pick-label">Select</span></button>)}</div>
  </div>;
}

export default function EnrollmentDialog({ course, onClose, onSaved, initialStudent = null }) {
  // Picking from tested students places them: admins and the main mod only.
  const placesTested = canSeePayroll(useContext(AuthContext).user);
  // "existing" student, a "new" one, or one of the "tested" students waiting to be placed.
  const [mode, setMode] = useState(initialStudent ? 'tested' : 'existing'), [tested, setTested] = useState(initialStudent);
  const creating = mode === 'new', setCreating = on => setMode(on ? 'new' : 'existing');
  const [newStudent,setNewStudent]=useState({name:'',registrationNumber:'',mobile:''});
  const [metadata,setMetadata] = useState({});
  const [pickedId, setStudentId] = useState('');
  const studentId = mode === 'tested' ? tested?.id || '' : pickedId;
  const [tuitionType,setTuitionType]=useState(Number(course.courseFee||0)>0?'FULL':'EXEMPT');
  const [discountedAmount,setDiscountedAmount]=useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const effectiveFee=tuitionType==='EXEMPT'?0:tuitionType==='DISCOUNTED'?Number(discountedAmount):Number(course.courseFee||0);
  const submit = async e => {
    e.preventDefault(); setError('');
    if (!studentId&&!creating) return setError('Choose a student.');
    if(creating&&!newStudent.name.trim())return setError('Enter the student name.');
    if(tuitionType==='DISCOUNTED'&&(!discountedAmount||!Number.isFinite(effectiveFee)||effectiveFee<=0||effectiveFee>=Number(course.courseFee)))return setError('Enter a discounted amount above zero and below the standard tuition. Choose Exempt for a free student.');
    setBusy(true);
    try { const { data } = await axios.post(`/cycles/${course.id}/enrollments`, { studentId:creating?undefined:studentId,newStudent:creating?newStudent:undefined, ...metadata, tuitionType,recordPayment:tuitionType!=='EXEMPT',exempt:tuitionType==='EXEMPT',amountPaid:effectiveFee,customFee:tuitionType==='FULL'?undefined:effectiveFee }); toast.success(`Enrolled ${data.student?.name || 'student'}`); window.dispatchEvent(new Event('notifications-updated')); onSaved(); onClose(); }
    catch (e) { setError(e.response?.data?.error || e.response?.data?.message || 'Enrollment could not be saved.'); }
    finally { setBusy(false); }
  };
  return <Dialog title="Enroll student" onClose={busy ? () => {} : onClose}><div className="modal-content card enrollment-dialog">
    <h3>Enroll a student</h3><p className="muted">{course.name}<PrivateBadge record={course}/> · Tuition: {Number(course.courseFee || 0).toLocaleString()} EGP</p>
    <form onSubmit={submit} className="enrollment-policy-form">
      <div className="section-tabs"><button type="button" className={mode==='existing'?'active':''} onClick={()=>setMode('existing')}>Existing student</button>{placesTested&&<button type="button" className={mode==='tested'?'active':''} onClick={()=>setMode('tested')}>Tested students</button>}<button type="button" className={creating?'active':''} onClick={()=>setCreating(true)}>Create new student</button></div>
      {creating?<div className="management-choice"><label>Full name *<input className="input-field" required value={newStudent.name} onChange={e=>setNewStudent({...newStudent,name:e.target.value})}/></label><label>Registration ID (optional)<input className="input-field" value={newStudent.registrationNumber} onChange={e=>setNewStudent({...newStudent,registrationNumber:e.target.value})}/></label><label>Mobile<input className="input-field" value={newStudent.mobile} inputMode="tel" onChange={e=>setNewStudent({...newStudent,mobile:cleanPhone(e.target.value)})}/></label><StudentProfileFields prefix="inline-student" value={newStudent} onChange={setNewStudent}/></div>:mode==='tested'?<TestedStudentPicker courseId={course.id} selected={tested} onSelect={setTested} disabled={busy} />:<EnrollmentStudentPicker courseId={course.id} onChange={setStudentId} disabled={busy} />}

      <fieldset className="management-choice" disabled={busy}><legend>Tuition status *</legend>{[['FULL','Full payment'],['DISCOUNTED','Discounted'],['EXEMPT','Exempt']].map(([value,label])=><label className="policy-check" key={value}><input type="radio" name="enrollment-tuition-type" value={value} checked={tuitionType===value} disabled={value!=='EXEMPT'&&Number(course.courseFee||0)===0} onChange={()=>{setTuitionType(value);setError('');}}/>{label}{value==='FULL'?` · ${Number(course.courseFee||0).toLocaleString()} EGP`:value==='EXEMPT'?' · No tuition payment':''}</label>)}</fieldset>
      {tuitionType==='DISCOUNTED'&&<><label htmlFor="enrollment-discounted-amount">Discounted amount paid (EGP) *</label><input id="enrollment-discounted-amount" className="input-field" type="number" min="0.01" max={Math.max(0,Number(course.courseFee||0)-0.01)} step="0.01" required value={discountedAmount} onChange={e=>setDiscountedAmount(e.target.value)}/><p className="policy-note">This is the student's full discounted tuition, not a partial payment. Nothing remains due.</p></>}
      {tuitionType==='EXEMPT'?<p className="policy-note">Tuition is waived. No money is recorded.</p>:<div className="payment-choice-panel"><p><strong>{Number(effectiveFee||0).toLocaleString()} EGP</strong> will be recorded as paid.</p><PaymentFields prefix="enrollment" value={metadata} onChange={setMetadata}/></div>}
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={busy || (!creating&&!studentId)}>{busy ? 'Submitting…' : 'Enroll student'}</button></div>
    </form>
  </div></Dialog>;
}
