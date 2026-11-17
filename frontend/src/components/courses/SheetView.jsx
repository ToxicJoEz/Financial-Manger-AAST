import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Search, Users, BookOpen, CircleCheck, CircleAlert, Clock3, PlayCircle, Hourglass, Wallet } from 'lucide-react';
import '../../styles/_sheet.scss';
import { CalmRegion } from '../WorkspaceMotion';
import ApprovalBadge, { isNewCycle } from '../ApprovalBadge';

// The Private sheet (admins and the main mod): like the old per-employee Excel sheets. Pick an employee on the left;
// their students are listed one per row, newest month first, with totals. Clicking a row opens the cycle.
// Colour carries meaning only: tuition owed, and completed cycles whose employee is not paid yet.
const TUITION = { PAID: ['paid', 'Paid', CircleCheck], PARTIAL: ['partial', null, CircleAlert], UNPAID: ['unpaid', 'Unpaid', CircleAlert], EXEMPT: ['free', 'Free', null] };
// The cycle, for this employee: still running, or completed and where their salary stands.
const CYCLE = {
  RUNNING: ['running', 'Running', PlayCircle],
  NO_HOURS: ['due', 'Done · confirm hours', Hourglass],
  UNPAID: ['due', 'Done · salary due', Wallet],
  PROCESSING: ['processing', 'Done · salary processing', Clock3],
  PAID: ['settled', 'Done · salary paid', CircleCheck],
  NONE: ['settled', 'Done', CircleCheck]
};
const cycleState = row => (!row.isFinished && !['PAID', 'PROCESSING', 'UNPAID'].includes(row.pay) ? 'RUNNING' : row.pay || 'NONE');
// Several numbers in one phone field ("0100… / 0122…") are listed one under another.
const phones = value => String(value || '').split(/\s*[/,،;]\s*|\s+(?:or|او|أو)\s+/i).map(p => p.trim()).filter(Boolean);
const BOOKS = { PAID: '✓', UNPAID: '—', EXEMPT: 'Free' };
const money = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const day = d => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }) : '—');
const monthOf = d => (d ? new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'No start date');
const remembered = () => { try { return localStorage.getItem('aast-sheet-employee') || ''; } catch { return ''; } };
const Pill = ({ tone, Icon, children }) => <span className={'sheet-pill tone-' + tone}>{Icon && <Icon size={13} aria-hidden="true" />}{children}</span>;

export default function SheetView({ params, refreshKey, onOpen, justAdded = [], focus = null }) {
  const [employeeId, setEmployeeId] = useState(remembered);
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  // Which filters and employee the rows on screen belong to: the table cross-fades only when that changes,
  // once the new rows have arrived (a refresh after recording a payment updates in place).
  const [shownKey, setShownKey] = useState('');
  const [find, setFind] = useState('');
  const key = JSON.stringify(params);
  const choose = id => { setEmployeeId(id); try { localStorage.setItem('aast-sheet-employee', id); } catch { /* per-browser convenience only */ } };
  // A cycle just added: open the sheet of the employee it belongs to (once), so it is on screen straight away.
  const focused = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    const focusNow = focus && focused.current !== focus ? focus : undefined;
    setLoading(true);
    axios.get('/cycles/sheet', { params: { ...params, employeeId: employeeId || undefined, focus: focusNow }, signal: controller.signal })
      .then(({ data }) => {
        setData(data); setError(''); setShownKey(key + '|' + (data.employee?.id || ''));
        if (focusNow) { focused.current = focusNow; if (data.employee && data.employee.id !== employeeId) choose(data.employee.id); }
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.response?.data?.error || 'The sheet could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, employeeId, refreshKey, focus]);

  // Month separators, newest first. Inside a month: completed cycles already paid to the employee, then running
  // cycles, then completed cycles the employee is not paid for yet (salary due, processing, or hours to confirm).
  // A shared cycle's students stay together, and the original order is kept within each kind.
  const groups = useMemo(() => {
    const out = [];
    for (const row of data?.rows || []) {
      const month = monthOf(row.startDate);
      if (out.at(-1)?.month !== month) out.push({ month, rows: [] });
      out.at(-1).rows.push(row);
    }
    const rank = row => ({ PAID: 0, NONE: 0, RUNNING: 1 })[cycleState(row)] ?? 2;
    for (const group of out) group.rows = group.rows.map((row, i) => [row, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([row]) => row);
    return out;
  }, [data]);
  const students = (data?.rows || []).filter(r => r.student);
  const totals = { fee: students.reduce((n, r) => n + r.fee, 0), paid: students.reduce((n, r) => n + r.paid, 0), due: students.reduce((n, r) => n + r.due, 0) };
  const showBooks = students.some(r => r.books);
  const employees = (data?.employees || []).filter(e => !find.trim() || e.name.toLowerCase().includes(find.trim().toLowerCase()));
  const current = data?.employee;
  const columns = showBooks ? 10 : 9;

  const state = error ? 'error' : !data ? 'loading' : !data.employees.length ? 'empty' : 'sheet';
  return <CalmRegion transitionKey={state}>{state === 'error' ? <div className="empty-state"><h3>{error}</h3></div>
    : state === 'loading' ? <div className="loading-state" role="status"><span className="loading-spinner" />Loading the sheet…</div>
    : state === 'empty' ? <div className="empty-state"><BookOpen size={28} /><h3>No private cycles match</h3><p>Try a different search or reset your filters.</p></div>
    : <div className={'sheet-view' + (loading ? ' is-loading' : '')} aria-busy={loading}>
    <aside className="sheet-people" aria-label="Employees">
      <div className="sheet-find"><Search size={14} aria-hidden="true" /><input aria-label="Find employee" placeholder="Find employee" value={find} onChange={e => setFind(e.target.value)} /></div>
      <ul>{employees.map(e => <li key={e.id}><button type="button" className={(current?.id === e.id ? 'active' : '') + (e.id === 'unassigned' ? ' is-unassigned' : '')} aria-current={current?.id === e.id ? 'true' : undefined} onClick={() => choose(e.id)}>
        <span className="sheet-person-name" dir="auto">{e.name}</span>
        <span className="sheet-person-meta">{e.salaryDue > 0 && <i className="sheet-salary-badge" title={`${e.salaryDue} completed cycle${e.salaryDue === 1 ? '' : 's'} with salary not paid yet`}>{e.salaryDue}</i>}{e.owed > 0 && <i className="sheet-owed-dot" title={money(e.owed) + ' EGP tuition owed'} />}<span title={`${e.cycles} cycle${e.cycles === 1 ? '' : 's'} · ${e.students} student${e.students === 1 ? '' : 's'}`}>{e.cycles}</span></span>
      </button></li>)}</ul>
    </aside>
    <CalmRegion transitionKey={shownKey} className="sheet-main">
      {current && <header className="sheet-head">
        <span className="sheet-head-icon"><Users size={18} aria-hidden="true" /></span>
        <h3 dir="auto">{current.name}</h3>
        {current.rate != null && <span className="sheet-head-rate"><b>{money(current.rate)}</b> EGP / hr</span>}
        <span>{current.students} students</span>
        {current.salaryDue > 0 && <Pill tone="due" Icon={Wallet}>{current.salaryDue} completed cycle{current.salaryDue === 1 ? '' : 's'} · salary not paid</Pill>}
        {totals.due > 0 && <Pill tone="unpaid" Icon={CircleAlert}>{money(totals.due)} EGP tuition owed</Pill>}
      </header>}
      <div className="sheet-scroll">
        <table className="sheet-table">
          <thead><tr><th className="c-date">Start</th><th className="c-date">End</th><th>Student</th><th className="c-phone">Phone</th><th className="c-course">Course</th><th className="num c-hours">Hours × rate</th><th className="num c-money">Fee</th><th className="c-cycle">Cycle</th>{showBooks && <th className="c-books">Books</th>}</tr></thead>
          {groups.map(group => <tbody key={group.month}>
            <tr className="sheet-month"><th colSpan={columns} scope="rowgroup">{group.month}</th></tr>
            {group.rows.map(row => {
              const [tone, label, TIcon] = row.student ? TUITION[row.status] : ['muted', 'No students', null];
              const [ctone, clabel, CIcon] = CYCLE[cycleState(row)];
              const first = !row.shared || row.shared.index === 0;
              const fresh = justAdded.includes(row.cycleId);
              const classes = [isNewCycle(row, fresh) && 'is-new-cycle', fresh && 'is-just-added', row.shared && 'is-shared', row.shared && first && 'shared-first', row.shared && row.shared.index === row.shared.size - 1 && 'shared-last', row.archived && 'is-archived', 'cycle-' + ctone].filter(Boolean).join(' ');
              return <tr key={(row.enrollmentId || row.cycleId) + current?.id} className={classes} tabIndex={0} title={row.cycleName} onClick={() => onOpen(row.cycleId)} onKeyDown={e => { if (e.key === 'Enter') onOpen(row.cycleId); }}>
                <td className="c-date">{first ? day(row.startDate) : ''}</td>
                <td className="c-date">{first ? (row.endDate ? day(row.endDate) : '') : ''}</td>
                <td dir="auto" className="c-student">{row.student || <span className="muted">—</span>}{first && <ApprovalBadge record={row} justAdded={fresh} />}</td>
                <td className="c-phone">{phones(row.mobile).map(n => <span key={n}>{n}</span>)}</td>
                <td className="c-course">{first ? row.course : ''}</td>
                <td className="num c-hours">{first ? <span className="sheet-hours"><b>{row.hours ?? '—'}</b> h <i>×</i> <b>{row.rate != null ? money(row.rate) : '—'}</b>{row.hoursClosed && <small>closed</small>}</span> : <span className="muted">shared</span>}</td>
                {/* The fee itself shows whether it is paid: green paid, red unpaid, amber part-paid, grey free. */}
                <td className="num c-money">{row.student && <span className="sheet-fee" title={tone === 'partial' ? `${money(row.paid)} paid, ${money(row.due)} left` : label}><Pill tone={tone} Icon={TIcon}>{row.fee ? money(row.fee) : 'Free'}</Pill>{tone === 'partial' && <small>{money(row.due)} left</small>}</span>}</td>
                <td className="c-cycle">{first && <Pill tone={ctone} Icon={CIcon}>{clabel}</Pill>}</td>
                {showBooks && <td className="c-books">{row.books ? BOOKS[row.books] || row.books : ''}</td>}
              </tr>;
            })}
          </tbody>)}
          <tfoot><tr><td colSpan={2}>{students.length} students</td><td colSpan={4} className="muted">{new Set((data.rows || []).map(r => r.cycleId)).size} cycles</td><td className="num">{money(totals.fee)}</td><td colSpan={columns - 6}>{totals.due > 0 ? <span className="unpaid">{money(totals.due)} EGP due</span> : <span className="paid">{money(totals.paid)} EGP collected</span>}</td></tr></tfoot>
        </table>
      </div>
      {data.truncated && <p className="sheet-note">Showing the newest 3,000 cycles. Narrow the filters to see older ones.</p>}
    </CalmRegion>
  </div>}</CalmRegion>;
}
