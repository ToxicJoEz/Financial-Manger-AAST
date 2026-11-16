// Cycles a branch mod created show "Awaiting approval" until the main mod approves them; rejected ones say so.
export default function ApprovalBadge({ record }) {
  if (record?.approvalStatus === 'PENDING') return <span className="approval-badge is-pending" title="Created by a branch mod; waiting for the main mod's approval">Awaiting approval</span>;
  if (record?.approvalStatus === 'REJECTED') return <span className="approval-badge is-rejected" title={record.rejectionReason ? 'Reason: ' + record.rejectionReason : 'Rejected by the main mod'}>Rejected</span>;
  return null;
}
