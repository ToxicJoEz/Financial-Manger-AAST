import { Sparkles } from 'lucide-react';

// The "New" look's badge. A branch mod's cycle shows "New · awaiting approval" until the main mod approves or
// rejects it; a cycle the main mod just added shows "New" until they leave the page. Rejected ones say so.
export default function ApprovalBadge({ record, justAdded = false }) {
  if (record?.approvalStatus === 'PENDING') return <span className="new-badge is-pending" title="Created by a branch mod; waiting for the main mod's approval"><Sparkles size={12} aria-hidden="true" />New · awaiting approval</span>;
  if (record?.approvalStatus === 'REJECTED') return <span className="approval-badge is-rejected" title={record.rejectionReason ? 'Reason: ' + record.rejectionReason : 'Rejected by the main mod'}>Rejected</span>;
  if (justAdded) return <span className="new-badge" title="You just added this cycle"><Sparkles size={12} aria-hidden="true" />New</span>;
  return null;
}
// Whether a cycle wears the "New" look: waiting for approval, or just added on this page.
export const isNewCycle = (record, justAdded) => record?.approvalStatus === 'PENDING' || Boolean(justAdded);
