import { cyclePath } from '../utils/cyclePath';
import PrivateBadge from '../components/PrivateBadge';
import { useEffect, useState, useContext, Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Calendar, Search, TrendingUp, ArrowUpRight, MapPin, ClipboardCheck } from 'lucide-react';
import { canCheckBranchMoney } from '../utils/access';
import { AuthContext } from '../context/AuthContext';
import '../styles/_moneyChecks.scss';
import { PageHeading, Metric, money, localMonth } from '../components/WorkspaceUI';
import { MotionRegion } from '../components/WorkspaceMotion';
import { getBranchColor } from '../utils/branchColors';
export default function Income() {
  const { user } = useContext(AuthContext);
  const [params, setParams] = useSearchParams();
  // Period: one month, a range of months, or a whole year (by cycle start month).
  const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
  const mode = /^\d{4}$/.test(params.get('year') || '') ? 'year' : MONTH.test(params.get('from') || '') && MONTH.test(params.get('to') || '') ? 'range' : 'month';
  const month = MONTH.test(params.get('month') || '') ? params.get('month') : localMonth();
  const year = mode === 'year' ? params.get('year') : month.slice(0, 4);
  const rangeFrom = mode === 'range' ? params.get('from') : month,
    rangeTo = mode === 'range' ? params.get('to') : month;
  const periodParams = mode === 'year' ? { year } : mode === 'range' ? { from: rangeFrom, to: rangeTo } : { month };
  const periodKey = JSON.stringify(periodParams);
  const setPeriod = next => {
    setParams(next);
    setBranch('');
  };
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const [search, setSearch] = useState(''),
    [branch, setBranch] = useState('');
  // Reminder of branch money still waiting for a check (admins and the main mod only).
  const [unchecked, setUnchecked] = useState(null);
  const checker = canCheckBranchMoney(user);
  useEffect(() => {
    if (!checker) return;
    let active = true;
    axios.get('/attention').then(({ data }) => { if (active) setUnchecked(data.moneyChecks || null); }).catch(() => {});
    return () => { active = false; };
  }, [checker]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    axios.get('/finances/income', {
      params: periodParams,
      signal: controller.signal
    }).then(({
      data
    }) => {
      setData(data);
    }).catch(e => {
      if (!controller.signal.aborted) setError(e.response?.data?.error || 'Income could not be loaded.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey, retry]);
  const cycles = (data?.cycles || []).filter(c => (!branch || c.branch === branch) && (!search || `${c.name} ${c.courseCode} ${c.branch}`.toLowerCase().includes(search.trim().toLowerCase())));
  // In range and year views every month gets its own section, even when empty.
  const filtered = Boolean(branch || search.trim());
  const visibleIncome = cycles.reduce((total, cycle) => total + cycle.income, 0);
  const labelOf = value => new Date(`${value}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const monthLabel = mode === 'year' ? `Full year ${year}` : mode === 'range' ? (rangeFrom === rangeTo ? labelOf(rangeFrom) : `${labelOf(rangeFrom)} – ${labelOf(rangeTo)}`) : labelOf(month);
  const matches = c => (!branch || c.branch === branch) && (!search || `${c.name} ${c.courseCode} ${c.branch}`.toLowerCase().includes(search.trim().toLowerCase()));
  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() + 1 - i));
  const date = value => new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
  return <section className="income-page"><PageHeading eyebrow="TUITION & BOOKS" title="Course income" description="All recorded student payments belong to the cycle’s start month."><div className="period-picker"><div className="period-modes" role="group" aria-label="Income period">{[['month', 'Month'], ['range', 'Range'], ['year', 'Year']].map(([value, label]) => <button key={value} type="button" className={mode === value ? 'active' : ''} aria-pressed={mode === value} onClick={() => setPeriod(value === 'year' ? { year } : value === 'range' ? { from: rangeFrom, to: rangeTo } : { month: rangeFrom })}>{label}</button>)}</div>
  {mode === 'month' && <label className="month-control"><Calendar size={15} /><input type="month" aria-label="Income month" required value={month} onChange={e => { if (e.target.value) setPeriod({ month: e.target.value }); }} /></label>}
  {mode === 'range' && <><label className="month-control"><Calendar size={15} />From<input type="month" aria-label="First month" required value={rangeFrom} max={rangeTo} onChange={e => { if (e.target.value) setPeriod({ from: e.target.value, to: e.target.value > rangeTo ? e.target.value : rangeTo }); }} /></label><label className="month-control"><Calendar size={15} />To<input type="month" aria-label="Last month" required value={rangeTo} min={rangeFrom} onChange={e => { if (e.target.value) setPeriod({ from: e.target.value < rangeFrom ? e.target.value : rangeFrom, to: e.target.value }); }} /></label></>}
  {mode === 'year' && <label className="month-control"><Calendar size={15} /><select aria-label="Income year" value={year} onChange={e => setPeriod({ year: e.target.value })}>{(years.includes(year) ? years : [year, ...years]).map(y => <option key={y} value={y}>{y}</option>)}</select></label>}
  </div></PageHeading>
 {unchecked && (unchecked.unchecked.count > 0 || unchecked.changed.count > 0) && <Link className="money-check-reminder" to="/finances/checks"><ClipboardCheck size={17} /><span><strong>{money(unchecked.unchecked.amount)} EGP</strong> of branch money not checked yet ({unchecked.unchecked.count} records){unchecked.changed.count > 0 ? ` · ${unchecked.changed.count} changed after check` : ''}</span><ArrowUpRight size={15} /></Link>}
 <MotionRegion transitionKey={loading ? 'loading' : error ? 'error' : periodKey} className="income-month-content">{loading ? <div className="loading-state"><span className="loading-spinner" />Loading income…</div> : error ? <div className="panel empty-state"><h3>{error}</h3><button className="btn-secondary" onClick={() => setRetry(retry + 1)}>Try again</button></div> : <>
 <div className="metric-grid income-metrics"><Metric tone="teal" label="Total income" value={<><small>EGP</small>{money(data.summary.income)}</>} detail={monthLabel + ' · by cycle start date'} /><Metric label="Tuition income" value={<><small>EGP</small>{money(data.summary.tuition)}</>} detail="Recorded tuition payments" /><Metric tone="violet" label="Book income" value={<><small>EGP</small>{money(data.summary.books)}</>} detail="Purchase-time prices · cycle start month" /></div>
 <div className="income-layout"><div className="panel income-ledger"><div className="panel-heading"><div><h2>Income by cycle</h2><p>{data.summary.cycles} cycles · {data.summary.students} enrollments · {data.summary.full} full / {data.summary.discounted} discounted / {data.summary.exempt} exempt.</p></div><span className="income-count">{cycles.length} cycles</span></div><div className="filter-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search income cycles" placeholder="Find a cycle or course code…" value={search} onChange={e => setSearch(e.target.value)} /></div></div><div className="income-branch-filters" aria-label="Filter income by branch"><button type="button" className={!branch ? 'is-active' : ''} aria-pressed={!branch} onClick={() => setBranch('')}>All branches</button>{data.branches.map(b => <button type="button" key={b.branch} style={{ '--branch-color': getBranchColor(b.branch) }} className={branch === b.branch ? 'is-active' : ''} aria-pressed={branch === b.branch} onClick={() => setBranch(branch === b.branch ? '' : b.branch)}><i aria-hidden="true" />{b.branch}<span>{b.cycles}</span></button>)}</div><MotionRegion transitionKey={branch || 'all'} className="income-results">{filtered && <div className="income-filter-summary"><span>{cycles.length} matching cycles <button type="button" onClick={() => { setBranch(''); setSearch(''); }}>Clear filters</button></span><strong>{money(visibleIncome)} <small>EGP</small></strong></div>}

 {!cycles.length ? <div className="empty-state"><TrendingUp size={30} /><h3>{data.cycles.length ? 'No matching cycles' : mode === 'month' ? 'No cycle income for this month' : 'No cycle income in this period'}</h3><p>{data.cycles.length ? 'Try another branch or search.' : 'Cycles appear here based on their start date, regardless of when they finish.'}</p></div> : <div className="table-scroll"><table className="data-table income-table"><thead><tr><th>Cycle / course</th><th>Branch</th><th>Start date</th><th>Students</th><th className="number">Tuition (EGP)</th><th className="number">Books (EGP)</th><th className="number">Total (EGP)</th></tr></thead><tbody>{(data.months ? data.months.map(m => ({ ...m, rows: m.cycles.filter(matches) })) : [{ month: null, rows: cycles }]).map(group => <Fragment key={group.month || 'all'}>{group.month && <tr className="income-month-row"><th colSpan={4}>{labelOf(group.month)}<small>{group.rows.length} {group.rows.length === 1 ? 'cycle' : 'cycles'}</small></th><td className="number">{money(group.rows.reduce((n, c) => n + c.tuition, 0))}</td><td className="number">{money(group.rows.reduce((n, c) => n + c.books, 0))}</td><td className="number currency">{money(group.rows.reduce((n, c) => n + c.income, 0))}</td></tr>}{group.month && !group.rows.length && <tr className="income-month-empty"><td colSpan={7}>No cycles started this month{filtered ? ' that match the filters' : ''}.</td></tr>}{group.rows.map(c => <tr key={c.id}><td><Link className="income-cycle-link" to={cyclePath(c)} state={{
                      search: c.name
                    }}>{c.name}<PrivateBadge record={c}/><ArrowUpRight size={13} /></Link><small>{c.courseCode}{c.archivedAt ? ' · Archived' : ''}</small>{c.isPrivate && <div className="flex items-center gap-1 text-xs text-slate-600 mt-0.5"><span>👤 {c.privateStudents?.join(', ') || 'Private students'}</span></div>}</td><td><span className="income-branch-badge" style={{ '--branch-color': getBranchColor(c.branch) }}><i aria-hidden="true" />{c.branch}</span></td><td>{date(c.startDate)}</td><td><strong>{c.students} <span className="income-student-label">students</span></strong><div className="income-types">{c.types.full > 0 && <span className="full">{c.types.full} full</span>}{c.types.discounted > 0 && <span className="discounted">{c.types.discounted} discounted</span>}{c.types.exempt > 0 && <span className="exempt">{c.types.exempt} exempt</span>}</div></td><td className="number">{money(c.tuition)}</td><td className="number">{money(c.books)}</td><td className="number currency">{money(c.income)}</td></tr>)}</Fragment>)}</tbody></table></div>}
 </MotionRegion><div className="panel-footnote">Income is the actual recorded amount, after refunds and corrections. Archived financial records are excluded.</div></div>
 <aside className="panel income-branches"><div className="panel-heading"><div><h2>By branch</h2><p>Share of income · {monthLabel}</p></div><MapPin size={18} /></div>{data.branches.length ? data.branches.map(b => <button type="button" className={`income-branch ${branch === b.branch ? 'is-selected' : ''}`} style={{ '--branch-color': getBranchColor(b.branch) }} key={b.branch} aria-pressed={branch === b.branch} aria-label={`Filter by ${b.branch}`} onClick={() => setBranch(branch === b.branch ? '' : b.branch)}><div><strong><i aria-hidden="true" />{b.branch}</strong><span className="income-share">{data.summary.income ? Math.round(b.income / data.summary.income * 100) : 0}%</span></div><b>{money(b.income)} <small>EGP</small></b><div className="income-branch-track"><span style={{ width: `${data.summary.income ? Math.max(0, Math.min(100, b.income / data.summary.income * 100)) : 0}%` }} /></div><small>Tuition {money(b.tuition)} · Books {money(b.books)} EGP</small><small>{b.cycles} cycles · {b.students} students</small></button>) : <p className="income-no-branches">No branches to show yet.</p>}</aside></div>
 {data.undatedCycles > 0 && <p className="income-undated"><Link to="/courses/cycles">{data.undatedCycles} {data.undatedCycles === 1 ? 'cycle has' : 'cycles have'} no start date</Link> and cannot be counted in any income period yet.</p>}
 </>}</MotionRegion>
 </section>;
}
