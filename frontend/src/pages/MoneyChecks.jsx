import { useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { AnimatePresence } from 'framer-motion';
import { ClipboardCheck, Search, CircleCheck, AlertTriangle, Clock3 } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { Metric, EmptyState, money } from '../components/WorkspaceUI';
import DateInput from '../components/DateInput';
import Dialog from '../components/Dialog';
import AnimatedNumber from '../components/AnimatedNumber';
import { CalmRegion } from '../components/WorkspaceMotion';
import CycleDetailsDialog from '../components/CycleDetailsDialog';
import { CHECKED_BRANCHES, canCheckBranchMoney, branchName } from '../utils/access';
import { useSearchParams } from 'react-router-dom';
import { getBranchColor } from '../utils/branchColors';
import { dateText } from '../utils/dates';
import '../styles/_instructorPayroll.scss';
import '../styles/_moneyChecks.scss';

const STATES = [
  ['UNCHECKED', 'Unchecked'],
  ['CHANGED', 'Changed after check'],
  ['CHECKED', 'Checked'],
  ['', 'All']
];
const stateLabels = { UNCHECKED: 'Unchecked', CHECKED: 'Checked', CHANGED: 'Changed after check' };
const typeLabels = { PAYMENT: 'Tuition payment', REFUND: 'Refund', ADJUSTMENT: 'Correction', REVERSAL: 'Reversal', BOOK: 'Books', BOOK_UNDONE: 'Books (undone)' };
const methodLabels = { CASH: 'Cash', ONLINE: 'Online', CARD: 'Card', UNSPECIFIED: '' };
const keyOf = item => `${item.kind}:${item.id}`;

// Money recorded in each branch, confirmed record by record by an admin or the main mod.
export default function MoneyChecks() {
  const { user } = useContext(AuthContext);
  const canMark = canCheckBranchMoney(user);
  const [params, setParams] = useSearchParams();
  const branch = CHECKED_BRANCHES.includes(params.get('branch')) ? params.get('branch') : CHECKED_BRANCHES[0];
  const branchLabel = branchName(branch);
  // Records waiting in every branch, for the branch tabs.
  const [waiting, setWaiting] = useState({});
  const loadWaiting = () => axios.get('/attention').then(({ data }) => setWaiting(Object.fromEntries((data.moneyChecks?.byBranch || []).map(b => [b.branch, b.unchecked.count + b.changed.count])))).catch(() => {});
  useEffect(() => { loadWaiting(); }, []);
  const [status, setStatus] = useState('UNCHECKED'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [search, setSearch] = useState('');
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [selected, setSelected] = useState([]),
    [dialog, setDialog] = useState(null),
    [note, setNote] = useState(''),
    [saving, setSaving] = useState(false);
  const [viewCycle, setViewCycle] = useState(null);
  const request = useRef(0);
  // Identifies the list on screen, so it changes (with a transition) only when new records arrive.
  const [shownKey, setShownKey] = useState('');
  async function load() {
    const id = ++request.current;
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get('/finances/checks', { params: { branch, status: status || undefined, from: from || undefined, to: to || undefined } });
      if (id === request.current) { setData(data); setShownKey(`${branch}:${status}:${from}:${to}`); }
    } catch (e) {
      if (id === request.current) setError(e.response?.data?.error || 'Money checks could not be loaded.');
    } finally {
      if (id === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    load();
    setSelected([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, from, to, branch]);
  const items = (data?.items || []).filter(item => !search.trim() || `${item.student} ${item.cycle} ${item.receiptNumber || ''} ${item.recordedBy}`.toLowerCase().includes(search.trim().toLowerCase()));
  const groups = Object.values(items.reduce((map, item) => {
    const group = (map[item.cycleId || item.cycle] ||= { id: item.cycleId || item.cycle, name: item.cycle, items: [] });
    group.items.push(item);
    return map;
  }, {}));
  const toggle = keys => setSelected(current => (keys.every(k => current.includes(k)) ? current.filter(k => !keys.includes(k)) : [...new Set([...current, ...keys])]));
  const chosen = items.filter(item => selected.includes(keyOf(item)));
  async function save() {
    setSaving(true);
    try {
      const body = { branch, items: dialog.items.map(i => ({ kind: i.kind, id: i.id })), note };
      const { data: result } = await axios.post(dialog.mode === 'check' ? '/finances/checks' : '/finances/checks/uncheck', body);
      toast.success(result.message);
      setDialog(null);
      setSelected([]);
      setNote('');
      await load();
      loadWaiting();
      window.dispatchEvent(new Event('assignments-updated'));
    } catch (e) {
      toast.error(e.response?.data?.error || 'The records could not be updated.');
    } finally {
      setSaving(false);
    }
  }
  const summary = data?.summary;
  return <div className={`money-checks${loading && data ? ' is-refreshing' : ''}`}>
    <div className="money-checks-intro">
      <div><h2><ClipboardCheck size={20} />Branch money checks</h2><p>Every tuition payment, refund, correction and book payment on a branch's cycles stays unchecked until it is confirmed against the paperwork. Pick a branch, select records and mark them checked.</p></div>
    </div>
    <div className="money-check-branches" role="tablist" aria-label="Branch">{CHECKED_BRANCHES.map(b => <button key={b} type="button" role="tab" aria-selected={b === branch} className={b === branch ? 'active' : ''} style={{ '--branch-color': getBranchColor(b) }} onClick={() => { setParams({ branch: b }); setSelected([]); }}><i aria-hidden="true" />{branchName(b)}{waiting[b] > 0 && <span>{waiting[b]}</span>}</button>)}</div>
    {summary && <div className="metric-grid money-check-metrics">
      <Metric tone="peach" icon={Clock3} label="Unchecked" value={<><small>EGP</small><AnimatedNumber value={summary.unchecked.amount} /></>} detail={`${summary.unchecked.count} records waiting`} />
      <Metric tone="blue" icon={AlertTriangle} label="Changed after check" value={<AnimatedNumber value={summary.changed.count} />} detail="Checked records that later changed" />
      <Metric tone="teal" icon={CircleCheck} label="Checked" value={<><small>EGP</small><AnimatedNumber value={summary.checked.amount} /></>} detail={`${summary.checked.count} records confirmed`} />
    </div>}
    <div className="panel payroll-controls money-check-controls">
      <div className="payroll-status-tabs">{STATES.map(([value, label]) => <button key={value} type="button" className={status === value ? 'active' : ''} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}</div>
      <div className="filter-toolbar">
        <div className="search-field"><Search size={16} /><input aria-label="Search money records" placeholder="Find a student, cycle or receipt…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <label className="money-check-date">From<DateInput value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label>
        <label className="money-check-date">To<DateInput value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
        {(from || to) && <button type="button" className="text-button" onClick={() => { setFrom(''); setTo(''); }}>Clear dates</button>}
      </div>
    </div>
    <CalmRegion transitionKey={shownKey} className="money-check-groups">{loading && !data ? <div className="loading-state"><span className="loading-spinner" />Loading {branchLabel} money…</div> : error ? <div className="panel empty-state"><h3>{error}</h3><button className="btn-secondary" onClick={load}>Try again</button></div> : !groups.length ? <div className="panel"><EmptyState icon={CircleCheck} title={status === 'UNCHECKED' ? 'Nothing waiting to be checked' : 'No matching records'} description={status === 'UNCHECKED' ? `All recorded ${branchLabel} money has been checked.` : 'Try another filter or date range.'} /></div> : groups.map(group => {
      const keys = group.items.map(keyOf);
      const total = group.items.reduce((sum, i) => sum + i.amount, 0);
      return <article className="panel money-check-group" key={group.id}>
        <header><div className="money-check-group-title"><label className="policy-check">{canMark && <input type="checkbox" aria-label={`Select all records in ${group.name}`} checked={keys.every(k => selected.includes(k))} onChange={() => toggle(keys)} />}</label>{group.id && group.id !== group.name ? <button type="button" className="money-check-cycle-link" title="Open cycle details" onClick={() => setViewCycle(group.id)}>{group.name}</button> : <strong>{group.name}</strong>}</div><span>{group.items.length} records · {money(total)} EGP</span></header>
        <div className="table-scroll"><table className="data-table money-check-table"><thead><tr>{canMark && <th className="select-column" aria-label="Select" />}<th>Date</th><th>Student</th><th>Type</th><th>Method / receipt</th><th className="number">Amount</th><th>Recorded by</th><th>Status</th></tr></thead><tbody>
          {group.items.map(item => <tr key={keyOf(item)} className={`state-${item.state.toLowerCase()}`}>
            {canMark && <td className="select-column"><input type="checkbox" aria-label={`Select ${item.student} ${typeLabels[item.type] || item.type}`} checked={selected.includes(keyOf(item))} onChange={() => toggle([keyOf(item)])} /></td>}
            <td>{item.dateKnown ? dateText(item.date) : <span className="muted">Not recorded</span>}</td>
            <td dir="auto">{item.student}</td>
            <td>{typeLabels[item.type] || item.type}{item.description && item.kind === 'PAYMENT' && <small className="money-check-note" title={item.description}>{item.description}</small>}</td>
            <td>{[methodLabels[item.method], item.receiptNumber && `رقم الحافظة ${item.receiptNumber}`].filter(Boolean).join(' · ') || <span className="muted">—</span>}</td>
            <td className={`number currency${item.amount < 0 ? ' is-negative' : ''}`}>{money(item.amount)} EGP</td>
            <td>@{item.recordedBy}</td>
            <td><span className={`money-check-state is-${item.state.toLowerCase()}`}>{stateLabels[item.state]}</span>{item.check && <small className="money-check-by">by @{item.check.checkedBy} · {dateText(item.check.checkedAt)}{item.check.note ? ` · ${item.check.note}` : ''}</small>}</td>
          </tr>)}
        </tbody></table></div>
      </article>;
    })}</CalmRegion>
    {canMark && chosen.length > 0 && <div className="payroll-selection"><div><strong>{chosen.length} records selected</strong><span>{money(chosen.reduce((sum, i) => sum + i.amount, 0))} EGP</span></div><button className="text-button" onClick={() => setSelected([])}>Clear</button>{chosen.some(i => i.state !== 'UNCHECKED') && <button className="btn-secondary management-danger" onClick={() => setDialog({ mode: 'uncheck', items: chosen.filter(i => i.state !== 'UNCHECKED') })}>Mark as unchecked</button>}{chosen.some(i => i.state !== 'CHECKED') && <button className="btn-primary" onClick={() => setDialog({ mode: 'check', items: chosen.filter(i => i.state !== 'CHECKED') })}><CircleCheck size={16} />Mark as checked</button>}</div>}
    <AnimatePresence>{viewCycle && <CycleDetailsDialog cycleId={viewCycle} onClose={() => setViewCycle(null)} />}</AnimatePresence>
    <AnimatePresence>{dialog && <Dialog title={dialog.mode === 'check' ? 'Mark as checked' : 'Mark as unchecked'} onClose={saving ? () => {} : () => setDialog(null)}><div className="modal-content card enrollment-dialog">
      <h3>{dialog.mode === 'check' ? `Confirm ${dialog.items.length} ${branchLabel} records?` : `Mark ${dialog.items.length} records as unchecked?`}</h3>
      <p>{dialog.mode === 'check' ? 'Only confirm records that match the receipts and paperwork. If a record changes later, it will show as "Changed after check".' : 'These records go back to Unchecked and will need to be checked again.'}</p>
      <p className="policy-note">{dialog.items.length} records · {money(dialog.items.reduce((sum, i) => sum + i.amount, 0))} EGP</p>
      {dialog.mode === 'check' && <><label htmlFor="money-check-note">Note · optional</label><input id="money-check-note" className="input-field" maxLength={500} value={note} placeholder={`e.g. Checked with the ${branchLabel} mod on 15/12`} onChange={e => setNote(e.target.value)} /></>}
      <div className="payment-entry-actions"><button className="btn-secondary" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : dialog.mode === 'check' ? 'Mark as checked' : 'Mark as unchecked'}</button></div>
    </div></Dialog>}</AnimatePresence>
  </div>;
}
