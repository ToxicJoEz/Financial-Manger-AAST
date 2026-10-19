export default function FinancialRemovalChoice({ keep, onKeep, confirmed, onConfirm }) {
  return <div className="financial-removal-choice">
    <fieldset><legend>What happens to the financial records?</legend>
      <label className="policy-check"><input type="radio" name="financial-removal" checked={keep} onChange={() => onKeep(true)} />Keep financial records in course totals</label>
      <p>Recorded amounts stay included in collected and outstanding totals. Managers retain the historical record.</p>
      <label className="policy-check"><input type="radio" name="financial-removal" checked={!keep} onChange={() => onKeep(false)} />Archive financial records too</label>
      <p>Exclude these enrollments from current course totals. The original records and payment history stay stored for managers.</p>
    </fieldset>
    <p className="policy-note">Neither option refunds money. Any actual refund must be recorded separately.</p>
    <label className="policy-check"><input type="checkbox" checked={confirmed} onChange={e => onConfirm(e.target.checked)} />I understand and confirm this removal.</label>
  </div>;
}
