import { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle } from 'lucide-react';
import Dialog from './Dialog';

const countLabels = {
  enrollments: 'enrollments', payments: 'payments', bookPayments: 'book records', payroll: 'payroll items',
  instructorAssignments: 'employee assignments', requests: 'requests', imports: 'imports',
  assignments: 'cycle assignments', unpaidEarnings: 'unpaid earnings', paidOrProcessingEarnings: 'paid/processing earnings'
};
const summary = counts => Object.entries(counts || {}).filter(([key, value]) => value > 0 && key !== 'cycles' && countLabels[key]).map(([key, value]) => `${value} ${countLabels[key]}`).join(' · ') || 'No related records';

// Lists each selected record with its own choice: archive (finances kept) or permanent deletion.
// Records the server marks as blocked (paid or processing payroll) can only be archived.
export default function BulkDeleteDialog({ kind, ids, previewUrl, deleteUrl, listKey, onClose, onDone }) {
  const [rows, setRows] = useState(null), [modes, setModes] = useState({}), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    axios.get(previewUrl, { params: { ids: ids.join(',') } }).then(({ data }) => {
      if (!active) return;
      setRows(data[listKey]);
      setModes(Object.fromEntries(data[listKey].map(row => [row.id, 'ARCHIVE'])));
    }).catch(e => { if (active) setError(e.response?.data?.error || e.response?.data?.message || 'Could not load deletion details.'); });
    return () => { active = false; };
  }, [previewUrl, ids, listKey]);
  const setAll = mode => setModes(Object.fromEntries(rows.map(row => [row.id, mode === 'DELETE' && row.permanentBlocked ? 'ARCHIVE' : mode])));
  const deleting = rows ? rows.filter(row => modes[row.id] === 'DELETE').length : 0;
  async function submit() {
    setBusy(true); setError('');
    try {
      const { data } = await axios.post(deleteUrl, { confirm: true, items: rows.map(row => ({ id: row.id, version: row.version, mode: modes[row.id] })) });
      onDone(data.message);
    } catch (e) {
      setError(e.response?.data?.error || e.response?.data?.message || 'Nothing was changed. Review the selection and try again.');
    } finally { setBusy(false); }
  }
  return <Dialog title={`Delete selected ${kind}s`} onClose={busy ? () => {} : onClose}>
    <div className="modal-content card bulk-delete-dialog">
      <h3><AlertTriangle size={20} /> Delete {ids.length} selected {kind}{ids.length === 1 ? '' : 's'}?</h3>
      <p className="muted">Choose what happens to each {kind}. <strong>Archive</strong> hides it and keeps every financial record. <strong>Delete permanently</strong> removes it with its tuition, book and payroll records and cannot be undone.</p>
      {error && <p className="alert-error" role="alert">{error}</p>}
      {!rows ? !error && <div className="loading-state" role="status"><span className="loading-spinner" />Checking related records…</div> : <>
        <div className="bulk-delete-setall"><span>Set all:</span><button type="button" className="btn-secondary" disabled={busy} onClick={() => setAll('ARCHIVE')}>Archive</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => setAll('DELETE')}>Delete permanently</button></div>
        <ul className="bulk-delete-list">{rows.map(row => <li key={row.id}>
          <div><strong dir="auto">{row.name}</strong><small>{summary(row.counts)}{row.archivedAt ? ' · already archived' : ''}</small>{row.permanentBlocked && <small className="bulk-delete-blocked">Has paid or processing payroll. It can only be archived.</small>}</div>
          <fieldset aria-label={`What to do with ${row.name}`}>
            <label><input type="radio" name={`bulk-${row.id}`} checked={modes[row.id] === 'ARCHIVE'} disabled={busy} onChange={() => setModes(m => ({ ...m, [row.id]: 'ARCHIVE' }))} />Archive</label>
            <label><input type="radio" name={`bulk-${row.id}`} checked={modes[row.id] === 'DELETE'} disabled={busy || row.permanentBlocked} onChange={() => setModes(m => ({ ...m, [row.id]: 'DELETE' }))} />Delete permanently</label>
          </fieldset>
        </li>)}</ul>
        <p className="policy-note">{rows.length - deleting} will be archived · {deleting} will be permanently deleted.</p>
        <label className="policy-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />I understand{deleting ? ' that permanent deletion cannot be undone' : ''} and confirm these changes.</label>
      </>}
      <div className="bulk-delete-actions">
        <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="btn-danger" disabled={busy || !rows || !confirmed} onClick={submit}>{busy ? 'Saving…' : deleting ? `Archive ${rows.length - deleting}, delete ${deleting}` : `Archive ${rows?.length || ids.length}`}</button>
      </div>
    </div>
  </Dialog>;
}
