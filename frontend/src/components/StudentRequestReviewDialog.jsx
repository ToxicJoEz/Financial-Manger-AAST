import PrivateBadge from './PrivateBadge';
import { useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ClipboardCheck, GraduationCap, Plus, Trash2, CheckCircle, X } from 'lucide-react';
import Dialog from './Dialog';
import { initials, money } from './WorkspaceUI';
import '../styles/_assignmentReview.scss';

export default function StudentRequestReviewDialog({ request, onClose }) {
  const [saving, setSaving] = useState(false), busy = useRef(false);
  const removal = ['DELETE_STUDENT', 'REMOVE_ENROLLMENT'].includes(request.action);
  const enrollment = ['CREATE_AND_ENROLL','ENROLL_STUDENT', 'REMOVE_ENROLLMENT'].includes(request.action);
  const payload = request.payload, snapshot = request.snapshot;
  const student = snapshot.student || payload.newStudent || payload;
  const requester = request.submittedBy;
  const requesterName = [requester?.firstName, requester?.lastName].filter(Boolean).join(' ');
  const decide = async decision => {
    if (busy.current) return;
    busy.current = true; setSaving(true);
    try {
      const { data } = await axios.post(`/student-requests/${request.id}/${decision}`);
      toast.success(data.message);
      for (const name of ['notifications-updated', 'students-updated', 'assignments-updated']) window.dispatchEvent(new Event(name));
      onClose();
    } catch (error) { toast.error(error.response?.data?.error || 'Could not process student request.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Dialog title="Review student request" onClose={saving ? () => {} : onClose}><div className={`modal-content card approval-dialog ${removal ? 'approval-removal' : 'approval-assignment'}`}>
    <header className="approval-heading"><span className="approval-heading-icon"><ClipboardCheck size={23} /></span><div><span className="approval-eyebrow">STUDENTS · APPROVAL</span><h2>{removal ? 'Review student removal' : 'Review student addition'}</h2></div></header>
    <div className="approval-requester"><span className="approval-avatar">{initials(requesterName || requester?.username || '?')}</span><div><span className="approval-label">Requested by</span><strong className="approval-username">@{requester?.username || 'Unknown'}</strong>{requesterName && <span className="approval-fullname">{requesterName}</span>}</div><span className="approval-pending">Pending review</span></div>
    <div className="approval-change"><div className="approval-cycle"><GraduationCap size={19} /><div><span className="approval-label">{enrollment ? 'Cycle' : 'Student directory'}</span><strong>{enrollment ? snapshot.course?.name : 'Student profile'}{enrollment&&<PrivateBadge record={snapshot.course}/>}</strong></div></div><div className="approval-proposal"><span className="approval-action-label">{removal ? <Trash2 size={15} /> : <Plus size={15} />}{removal ? enrollment ? 'Remove enrollment' : 'Delete student profile' : enrollment ? 'Enroll student' : 'Create student profile'}</span><strong dir="auto">{student.name}</strong><p>Registration: {student.registrationNumber}</p>
      <dl className="student-request-details">{[['English name',student.englishName], ['Mobile',student.mobile], ['Date of birth',student.dateOfBirth?.slice(0,10)], ['Nationality',student.nationality], ['Place of birth',student.placeOfBirth]].filter(([,value]) => value).map(([label,value]) => <div key={label}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}</dl>
      {request.action === 'ENROLL_STUDENT' && <div className="student-request-consequence"><b>{payload.exempt ? 'Exempt · no payment' : `${money(payload.amountPaid || 0)} EGP recorded on approval`}</b>{payload.recordPayment && <p>Payment: {payload.paymentMethod} · رقم الحافظة: {payload.receiptNumber || 'Not provided'}</p>}<p>No enrollment or payment is recorded until you approve.</p></div>}
      {removal && <div className="student-request-consequence"><b>{payload.keepFinancialRecords ? 'Keep financial records in totals' : 'Archive financial records from totals'}</b><p>{enrollment ? 'Only this cycle enrollment is removed.' : 'The student is soft-deleted; admins and moderators retain access.'} No refund will be issued.</p></div>}
    </div></div>
    <footer className="approval-actions"><button className="approval-reject" disabled={saving} onClick={() => decide('reject')}><X size={16} />Reject request</button><div><button className="btn-secondary" disabled={saving} onClick={onClose}>Cancel</button><button className="btn-primary approval-approve" disabled={saving} onClick={() => decide('approve')}><CheckCircle size={16} />{saving ? 'Saving…' : removal ? 'Approve removal' : 'Approve addition'}</button></div></footer>
  </div></Dialog>;
}
