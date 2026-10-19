import { useEffect, useState } from 'react';
import axios from 'axios';
import Dialog from './Dialog';
import CustomFilterDropdown from './CustomFilterDropdown';
const format = value => Number(value).toLocaleString('en-EG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
export default function PaymentHistory({
  course,
  enrollment,
  manager,
  onClose,
  onChanged
}) {
  const [entries, setEntries] = useState([]),
    [balance, setBalance] = useState(enrollment.amountPaid || 0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [kind, setKind] = useState('PAYMENT'),
    [amount, setAmount] = useState(''),
    [note, setNote] = useState('');
  const [reverse, setReverse] = useState(null),
    [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [nextCursor, setNextCursor] = useState(null);
  const writable = manager && !enrollment.deletedAt && !enrollment.financialArchivedAt;
  const endpoint = `/courses/${course.id}/enrollments/${enrollment.id}/payments`;
  const load = async (more = false) => {
    setLoading(true);
    try {
      const {
        data
      } = await axios.get(endpoint, {
        params: more && nextCursor ? {
          cursor: nextCursor
        } : {}
      });
      setEntries(previous => more ? [...previous, ...data.entries] : data.entries);
      setBalance(data.amountPaid);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || 'Payment history could not be loaded.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [endpoint]);
  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (reverse) await axios.post(`${endpoint}/${reverse.id}/reverse`, {
        note
      });else await axios.post(endpoint, {
        kind,
        amount,
        note,
        idempotencyKey: requestKey
      });
      setAmount('');
      setNote('');
      setReverse(null);
      setRequestKey(crypto.randomUUID());
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || 'The entry could not be saved. Your request can be retried safely.');
    } finally {
      setBusy(false);
    }
  };
  return <Dialog title="Tuition payment history" onClose={busy ? () => {} : onClose}>

    <div className="modal-content card payment-history">

      <div className="payment-history-heading"><div><h3>{enrollment.student.name}</h3><p>{course.name} · {enrollment.student.registrationNumber}</p></div><strong>{format(balance)} <small>EGP collected</small></strong></div>

      {(enrollment.deletedAt || enrollment.financialArchivedAt) && <p className="deleted-tag">Archived enrollment · payment history retained</p>}

      {enrollment.student.deletedAt && <p className="deleted-tag">Deleted student · financial history retained</p>}

      {error && <div className="alert-error" role="alert">{error}<button type="button" onClick={() => load()} disabled={busy}>Reload history</button></div>}

      {loading ? <div className="loading-state">Loading payment history…</div> : <div className="payment-history-list">

        {!entries.length && <p className="muted">No payments recorded yet.</p>}

        {entries.map(entry => <article key={entry.id} className="payment-history-entry"><div><strong>{entry.kind.replaceAll('_', ' ').toLowerCase()}</strong><p>{entry.note}</p><small>{new Date(entry.occurredAt).toLocaleString('en-GB')} · {entry.recordedBy}</small>{entry.reversal && <span className="deleted-tag">Reversed</span>}</div><div><b>{format(entry.amount)} EGP</b>{writable && !entry.reversal && entry.kind !== 'REVERSAL' && <button type="button" className="text-button" disabled={busy} onClick={() => {
              setReverse(entry);
              setNote('');
            }}>Reverse entry</button>}</div></article>)}

      </div>}

      {nextCursor && <button type="button" className="btn-secondary" disabled={busy || loading} onClick={() => load(true)}>Load older entries</button>}

      {writable && <form className="payment-entry-form" onSubmit={submit}>

        <h4>{reverse ? `Reverse ${format(reverse.amount)} EGP entry` : 'Record a payment or correction'}</h4>

        {reverse ? <p className="muted">The original entry stays in the history. A matching opposite entry will be added.</p> : <>

          <label htmlFor="payment-kind">Entry type</label><CustomFilterDropdown id="payment-kind" value={kind} onChange={value => {
            setKind(value);
            setRequestKey(crypto.randomUUID());
          }} allowClear={false} placeholder="Entry type" options={[{
            value: 'PAYMENT',
            label: 'Payment received'
          }, {
            value: 'REFUND',
            label: 'Refund paid out'
          }, {
            value: 'ADJUSTMENT',
            label: 'Balance correction (+ or −)'
          }]} />

          <p className="policy-note">Tuition fee: {format(enrollment.effectiveFee ?? enrollment.customFee ?? course.courseFee)} EGP · Remaining: {format(Math.max(0, (enrollment.effectiveFee ?? enrollment.customFee ?? course.courseFee) - balance))} EGP</p><label htmlFor="payment-amount">Amount (EGP)</label><input id="payment-amount" className="input-field" type="number" step="0.01" min={kind === 'ADJUSTMENT' ? undefined : '0.01'} max={kind === 'PAYMENT' ? Math.max(0, (enrollment.effectiveFee ?? enrollment.customFee ?? course.courseFee) - balance) : undefined} required value={amount} onChange={e => {
            setAmount(e.target.value);
            setRequestKey(crypto.randomUUID());
          }} />

        </>}

        <label htmlFor="payment-note">{reverse ? 'Reason for reversal' : 'Receipt reference or reason'}</label><input id="payment-note" className="input-field" required maxLength={1000} value={note} onChange={e => {
          setNote(e.target.value);
          setRequestKey(crypto.randomUUID());
        }} />

        <div className="payment-entry-actions">{reverse && <button type="button" className="btn-secondary" disabled={busy} onClick={() => {
            setReverse(null);
            setNote('');
          }}>Cancel reversal</button>}<button type="submit" className="btn-primary" disabled={busy || loading}>{busy ? 'Saving…' : reverse ? 'Confirm reversal' : 'Save entry'}</button></div>

      </form>}

      <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Close</button>

    </div>

  </Dialog>;
}
