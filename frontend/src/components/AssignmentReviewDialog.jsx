import PrivateBadge from './PrivateBadge';
import { useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { ClipboardCheck, BookOpen, Trash2, RotateCcw, Plus, X, CheckCircle } from 'lucide-react';
import Dialog from './Dialog';
import { initials } from './WorkspaceUI';
import { getBranchColor } from '../utils/branchColors';
import '../styles/_assignmentReview.scss';

export default function AssignmentReviewDialog({ request: reviewingAssignment, onClose }) {
  const [reviewRate, setReviewRate] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const targetCourse = reviewingAssignment.course;
  const newInst = reviewingAssignment.instructor;
  const isRemoval = reviewingAssignment.type === 'REMOVE';
  const isReplacement = reviewingAssignment.type === 'REPLACE';
  const requester = reviewingAssignment.submittedBy;
  const requesterName = [requester?.firstName, requester?.lastName].filter(Boolean).join(' ');
  const decide = async action => {
    if (busy.current) return;
    if (action === 'approve' && !isRemoval && (!reviewRate.trim() || !Number.isFinite(Number(reviewRate)) || Number(reviewRate) < 0)) {
      toast.error('Please enter a valid non-negative hourly rate'); return;
    }
    busy.current = true; setSaving(true);
    try {
      const { data } = await axios.post(`/assignments/${reviewingAssignment.id}/${action}`, action === 'approve' && !isRemoval ? { hourlyRate: reviewRate } : {});
      toast.success(data.message || 'Request updated');
      window.dispatchEvent(new Event('notifications-updated'));
      window.dispatchEvent(new Event('assignments-updated'));
      onClose();
    } catch (error) { toast.error(error.response?.data?.error || 'Could not update request.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const handleApproveAssignment = () => decide('approve');
  const handleRejectAssignment = () => decide('reject');
        return <Dialog title={isRemoval ? "Review removal request" : isReplacement ? "Review replacement request" : "Review assignment"} onClose={onClose}>
          <div className={`modal-content card approval-dialog ${isRemoval ? 'approval-removal' : isReplacement ? 'approval-replacement' : 'approval-assignment'}`}>
            <header className="approval-heading"><span className="approval-heading-icon"><ClipboardCheck size={23} /></span><div><span className="approval-eyebrow">TEACHING TEAM · APPROVAL</span><h2>{isRemoval ? 'Review removal' : isReplacement ? 'Review replacement' : 'Review assignment'}</h2></div></header>
            <div className="approval-requester"><span className="approval-avatar" aria-hidden="true">{initials(requesterName || requester?.username || '?')}</span><div><span className="approval-label">Requested by</span><strong className="approval-username">{requester?.username ? '@' + requester.username : 'Unknown user'}</strong>{requesterName && <span className="approval-fullname">{requesterName}</span>}</div><span className="approval-pending">Pending review</span></div>
            <div className="approval-change"><div className="approval-cycle"><BookOpen size={18} /><div><span className="approval-label">Cycle</span><strong>{targetCourse?.name || reviewingAssignment.course?.name || 'Cycle'}<PrivateBadge record={targetCourse||reviewingAssignment.course}/></strong></div>{targetCourse?.branch && <span className="approval-branch" style={{ '--branch-color': getBranchColor(targetCourse.branch) }}>{targetCourse.branch}</span>}</div><div className="approval-proposal"><span className="approval-action-label">{isRemoval ? <Trash2 size={15} aria-hidden="true" /> : isReplacement ? <RotateCcw size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}{isRemoval ? "Employee to remove" : isReplacement ? 'Proposed replacement' : "Employee to assign"}</span><strong dir="auto">{newInst?.name || "Employee"}</strong><p>{isRemoval ? "Approval removes this employee from the cycle." : isReplacement ? "Approval replaces the original employee assignment with this employee." : "Approval adds this employee to the cycle’s teaching team."}</p></div></div>
            {!isRemoval && <div className="approval-rate"><label htmlFor="approval-hourly-rate">Hourly rate <span aria-hidden="true">*</span></label><div><input id="approval-hourly-rate" type="number" min="0" step="0.01" className="input-field" value={reviewRate} onChange={e => setReviewRate(e.target.value)} placeholder="e.g. 150" required aria-describedby="approval-rate-help" /><span>EGP / hour</span></div><p id="approval-rate-help">Applies to this assignment only. Visible to admins and moderators.</p></div>}
            <footer className="approval-actions"><button type="button" disabled={saving} onClick={handleRejectAssignment} className="approval-reject"><X size={16} />Reject request</button><div><button type="button" onClick={() => { onClose();  }} className="btn-secondary">Cancel</button><button type="button" disabled={saving} onClick={handleApproveAssignment} className="btn-primary approval-approve"><CheckCircle size={16} />{isRemoval ? 'Approve removal' : 'Approve assignment'}</button></div></footer>
          </div>
        </Dialog>;

}
