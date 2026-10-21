import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import payrollReportStyles from '../styles/_payrollReport.scss?inline';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Wallet, Clock3, CheckCircle, ChevronDown, Plus, Search, ArrowUpRight, Download, FileText, Calendar, BookOpen } from 'lucide-react';
import { PageHeading, Metric, money, initials } from '../components/WorkspaceUI';
import { MotionRegion, MotionTab } from '../components/WorkspaceMotion';
import CustomFilterDropdown from '../components/CustomFilterDropdown';
import ExcelExportButton from '../components/ExcelExportButton';
import Dialog from '../components/Dialog';
import { getBranchColor } from '../utils/branchColors';
import '../styles/_instructorPayroll.scss';
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Cairo' });
const day = value => value ? value.slice(0, 10) : '';
const formatDate = value => value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Not recorded';
const statusLabels = { UNPAID: 'Unpaid', PROCESSING: 'Processing', PAID: 'Paid' };

export default function Finances() {
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') || '') ? params.get('month') : today().slice(0,7);
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [view, setView] = useState('earnings'), [status, setStatus] = useState('UNPAID'), [branch, setBranch] = useState(''), [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({}), [selected, setSelected] = useState([]);
  const [dialog, setDialog] = useState(null), [paymentDay, setPaymentDay] = useState(today), [saving, setSaving] = useState(false), [dialogError, setDialogError] = useState(''), [exporting, setExporting] = useState(false);
  const busy = useRef(false), requestId = useRef(0);
  const load = async (background = false) => {
    const id = ++requestId.current;
    if (!background) setLoading(true);
    setError('');
    try { const { data } = await axios.get('/finances', { params: { month } }); if (id === requestId.current) setData(data); }
    catch (e) { if (id === requestId.current) setError(e.response?.data?.error || 'Payroll could not be loaded.'); }
    finally { if (id === requestId.current) setLoading(false); }
  };
  useEffect(() => { load(); const refresh = () => load(true); window.addEventListener('assignments-updated', refresh); return () => { requestId.current++; window.removeEventListener('assignments-updated', refresh); }; }, [month]);
  const earnings = data?.earnings || [];
  const chosen = earnings.filter(e => selected.includes(e.id) && e.status === 'UNPAID');
  const paidThisMonth = row => row.status === 'PAID' && day(row.batch?.actualPaymentDate).slice(0,7) === month;
  const filtered = earnings.filter(e => (e.status !== 'PAID' || paidThisMonth(e)) && (!status || e.status === status) && (!branch || e.branch === branch) && (!search.trim() || `${e.instructorName} ${e.employeeId || ''} ${e.cycleName}`.toLowerCase().includes(search.trim().toLowerCase())));
  const groups = Object.values(filtered.reduce((map, e) => { const group = map[e.instructorId] ||= { id: e.instructorId, name: e.instructorName, employeeId: e.employeeId, rows: [], amount: 0 }; group.rows.push(e); group.amount += e.amount; return map; }, {}));
  const batches = (data?.batches || []).filter(b => (status === 'LEGACY' ? b.legacy && !b.actualPaymentDate : (b.status !== 'PAID' || day(b.actualPaymentDate).slice(0,7) === month)) && (status === 'LEGACY' ? true : status === 'UNPAID' ? false : !status || b.status === status) && (!branch || b.earnings.some(e => e.branch === branch)) && (!search.trim() || `${b.instructorName} ${b.earnings.map(e => e.cycleName).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())));
  const dailyGroups = Object.values((data?.batches || []).reduce((map, payment) => {
    const key = day(payment.initiatedDate) || 'undated';
    const group = map[key] ||= { id: key, date: payment.initiatedDate, payments: [], amount: 0 };
    group.payments.push(payment); group.amount += payment.amount; return map;
  }, {})).filter(group => group.payments.some(payment => batches.some(b => b.id === payment.id))).sort((a,b) => b.id.localeCompare(a.id));
  const confirmDay = group => {
    const pending = group.payments.filter(payment => payment.status === 'PROCESSING');
    showDialog({ dailyPayment: true, batchIds: pending.map(payment => payment.id), day: group.id, instructorName: `Payment batch · ${formatDate(group.date)}`, earnings: pending.flatMap(payment => payment.earnings), amount: pending.reduce((sum,payment) => sum + payment.amount, 0), initiatedDate: group.date });
  };
  const courseGroups = Object.values(earnings.reduce((map, row) => {
    const group = map[row.courseId] ||= { id: row.courseId, name: row.cycleName, branch: row.branch, rows: [], amount: 0 };
    group.rows.push(row); group.amount += row.amount; return map;
  }, {})).map(group => {
    const positive = group.rows.filter(e => e.amount > 0);
    return { ...group, unpaid: positive.filter(e => e.status === 'UNPAID'), processing: positive.filter(e => e.status === 'PROCESSING'), paid: positive.filter(e => e.status === 'PAID'), state: positive.length && positive.every(e => e.status === 'PAID') ? 'PAID' : positive.some(e => e.status === 'PROCESSING') ? 'PROCESSING' : positive.some(e => e.status === 'PAID') ? 'PARTIAL' : 'UNPAID' };
  }).filter(c => (!branch || c.branch === branch) && (!search.trim() || `${c.name} ${c.rows.map(e => e.instructorName).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase())) && (c.unpaid.length || c.processing.length || c.rows.some(paidThisMonth)) && (!status || (status === 'PAID' ? c.state === 'PAID' && c.rows.some(paidThisMonth) : status === 'UNPAID' ? c.unpaid.length > 0 : c.processing.length > 0)));
  const selectCourse = course => {
    const ids = course.unpaid.map(e => e.id), allSelected = ids.every(id => selected.includes(id));
    setSelected(current => allSelected ? current.filter(id => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  };
  const confirmCourse = course => {
    const ids = [...new Set(course.processing.map(e => e.batchId))];
    const fullBatches = data.batches.filter(b => ids.includes(b.id));
    if (fullBatches.some(b => b.earnings.some(e => e.courseId !== course.id))) { toast.error('A payment batch includes other courses. Confirm the full payment in Payment batches.'); return; }
    const rows = fullBatches.flatMap(b => b.earnings);
    showDialog({ coursePayment: true, batchIds: ids, courseIds: [course.id], instructorName: course.name, earnings: rows, amount: rows.reduce((sum,e)=>sum+e.amount,0), initiatedDate: fullBatches.map(b=>b.initiatedDate).sort().at(-1) });
  };
  const toggle = earning => {
    if (earning.status !== 'UNPAID' || earning.amount <= 0) return;
    setSelected(ids => ids.includes(earning.id) ? ids.filter(id => id !== earning.id) : [...ids, earning.id]);
  };
  const showDialog = batch => { setDialog(batch ? { batch } : { coursePayment: view === 'courses', key: crypto.randomUUID(), rows: chosen.map(e => ({ ...e })) }); setPaymentDay(today()); setDialogError(''); };
  const save = async e => {
    e.preventDefault(); if (busy.current) return;
    busy.current = true; setSaving(true); setDialogError('');
    try {
      const { data } = dialog.batch ? await axios.post(dialog.batch.dailyPayment ? `/finances/payment-days/${dialog.batch.day}/pay` : dialog.batch.coursePayment ? '/finances/course-payments/pay' : `/finances/batches/${dialog.batch.id}/pay`, { actualPaymentDate: paymentDay, ...(dialog.batch.dailyPayment ? { batchIds: dialog.batch.batchIds } : {}), ...(dialog.batch.coursePayment ? { batchIds: dialog.batch.batchIds, courseIds: dialog.batch.courseIds } : {}) }) : await axios.post(dialog.coursePayment ? '/finances/course-payments' : '/finances/selected-payments', { ...(dialog.coursePayment ? { courseIds: [...new Set(dialog.rows.map(e=>e.courseId))] } : {}), earningIds: dialog.rows.map(e => e.id), versions: Object.fromEntries(dialog.rows.map(e => [e.id, e.updatedAt])), initiatedDate: paymentDay, idempotencyKey: dialog.key });
      toast.success(data.message); setDialog(null); setSelected([]); await load(true); window.dispatchEvent(new Event('assignments-updated'));
    } catch (e) { setDialogError(e.response?.data?.error || 'Payment could not be saved.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const exportPaid = async (group = null, format = "pdf") => {
    let reportInstructors = data?.monthly?.instructors || [];
    if (group) {
      const instructors = new Map();
      for (const payment of group.payments.filter(p => p.status === 'PAID' && day(p.actualPaymentDate).slice(0,7) === month)) for (const salary of payment.earnings) {
        const row = instructors.get(salary.instructorId) || { name: salary.instructorName, employeeId: salary.employeeId, amountMinor: 0n };
        row.amountMinor += BigInt(salary.amountMinor); instructors.set(salary.instructorId, row);
      }
      reportInstructors = [...instructors.values()].map(row => ({ ...row, totalPaid: Number(row.amountMinor)/100 })).sort((a,b)=>b.totalPaid-a.totalPaid);
    }
    if (exporting || !data?.monthly || data.monthly.month !== month || reportInstructors.length === 0) return;
    setExporting(true);
    try {
      if (format === 'docx') {
        const { createSalaryWordReport } = await import('../utils/salaryWordReport');
        const blob = await createSalaryWordReport(reportInstructors, month);
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = `Payroll_Report_${month}${group ? '_Batch_' + group.id : ''}.docx`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }
      // Load the report renderer only when requested, keeping normal navigation light.
      const {
        default: html2pdf
      } = await import('html2pdf.js');
      const element = document.createElement('div');

      // Filter and map instructors
      const rowsHtml = reportInstructors.filter(inst => (inst.totalPaid || 0) > 0).map((inst, idx) => `
        <tr class="${idx % 2 === 0 ? 'payroll-report-row-even' : 'payroll-report-row-odd'}">
          <td class="payroll-report-cell-1">${idx + 1}</td>
          <td class="payroll-report-cell-2">${escapeHTML(inst.name)}</td>
          <td class="payroll-report-cell-3">${escapeHTML(inst.employeeId || '-')}</td>
          <td class="payroll-report-cell-4">
            <table class="payroll-report-cell-5">
              <tr>
                <td class="payroll-report-cell-6">${(inst.totalPaid || 0).toLocaleString()}</td>
                <td class="payroll-report-cell-7">\u062C\u0646\u064A\u0647\u0627\u064B</td>
              </tr>
            </table>
          </td>
        </tr>
      `).join('');
      element.innerHTML = `<style>${payrollReportStyles}</style>
      <div dir="rtl" class="payroll-report-cell-8">
        <h2 class="payroll-report-cell-9">\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A \u0644\u0634\u0647\u0631 ${month}</h2>
        <table class="payroll-report-cell-10">
          <thead>
            <tr>
              <th class="payroll-report-cell-11">\u0645</th>
              <th class="payroll-report-cell-12">\u0627\u0644\u0623\u0633\u0645</th>
              <th class="payroll-report-cell-13">\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0648\u0638\u064A\u0641\u064A</th>
              <th class="payroll-report-cell-14">\u0627\u0644\u0645\u0628\u0644\u063A \u0628\u0627\u0644\u062C\u0646\u064A\u0647 \u0627\u0644\u0645\u0635\u0631\u064A</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
      const opt = {
        margin: 0.5,
        filename: `Payroll_Report_${month}${group ? "_Batch_" + group.id : ""}_${new Date().getTime()}.pdf`,
        image: {
          type: 'jpeg',
          quality: 0.98
        },
        html2canvas: {
          scale: 2,
          useCORS: true
        },
        jsPDF: {
          unit: 'in',
          format: 'letter',
          orientation: 'portrait'
        }
      };
      const blob = await html2pdf().set(opt).from(element).outputPdf('blob');
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = opt.filename; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error('Could not export the report. Please try again.');
    } finally {
      setExporting(false);
    }
  };
  return <section className="instructor-payroll">
    <PageHeading eyebrow="INSTRUCTOR SALARY" title="Payroll" description="Monthly paid salary, with unpaid and processing salary ready to manage."><div className="payroll-header-actions"><label className="month-control"><Calendar size={15} /><input aria-label="Salary report month" type="month" required value={month} onChange={e => { if(e.target.value) {setParams({month:e.target.value});setSelected([]);} }} /></label><ExcelExportButton key={month} initialMonth={month} salaryMonth={month} /><button className="btn-secondary export-format-pdf" onClick={() => exportPaid()} disabled={exporting || loading || !data?.monthly?.instructors.length || data.monthly.month !== month}><Download size={15} />{exporting ? 'Preparing report…' : 'Export PDF'}</button><button className="btn-secondary export-format-word" onClick={() => exportPaid(null, 'docx')} disabled={exporting || loading || !data?.monthly?.instructors.length || data.monthly.month !== month}><FileText size={15}/>Export Word</button></div></PageHeading>
    <MotionRegion transitionKey={loading ? 'loading' : error ? 'error' : data?.monthly?.month || 'ready'} className="salary-month-content">{error ? <div className="panel empty-state"><h3>{error}</h3><button className="btn-secondary" onClick={() => load()}>Try again</button></div> : loading ? <div className="loading-state"><span className="loading-spinner" />Loading employee salary…</div> : <>
      <div className="metric-grid payroll-summary"><Metric tone="teal" label="Salary paid" value={<><small>EGP</small>{money(data.monthly?.totalPaid || 0)}</>} detail={monthLabel + ' · actual payment date'} /><Metric label="Employees paid" value={data.monthly?.instructorsPaid || 0} detail={'Received payment in ' + monthLabel} /><Metric tone="violet" label="Cycles paid" value={data.monthly?.cyclesPaid || 0} detail="Cycles with salary payments in this month" /><Metric tone="peach" label="Payments completed" value={data.monthly?.paymentsCompleted || 0} detail="Confirmed batches in the selected month" /></div>
      {!!data.needsAllocation?.length && <div className="payroll-allocation-note"><Clock3 size={19} /><div><strong>{data.needsAllocation.length} completed cycles need teaching details</strong><p>Confirm their employees and taught hours before payroll can be recorded.</p><div>{data.needsAllocation.map(c => <Link key={c.id} to={`/courses/${c.parentCourseId}`} state={{ search: c.name }}>{c.name}<ArrowUpRight size={13} /></Link>)}</div></div></div>}
      <div className="section-tabs" aria-label="Payroll views"><MotionTab active={view === 'earnings'} onClick={() => { setView('earnings'); setStatus('UNPAID'); setSelected([]); }}>Employee salary</MotionTab><MotionTab active={view === 'courses'} onClick={() => { setView('courses'); setStatus('UNPAID'); setSelected([]); }}>Course cost</MotionTab><MotionTab active={view === 'batches'} onClick={() => { setView('batches'); setStatus('PROCESSING'); setSelected([]); }}>Payment batches<span>{new Set(data.batches.filter(b => b.status === 'PROCESSING').map(b=>day(b.initiatedDate))).size}</span></MotionTab></div>
      <div className="panel payroll-controls"><div className="payroll-status-tabs">{[['', 'All'], ...(view !== 'batches' ? [['UNPAID', 'Unpaid']] : []), ['PROCESSING', 'Processing'], ['PAID', 'Paid'], ...(view === 'batches' ? [['LEGACY', 'Undated legacy']] : [])].map(([value, label]) => <button key={value} type="button" className={status === value ? 'active' : ''} aria-pressed={status === value} onClick={() => { setStatus(value); setSelected([]); }}>{label}</button>)}</div><div className="filter-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search payroll" placeholder="Find an employee or cycle…" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="filter-select"><CustomFilterDropdown value={branch} onChange={setBranch} placeholder="All branches" options={[...new Set(earnings.map(e => e.branch))].map(value => ({ value, label: value }))} /></div></div></div>
      <p className="payroll-month-explanation">Paid salary: {monthLabel}, by actual payment date. Unpaid and processing salary: all dates. Legacy payments without a known date are not assigned to a month.</p>
      <MotionRegion transitionKey={`${month}:${view}:${status}:${branch}`} className="payroll-content">
      {view === 'earnings' ? groups.length ? groups.map((group, index) => <article className="panel payroll-instructor" key={group.id}><button className="payroll-instructor-heading" aria-expanded={expanded[group.id] ?? index === 0} onClick={() => setExpanded(state => ({ ...state, [group.id]: !(state[group.id] ?? index === 0) }))}><span className="payroll-avatar">{initials(group.name)}</span><span className="payroll-instructor-name"><strong dir="auto">{group.name}</strong><small>{group.employeeId || "Employee"} · {group.rows.length} cycle salary items</small></span><span className="payroll-instructor-amount">{money(group.amount)}<small> EGP</small></span><ChevronDown size={18} /></button><InstructorSalarySelection rows={earnings.filter(e => e.instructorId === group.id && e.status === 'UNPAID' && e.amount > 0)} selected={selected} name={group.name} onToggle={ids => setSelected(current => ids.every(id => current.includes(id)) ? current.filter(id => !ids.includes(id)) : [...new Set([...current, ...ids])])} />{(expanded[group.id] ?? index === 0) && <><div className="table-scroll"><table className="data-table payroll-earnings-table"><thead><tr><th>Select</th><th>Cycle / branch</th><th>Hours × rate</th><th className="number">Salary</th><th>Status</th><th>Payment dates</th></tr></thead><tbody>{group.rows.map(e => <tr key={e.id}><td><input type="checkbox" aria-label={`Select ${e.cycleName} for ${e.instructorName}`} checked={selected.includes(e.id)} disabled={e.status !== 'UNPAID' || e.amount <= 0} onChange={() => toggle(e)} /></td><td><strong>{e.cycleName}</strong><span className="payroll-branch" style={{ '--branch-color': getBranchColor(e.branch) }}>{e.branch}</span></td><td>{e.hours} h × {money(e.rate)} EGP</td><td className="number currency">{money(e.amount)} EGP</td><td><span className={`payroll-payment-status status-${e.status.toLowerCase()}`}>{statusLabels[e.status]}</span></td><td>{e.batch ? <div className="payroll-row-dates"><span>Initiated: {formatDate(e.batch.initiatedDate)}</span><span>Paid: {formatDate(e.batch.actualPaymentDate)}</span>{e.batch.legacy && <small>Legacy payment · dates unknown</small>}</div> : <span className="muted">Not initiated</span>}</td></tr>)}</tbody></table></div></>}</article>) : <div className="panel empty-state"><Wallet size={30} /><h3>No matching salary</h3><p>Employee salary appears when a cycle is completed with confirmed teaching hours.</p></div> : view === 'courses' ? courseGroups.length ? courseGroups.map(c => <article className="panel payroll-course" key={c.id}><div className="payroll-course-heading"><label><input type="checkbox" aria-label={`Select course ${c.name}`} disabled={!c.unpaid.length} checked={!!c.unpaid.length && c.unpaid.every(e=>selected.includes(e.id))} onChange={()=>selectCourse(c)} /><BookOpen size={21} /><span><strong>{c.name}</strong><span className="payroll-branch" style={{'--branch-color':getBranchColor(c.branch)}}>{c.branch}</span></span></label><div><span className={`payroll-payment-status status-${c.state.toLowerCase()}`}>{c.state === 'PARTIAL' ? 'Partly paid' : statusLabels[c.state]}</span><strong>{money(c.amount)} <small>EGP course cost</small></strong></div></div><div className="table-scroll"><table className="data-table payroll-course-table"><thead><tr><th>Employee</th><th>Hours × rate</th><th className="number">Salary</th><th>Payment status</th><th>Actual payment</th></tr></thead><tbody>{c.rows.map(row=><tr key={row.id}><td><strong dir="auto">{row.instructorName}</strong></td><td>{row.hours} h × {money(row.rate)} EGP</td><td className="number currency">{money(row.amount)} EGP</td><td><span className={`payroll-payment-status status-${row.status.toLowerCase()}`}>{statusLabels[row.status]}</span></td><td>{row.status === 'PAID' ? formatDate(row.batch?.actualPaymentDate) : 'Not paid yet'}</td></tr>)}</tbody></table></div><div className="payroll-course-actions"><span>Unpaid: <b>{money(c.unpaid.reduce((sum,e)=>sum+e.amount,0))} EGP</b> · Processing: <b>{money(c.processing.reduce((sum,e)=>sum+e.amount,0))} EGP</b></span>{!!c.unpaid.length && <button className="btn-secondary" onClick={()=>selectCourse(c)}>Select all unpaid employees</button>}{!!c.processing.length && <button className="btn-primary" onClick={()=>confirmCourse(c)}><CheckCircle size={15} />Confirm course payment</button>}</div></article>) : <div className="panel empty-state"><BookOpen size={30}/><h3>No matching course costs</h3><p>Unpaid courses remain available here. Paid courses appear in their actual payment month.</p></div> : dailyGroups.length ? dailyGroups.map(group => {
        const pending = group.payments.filter(p => p.status === 'PROCESSING');
        const paid = group.payments.filter(p => p.status === 'PAID');
        const paidInMonth = paid.filter(p => day(p.actualPaymentDate).slice(0,7) === month);
        return <article className="panel payroll-day-batch" key={group.id}>
          <div className="payroll-day-heading"><div><span className={`payroll-payment-status status-${pending.length ? 'processing' : 'paid'}`}>{pending.length ? paid.length ? 'Partly paid' : 'Processing' : 'Paid'}</span><h2>Payment batch · {group.date ? formatDate(group.date) : 'Undated legacy'}</h2><p>{group.payments.length} payments · {new Set(group.payments.map(p=>p.instructorId)).size} employees · {pending.length} pending</p></div><div className="payroll-day-total"><strong>{money(group.amount)} <small>EGP</small></strong><span>{money(paidInMonth.reduce((sum,p)=>sum+p.amount,0))} EGP paid in {monthLabel}</span></div></div>
          <div className="payroll-day-actions"><span>All payments initiated on this date are grouped together.</span>{!!paidInMonth.length && <><button className="btn-secondary export-format-pdf" disabled={exporting} onClick={()=>exportPaid(group)}><Download size={15}/>Batch PDF · {month}</button><button className="btn-secondary export-format-word" disabled={exporting} onClick={()=>exportPaid(group, 'docx')}><FileText size={15}/>Batch Word · {month}</button></>}{!!pending.length && <button className="btn-primary" onClick={()=>confirmDay(group)}><CheckCircle size={16}/>Confirm all pending ({pending.length})</button>}</div>
          <div className="payroll-day-payments">{group.payments.map(payment=><div className="payroll-day-payment" key={payment.id}><div><strong dir="auto">{payment.instructorName}</strong><p>{payment.earnings.map(e=>e.cycleName).join(' · ')}</p><small>Initiated {formatDate(payment.initiatedDate)}{payment.initiatedBy ? ` by @${payment.initiatedBy}` : ''}</small></div><div className="payroll-day-payment-state"><b>{money(payment.amount)} EGP</b><span className={`payroll-payment-status status-${payment.status.toLowerCase()}`}>{statusLabels[payment.status]}</span>{payment.status==='PAID'?<small>Paid {formatDate(payment.actualPaymentDate)}</small>:<button className="text-button" onClick={()=>showDialog(payment)}>Confirm individually<CheckCircle size={14}/></button>}</div></div>)}</div>
        </article>;
      }) : <div className="panel empty-state"><Clock3 size={30} /><h3>No matching payment batches</h3><p>Select unpaid cycle salary items to initiate a payment. Dates are recorded only when payment is initiated or confirmed.</p></div>}
      </MotionRegion>
      {!!chosen.length && view !== 'batches' && <div className="payroll-selection"><div><strong>{view === 'courses' ? `${new Set(chosen.map(e=>e.courseId)).size} selected courses` : new Set(chosen.map(e=>e.instructorId)).size > 1 ? `${new Set(chosen.map(e=>e.instructorId)).size} selected employees` : chosen[0].instructorName}</strong><span>{chosen.length} salary items · {money(chosen.reduce((sum, e) => sum + e.amount, 0))} EGP</span></div><button className="text-button" onClick={() => setSelected([])}>Clear</button><button className="btn-primary" onClick={() => showDialog()}><Plus size={16} />Initiate payment</button></div>}
    </>}</MotionRegion>
    <AnimatePresence>{dialog && <Dialog title={dialog.batch ? "Confirm employee payment" : "Initiate employee payment"} onClose={saving ? () => {} : () => setDialog(null)}><div className="modal-content card payroll-payment-dialog"><h2>{dialog.batch ? 'Confirm actual payment' : 'Start payment processing'}</h2><p>{dialog.batch?.instructorName || (dialog.coursePayment ? "All unpaid employees in the selected courses" : new Set(dialog.rows.map(e=>e.instructorId)).size > 1 ? `${new Set(dialog.rows.map(e=>e.instructorId)).size} selected employees` : dialog.rows[0]?.instructorName)}</p><div className="payroll-confirm-total"><span>{(dialog.batch?.earnings || dialog.rows).length} salary items</span><strong>{money(dialog.batch?.amount ?? dialog.rows.reduce((sum, e) => sum + e.amount, 0))} EGP</strong></div><ul>{(dialog.batch?.earnings || dialog.rows).map(e => <li key={e.id}><span>{e.cycleName}{(dialog.coursePayment || dialog.batch?.coursePayment || dialog.batch?.dailyPayment || new Set((dialog.batch?.earnings || dialog.rows).map(row=>row.instructorId)).size > 1) && <small> · {e.instructorName}</small>}</span><strong>{money(e.amount)} EGP</strong></li>)}</ul><form onSubmit={save}>{dialog.batch && <p className="payroll-initiation-reference">Initiated {formatDate(dialog.batch.initiatedDate)} · This date will be kept.</p>}<label htmlFor="instructor-payment-date">{dialog.batch ? 'Actual payment date' : 'Payment initiation date'} <span>*</span></label><input id="instructor-payment-date" className="input-field" type="date" required min={dialog.batch ? day(dialog.batch.initiatedDate) : undefined} max={today()} value={paymentDay} onChange={e => setPaymentDay(e.target.value)} /><p className="policy-note">{dialog.batch ? "Confirm only after the employee has actually received this payment." : 'This salary will move to Processing. The actual payment date stays empty until you confirm payment.'}</p>{dialogError && <div className="alert-error" role="alert">{dialogError}</div>}<div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : dialog.batch ? 'Mark as paid' : 'Start processing'}</button></div></form></div></Dialog>}</AnimatePresence>
  </section>;
}

function InstructorSalarySelection({ rows, selected, name, onToggle }) {
  const ids = rows.map(row => row.id);
  const count = ids.filter(id => selected.includes(id)).length;
  return <div className="payroll-instructor-select-all"><label><input type="checkbox" aria-label={`Select all unpaid salary for ${name}`} checked={ids.length > 0 && count === ids.length} disabled={!ids.length} ref={node => { if (node) node.indeterminate = count > 0 && count < ids.length; }} onChange={() => onToggle(ids)} /><span><strong>Select all unpaid salary</strong><small>{ids.length ? `${ids.length} cycles · ${money(rows.reduce((sum, row) => sum + row.amount, 0))} EGP · across all branches` : "No unpaid salary for this employee"}</small></span></label></div>;
}
