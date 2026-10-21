import { toast } from 'react-hot-toast';
import PaymentFields from './PaymentFields';
import { useState } from 'react';
import axios from 'axios';
import Dialog from './Dialog';
import EnrollmentStudentPicker from './EnrollmentStudentPicker';

export default function EnrollmentDialog({ course, manager, onClose, onSaved }) {
  const [metadata,setMetadata] = useState({});
  const [studentId, setStudentId] = useState(''), [paid, setPaid] = useState(false), [exempt, setExempt] = useState(false);
  const [amount, setAmount] = useState(String(course.courseFee || 0)), [fee, setFee] = useState(String(course.courseFee || 0));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const effectiveFee = exempt ? 0 : manager && fee !== '' ? Number(fee) : Number(course.courseFee || 0);
  const submit = async e => {
    e.preventDefault(); setError('');
    if (!studentId) return setError('Choose a student.');
    if (paid && !exempt && Number(amount) > effectiveFee) return setError(`The tuition fee is ${effectiveFee.toLocaleString()} EGP. You cannot record ${Number(amount).toLocaleString()} EGP paid.`);
    setBusy(true);
    try { const { data } = await axios.post(`/cycles/${course.id}/enrollments`, { studentId, ...metadata, recordPayment: paid && !exempt, exempt: paid && exempt, amountPaid: paid && !exempt ? amount : undefined, customFee: manager && fee !== '' && Number(fee) !== Number(course.courseFee || 0) && !exempt ? fee : undefined }); if (data.pending) toast.success(data.message); window.dispatchEvent(new Event('notifications-updated')); onSaved(); onClose(); }
    catch (e) { setError(e.response?.data?.error || e.response?.data?.message || 'Enrollment could not be saved.'); }
    finally { setBusy(false); }
  };
  return <Dialog title="Enroll student" onClose={busy ? () => {} : onClose}><div className="modal-content card enrollment-dialog">
    <h3>{manager ? 'Enroll a student' : 'Request student enrollment'}</h3>{!manager && <p className="policy-note">An admin or moderator must approve this enrollment. No payment is recorded until approval.</p>}<p className="muted">{course.name} · Tuition: {Number(course.courseFee || 0).toLocaleString()} EGP</p>
    <form onSubmit={submit} className="enrollment-policy-form">
      <EnrollmentStudentPicker courseId={course.id} onChange={setStudentId} disabled={busy} />
      {manager && <><label htmlFor="enrollment-custom-fee">Tuition fee (EGP)</label><input id="enrollment-custom-fee" className="input-field" type="number" min="0" max={course.courseFee || 0} step="0.01" placeholder="Standard tuition fee" value={fee} onChange={e => { setFee(e.target.value); if (paid) setAmount(e.target.value === '' ? String(course.courseFee || 0) : e.target.value); }} /><small className="policy-note">Prefilled with the standard tuition. You can lower it for a discounted student.</small></>}
      <label className="policy-check"><input type="checkbox" checked={paid} onChange={e => { setPaid(e.target.checked); setExempt(false); setAmount(String(effectiveFee)); }} />Record payment or exemption now</label>
      {!paid && <p className="policy-note">The student will be enrolled as unpaid. No payment will be recorded.</p>}
      {paid && <div className="payment-choice-panel"><label className="policy-check"><input type="checkbox" checked={exempt} onChange={e => setExempt(e.target.checked)} />Exempt — this student does not need to pay</label>
        {exempt ? <p className="policy-note">Tuition is waived for this student. Amount due: 0 EGP. No cash payment is recorded.</p> : <><label htmlFor="enrollment-paid">Amount received (EGP)</label><input id="enrollment-paid" className="input-field" type="number" min="0" max={effectiveFee} step="0.01" required value={amount} onChange={e => { setAmount(e.target.value); setError(Number(e.target.value) > effectiveFee ? `The tuition fee is ${effectiveFee.toLocaleString()} EGP. You cannot record ${Number(e.target.value).toLocaleString()} EGP paid.` : ''); }} /><PaymentFields prefix="enrollment" value={metadata} onChange={setMetadata}/><small>Leave the full fee, enter a partial payment, or choose exemption above.</small></>}
      </div>}
      {error && <div className="alert-error" role="alert">{error}</div>}
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={busy || !studentId}>{busy ? 'Submitting…' : manager ? 'Enroll student' : 'Submit for approval'}</button></div>
    </form>
  </div></Dialog>;
}
