import PrivateBadge from './PrivateBadge';
import { toast } from 'react-hot-toast';
import PaymentFields from './PaymentFields';
import { useState } from 'react';
import axios from 'axios';
import Dialog from './Dialog';
import StudentProfileFields from './StudentProfileFields';
import EnrollmentStudentPicker from './EnrollmentStudentPicker';

export default function EnrollmentDialog({ course, manager, onClose, onSaved }) {
  const [creating,setCreating]=useState(false),[newStudent,setNewStudent]=useState({name:'',registrationNumber:'',mobile:''});
  const [metadata,setMetadata] = useState({});
  const [studentId, setStudentId] = useState('');
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
    try { const { data } = await axios.post(`/cycles/${course.id}/enrollments`, { studentId:creating?undefined:studentId,newStudent:creating?newStudent:undefined, ...metadata, tuitionType,recordPayment:tuitionType!=='EXEMPT',exempt:tuitionType==='EXEMPT',amountPaid:effectiveFee,customFee:tuitionType==='FULL'?undefined:effectiveFee }); if (data.pending) toast.success(data.message); window.dispatchEvent(new Event('notifications-updated')); onSaved(); onClose(); }
    catch (e) { setError(e.response?.data?.error || e.response?.data?.message || 'Enrollment could not be saved.'); }
    finally { setBusy(false); }
  };
  return <Dialog title="Enroll student" onClose={busy ? () => {} : onClose}><div className="modal-content card enrollment-dialog">
    <h3>{manager ? 'Enroll a student' : 'Request student enrollment'}</h3>{!manager && <p className="policy-note">An admin or moderator must approve this enrollment. No payment is recorded until approval.</p>}<p className="muted">{course.name}<PrivateBadge record={course}/> · Tuition: {Number(course.courseFee || 0).toLocaleString()} EGP</p>
    <form onSubmit={submit} className="enrollment-policy-form">
      <div className="section-tabs"><button type="button" className={!creating?'active':''} onClick={()=>setCreating(false)}>Existing student</button><button type="button" className={creating?'active':''} onClick={()=>setCreating(true)}>Create new student</button></div>
      {creating?<div className="management-choice"><label>Full name *<input className="input-field" required value={newStudent.name} onChange={e=>setNewStudent({...newStudent,name:e.target.value})}/></label><label>Registration ID (optional)<input className="input-field" value={newStudent.registrationNumber} onChange={e=>setNewStudent({...newStudent,registrationNumber:e.target.value})}/></label><label>Mobile<input className="input-field" value={newStudent.mobile} onChange={e=>setNewStudent({...newStudent,mobile:e.target.value})}/></label><StudentProfileFields prefix="inline-student" value={newStudent} onChange={setNewStudent}/></div>:<EnrollmentStudentPicker courseId={course.id} onChange={setStudentId} disabled={busy} />}

      <fieldset className="management-choice" disabled={busy}><legend>Tuition status *</legend>{[['FULL','Full payment'],['DISCOUNTED','Discounted'],['EXEMPT','Exempt']].map(([value,label])=><label className="policy-check" key={value}><input type="radio" name="enrollment-tuition-type" value={value} checked={tuitionType===value} disabled={value!=='EXEMPT'&&Number(course.courseFee||0)===0} onChange={()=>{setTuitionType(value);setError('');}}/>{label}{value==='FULL'?` · ${Number(course.courseFee||0).toLocaleString()} EGP`:value==='EXEMPT'?' · No tuition payment':''}</label>)}</fieldset>
      {tuitionType==='DISCOUNTED'&&<><label htmlFor="enrollment-discounted-amount">Discounted amount paid (EGP) *</label><input id="enrollment-discounted-amount" className="input-field" type="number" min="0.01" max={Math.max(0,Number(course.courseFee||0)-0.01)} step="0.01" required value={discountedAmount} onChange={e=>setDiscountedAmount(e.target.value)}/><p className="policy-note">This is the student's full discounted tuition, not a partial payment. Nothing remains due.</p></>}
      {tuitionType==='EXEMPT'?<p className="policy-note">Tuition is waived. No money is recorded.</p>:<div className="payment-choice-panel"><p><strong>{Number(effectiveFee||0).toLocaleString()} EGP</strong> will be recorded as paid{!manager?' when approved':''}.</p><PaymentFields prefix="enrollment" value={metadata} onChange={setMetadata}/></div>}
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={busy || (!creating&&!studentId)}>{busy ? 'Submitting…' : manager ? 'Enroll student' : 'Submit for approval'}</button></div>
    </form>
  </div></Dialog>;
}
