import PrivateBadge from '../components/PrivateBadge';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Calendar, Search, TrendingUp, ArrowUpRight, MapPin } from 'lucide-react';
import { PageHeading, Metric, money, localMonth } from '../components/WorkspaceUI';
import { MotionRegion } from '../components/WorkspaceMotion';
import { getBranchColor } from '../utils/branchColors';
export default function Income() {
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') || '') ? params.get('month') : localMonth();
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const [search, setSearch] = useState(''),
    [branch, setBranch] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    axios.get('/finances/income', {
      params: {
        month
      },
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
  }, [month, retry]);
  const cycles = (data?.cycles || []).filter(c => (!branch || c.branch === branch) && (!search || `${c.name} ${c.courseCode} ${c.branch}`.toLowerCase().includes(search.trim().toLowerCase())));
  const filtered = Boolean(branch || search.trim());
  const visibleIncome = cycles.reduce((total, cycle) => total + cycle.income, 0);
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const date = value => new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
  return <section className="income-page"><PageHeading eyebrow="TUITION & BOOKS" title="Course income" description="All recorded student payments belong to the cycle’s start month."><label className="month-control"><Calendar size={15} /><input type="month" aria-label="Income month" required value={month} onChange={e => {
          if (e.target.value) {
            setParams({
              month: e.target.value
            });
            setBranch('');
          }
        }} /></label></PageHeading>
 <MotionRegion transitionKey={loading ? 'loading' : error ? 'error' : data?.month} className="income-month-content">{loading ? <div className="loading-state"><span className="loading-spinner" />Loading income…</div> : error ? <div className="panel empty-state"><h3>{error}</h3><button className="btn-secondary" onClick={() => setRetry(retry + 1)}>Try again</button></div> : <>
 <div className="metric-grid income-metrics"><Metric tone="teal" label="Total income" value={<><small>EGP</small>{money(data.summary.income)}</>} detail={monthLabel + " · by cycle start date"} /><Metric label="Tuition income" value={<><small>EGP</small>{money(data.summary.tuition)}</>} detail="Recorded tuition payments" /><Metric tone="violet" label="Book income" value={<><small>EGP</small>{money(data.summary.books)}</>} detail="Purchase-time prices · cycle start month" /></div>
 <div className="income-layout"><div className="panel income-ledger"><div className="panel-heading"><div><h2>Income by cycle</h2><p>{data.summary.cycles} cycles · {data.summary.students} enrollments · {data.summary.full} full / {data.summary.discounted} discounted / {data.summary.exempt} exempt.</p></div><span className="income-count">{cycles.length} cycles</span></div><div className="filter-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search income cycles" placeholder="Find a cycle or course code…" value={search} onChange={e => setSearch(e.target.value)} /></div></div><div className="income-branch-filters" aria-label="Filter income by branch"><button type="button" className={!branch ? 'is-active' : ''} aria-pressed={!branch} onClick={() => setBranch('')}>All branches</button>{data.branches.map(b => <button type="button" key={b.branch} style={{ '--branch-color': getBranchColor(b.branch) }} className={branch === b.branch ? 'is-active' : ''} aria-pressed={branch === b.branch} onClick={() => setBranch(branch === b.branch ? '' : b.branch)}><i aria-hidden="true" />{b.branch}<span>{b.cycles}</span></button>)}</div><MotionRegion transitionKey={branch || 'all'} className="income-results">{filtered && <div className="income-filter-summary"><span>{cycles.length} matching cycles <button type="button" onClick={() => { setBranch(''); setSearch(''); }}>Clear filters</button></span><strong>{money(visibleIncome)} <small>EGP</small></strong></div>}

 {!cycles.length ? <div className="empty-state"><TrendingUp size={30} /><h3>{data.cycles.length ? 'No matching cycles' : 'No cycle income for this month'}</h3><p>{data.cycles.length ? 'Try another branch or search.' : 'Cycles appear here based on their start date, regardless of when they finish.'}</p></div> : <div className="table-scroll"><table className="data-table income-table"><thead><tr><th>Cycle / course</th><th>Branch</th><th>Start date</th><th>Students</th><th className="number">Tuition (EGP)</th><th className="number">Books (EGP)</th><th className="number">Total (EGP)</th></tr></thead><tbody>{cycles.map(c => <tr key={c.id}><td><Link className="income-cycle-link" to={`/courses/${c.parentCourseId}`} state={{
                      search: c.name
                    }}>{c.name}<PrivateBadge record={c}/><ArrowUpRight size={13} /></Link><small>{c.courseCode}{c.archivedAt ? ' · Archived' : ''}</small></td><td><span className="income-branch-badge" style={{ '--branch-color': getBranchColor(c.branch) }}><i aria-hidden="true" />{c.branch}</span></td><td>{date(c.startDate)}</td><td><strong>{c.students} <span className="income-student-label">students</span></strong><div className="income-types">{c.types.full > 0 && <span className="full">{c.types.full} full</span>}{c.types.discounted > 0 && <span className="discounted">{c.types.discounted} discounted</span>}{c.types.exempt > 0 && <span className="exempt">{c.types.exempt} exempt</span>}</div></td><td className="number">{money(c.tuition)}</td><td className="number">{money(c.books)}</td><td className="number currency">{money(c.income)}</td></tr>)}</tbody></table></div>}
 </MotionRegion><div className="panel-footnote">Income is the actual recorded amount, after refunds and corrections. Archived financial records are excluded.</div></div>
 <aside className="panel income-branches"><div className="panel-heading"><div><h2>By branch</h2><p>Share of this month’s income</p></div><MapPin size={18} /></div>{data.branches.length ? data.branches.map(b => <button type="button" className={`income-branch ${branch === b.branch ? 'is-selected' : ''}`} style={{ '--branch-color': getBranchColor(b.branch) }} key={b.branch} aria-pressed={branch === b.branch} aria-label={`Filter by ${b.branch}`} onClick={() => setBranch(branch === b.branch ? '' : b.branch)}><div><strong><i aria-hidden="true" />{b.branch}</strong><span className="income-share">{data.summary.income ? Math.round(b.income / data.summary.income * 100) : 0}%</span></div><b>{money(b.income)} <small>EGP</small></b><div className="income-branch-track"><span style={{ width: `${data.summary.income ? Math.max(0, Math.min(100, b.income / data.summary.income * 100)) : 0}%` }} /></div><small>Tuition {money(b.tuition)} · Books {money(b.books)} EGP</small><small>{b.cycles} cycles · {b.students} students</small></button>) : <p className="income-no-branches">No branches to show yet.</p>}</aside></div>
 {data.undatedCycles > 0 && <p className="income-undated"><Link to="/courses/cycles">{data.undatedCycles} {data.undatedCycles === 1 ? 'cycle has' : 'cycles have'} no start date</Link> and cannot be assigned to an income month yet.</p>}
 </>}</MotionRegion>
 </section>;
}
