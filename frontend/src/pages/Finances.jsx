import { cyclePath } from '../utils/cyclePath';
import DateInput from '../components/DateInput';
import PrivateBadge from '../components/PrivateBadge';
import {salaryReportTitle} from '../utils/salaryReportTitle';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import payrollReportStyles from '../styles/_payrollReport.scss?inline';
import { AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Wallet, Clock3, CheckCircle, ChevronDown, Plus, Search, ArrowUpRight, Download, FileText, Calendar } from 'lucide-react';
import { PageHeading, Metric, money, initials } from '../components/WorkspaceUI';
import { MotionRegion, MotionTab, CalmRegion } from '../components/WorkspaceMotion';
import CustomFilterDropdown from '../components/CustomFilterDropdown';
import ExcelExportButton from '../components/ExcelExportButton';
import Dialog from '../components/Dialog';
import AnimatedNumber from '../components/AnimatedNumber';
import { getBranchColor } from '../utils/branchColors';
import '../styles/_instructorPayroll.scss';
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Cairo' });
const day = value => value ? value.slice(0, 10) : '';
const formatDate = value => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }) : 'Not recorded';
const statusLabels = { UNPAID: 'Unpaid', PROCESSING: 'Processing', PAID: 'Paid' };
const runStateLabels = { PROCESSING: 'Processing', PARTIAL: 'Partly paid', PAID: 'Paid', CANCELLED: 'Cancelled' };
const runLabel = run => run ? `Payment batch ${run.number} · ${new Date(Date.UTC(run.year, run.month - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}` : 'Payment batch';

export default function Finances() {
  const [params, setParams] = useSearchParams();
  const rawParam = params.get('month') || '';
  // The period is a month (YYYY-MM), a year (YYYY) or a range of months (YYYY-MM:YYYY-MM).
  const validPeriod = /^(\d{4}|\d{4}-(0[1-9]|1[0-2])|\d{4}-(0[1-9]|1[0-2]):\d{4}-(0[1-9]|1[0-2]))$/.test(rawParam) && !(rawParam.includes(':') && rawParam.slice(0, 7) > rawParam.slice(8));
  const month = validPeriod ? rawParam : today().slice(0, 7);
  const isYearView = month.length === 4;
  const isRangeView = month.includes(':');
  const periodMode = isYearView ? 'year' : isRangeView ? 'range' : 'month';
  const currentYear = month.slice(0, 4);
  const rangeFrom = isRangeView ? month.slice(0, 7) : isYearView ? `${month}-01` : month;
  const rangeTo = isRangeView ? month.slice(8) : isYearView ? `${month}-12` : month;
  const labelOf = value => new Date(`${value}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthLabel = isYearView ? `Full Year ${month}` : isRangeView ? `${labelOf(rangeFrom)} – ${labelOf(rangeTo)}` : labelOf(month);
  // Labels inside the content follow the data on screen, so they change together with the figures.
  const periodLabel = value => /^\d{4}$/.test(value) ? `Full Year ${value}` : value.includes(':') ? `${labelOf(value.slice(0, 7))} – ${labelOf(value.slice(8))}` : labelOf(value);
  const setPeriod = value => { setParams({ month: value }); setSelected([]); setReturnIds([]); setUndoPaidIds([]); };
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const shownLabel = periodLabel(data?.monthly?.month || month);
  const [view, setView] = useState('earnings'), [status, setStatus] = useState('UNPAID'), [branch, setBranch] = useState(''), [search, setSearch] = useState('');
  const [returnIds,setReturnIds]=useState([]),[rollback,setRollback]=useState(null);
  const [undoPaidIds,setUndoPaidIds]=useState([]),[undoPaid,setUndoPaid]=useState(null);
  const [joinRunId,setJoinRunId]=useState('');
  // Payment batches start closed; each opens on click.
  const [expandedRuns,setExpandedRuns]=useState([]);
  const toggleRun=id=>setExpandedRuns(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);
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
  const isPeriodMatch = (val) => { if (!val) return false; const s = day(val); if (isRangeView) return s.slice(0, 7) >= rangeFrom && s.slice(0, 7) <= rangeTo; return isYearView ? s.slice(0, 4) === month : s.slice(0, 7) === month; };
  const paidThisMonth = row => row.status === 'PAID' && isPeriodMatch(row.batch?.actualPaymentDate);
  const filtered = earnings.filter(e => (e.status !== 'PAID' || paidThisMonth(e)) && (!status || e.status === status) && (!branch || e.branch === branch) && (!search.trim() || `${e.instructorName} ${e.employeeId || ''} ${e.cycleName}`.toLowerCase().includes(search.trim().toLowerCase())));
  const groups = Object.values(filtered.reduce((map, e) => { const group = map[e.instructorId] ||= { id: e.instructorId, name: e.instructorName, employeeId: e.employeeId, rows: [], amount: 0 }; group.rows.push(e); group.amount += e.amount; return map; }, {}));
  // Numbered payment batches: every payment belongs to one run ("Payment batch 2 · October 2026").
  const matchesPayment = p => (!branch || p.earnings.some(e => e.branch === branch)) && (!search.trim() || `${p.instructorName} ${p.earnings.map(e => e.cycleName).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()));
  const runGroups = Object.values((data?.batches || []).reduce((map, payment) => {
    const group = map[payment.runId] ||= { id: payment.runId, run: payment.run, date: payment.run?.initiatedDate || payment.initiatedDate, payments: [] };
    group.payments.push(payment); return map;
  }, {})).map(group => {
    const active = group.payments.filter(p => p.status !== 'CANCELLED');
    const processing = active.filter(p => p.status === 'PROCESSING'), paid = active.filter(p => p.status === 'PAID');
    const state = !active.length ? 'CANCELLED' : processing.length ? (paid.length ? 'PARTIAL' : 'PROCESSING') : 'PAID';
    return { ...group, active, processing, paid, state, amount: active.reduce((sum, p) => sum + p.amount, 0) };
  });
  const visibleRuns = runGroups.filter(group => {
    if (status === 'CANCELLED' || group.state === 'CANCELLED') return status === 'CANCELLED' && group.state === 'CANCELLED' && (!search.trim() || group.payments.some(matchesPayment));
    if (!group.active.some(matchesPayment)) return false;
    const paidInPeriod = group.paid.some(p => isPeriodMatch(p.actualPaymentDate));
    if (status === 'PROCESSING') return group.processing.length > 0;
    if (status === 'PAID') return paidInPeriod;
    return group.processing.length > 0 || paidInPeriod;
  }).sort((a, b) => (b.run?.year ?? 0) - (a.run?.year ?? 0) || (b.run?.month ?? 0) - (a.run?.month ?? 0) || (b.run?.number ?? 0) - (a.run?.number ?? 0));
  const runPaymentDate = group => {
    if (group.state === 'CANCELLED') return 'Cancelled';
    if (group.state !== 'PAID') return group.paid.length ? `— · ${group.paid.length} of ${group.active.length} paid` : '—';
    const dates = [...new Set(group.paid.map(p => day(p.actualPaymentDate)))].sort();
    return dates.length === 1 ? formatDate(dates[0]) : `${formatDate(dates[0])} – ${formatDate(dates.at(-1))}`;
  };
  // Batch reports keep their previous contents: pending payments plus payments paid in the selected month.
  const reportGroup = group => ({ id: group.id, payments: group.active.filter(p => p.status === 'PROCESSING' || isPeriodMatch(p.actualPaymentDate)) });
  const openRuns = runGroups.filter(group => group.processing.length > 0);
  const confirmRun = group => {
    showDialog({ runPayment: true, runId: group.id, batchIds: group.processing.map(payment => payment.id), instructorName: runLabel(group.run), earnings: group.processing.flatMap(payment => payment.earnings), amount: group.processing.reduce((sum, payment) => sum + payment.amount, 0), initiatedDate: group.date });
  };
  const joinRun = joinRunId ? openRuns.find(group => group.id === joinRunId) : null;
  const renderPayment = payment => <div className="payroll-day-payment" key={payment.id}><div><strong dir="auto">{payment.instructorName}</strong><p>{payment.earnings.map(e=>e.cycleName+(e.isPrivate?' (Private)':'')).join(' · ')}</p>{payment.status==='PAID'&&<div className="management-choice"><label className="policy-check"><input type="checkbox" checked={payment.earnings.every(e=>undoPaidIds.includes(e.id))} onChange={()=>toggleUndo(payment.earnings.map(e=>e.id))}/>Select this paid payment to mark as not paid</label>{payment.earnings.length>1&&payment.earnings.map(e=><label className="policy-check" key={e.id}><input type="checkbox" checked={undoPaidIds.includes(e.id)} onChange={()=>toggleUndo([e.id])}/>{e.cycleName}<PrivateBadge record={e}/> · {money(e.amount)} EGP</label>)}</div>}{payment.status==='PROCESSING'&&<div className="management-choice"><label className="policy-check"><input type="checkbox" checked={payment.earnings.every(e=>returnIds.includes(e.id))} onChange={()=>toggleReturn(payment.earnings.map(e=>e.id))}/>Select all payments for this employee</label>{payment.earnings.map(e=><label className="policy-check" key={e.id}><input type="checkbox" checked={returnIds.includes(e.id)} onChange={()=>toggleReturn([e.id])}/>{e.cycleName}<PrivateBadge record={e}/> · {money(e.amount)} EGP</label>)}</div>}<small>Initiated {formatDate(payment.initiatedDate)}{payment.initiatedBy ? ` by @${payment.initiatedBy}` : ''}</small></div><div className="payroll-day-payment-state"><b>{money(payment.amount)} EGP</b><span className={`payroll-payment-status status-${payment.status.toLowerCase()}`}>{statusLabels[payment.status]}</span>{payment.status==='PAID'?<><small>Paid {formatDate(payment.actualPaymentDate)}</small><button className="text-button management-danger" onClick={()=>openUndoPaid(payment.earnings.map(e=>({...e,status:'PAID'})))}>Mark as not paid</button></>:<button className="text-button" onClick={()=>showDialog(payment)}>Confirm individually<CheckCircle size={14}/></button>}</div></div>;
  const toggle = earning => {
    if(earning.status==='PROCESSING'){toggleReturn([earning.id]);return;}
    if(earning.status==='PAID'){toggleUndo([earning.id]);return;}
    if (earning.status !== 'UNPAID' || earning.amount <= 0) return;
    setSelected(ids => ids.includes(earning.id) ? ids.filter(id => id !== earning.id) : [...ids, earning.id]);
  };
  const showDialog = batch => { setDialog(batch ? { batch } : { key: crypto.randomUUID(), rows: chosen.map(e => ({ ...e })) }); setPaymentDay(today()); setJoinRunId(''); setDialogError(''); };
  const save = async e => {
    e.preventDefault(); if (busy.current) return;
    busy.current = true; setSaving(true); setDialogError('');
    try {
      const { data } = dialog.batch ? await axios.post(dialog.batch.runPayment ? `/finances/runs/${dialog.batch.runId}/pay` : `/finances/batches/${dialog.batch.id}/pay`, { actualPaymentDate: paymentDay, ...(dialog.batch.runPayment ? { batchIds: dialog.batch.batchIds } : {}) }) : await axios.post('/finances/selected-payments', { earningIds: dialog.rows.map(e => e.id), versions: Object.fromEntries(dialog.rows.map(e => [e.id, e.updatedAt])), initiatedDate: joinRun ? day(joinRun.date) : paymentDay, runId: joinRun?.id, idempotencyKey: dialog.key });
      toast.success(data.message); setDialog(null); setSelected([]);setReturnIds([]);setUndoPaidIds([]);
      // A newly started payment lives in its batch: show it there.
      if (!dialog.batch) { setView('batches'); setStatus('PROCESSING'); }
      await load(true); window.dispatchEvent(new Event('assignments-updated'));
    } catch (e) { setDialogError(e.response?.data?.error || 'Payment could not be saved.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const toggleReturn=ids=>setReturnIds(current=>ids.every(id=>current.includes(id))?current.filter(id=>!ids.includes(id)):[...new Set([...current,...ids])]);
  const toggleUndo=ids=>setUndoPaidIds(current=>ids.every(id=>current.includes(id))?current.filter(id=>!ids.includes(id)):[...new Set([...current,...ids])]);
  const openUndoPaid=rows=>{setUndoPaid(rows.filter(e=>e.status==='PAID'));setDialogError('');};
  const returnToProcessing=async()=>{if(busy.current)return;busy.current=true;setSaving(true);try{const {data}=await axios.post('/finances/return-to-processing',{earningIds:undoPaid.map(e=>e.id),versions:Object.fromEntries(undoPaid.map(e=>[e.id,e.updatedAt]))});toast.success(data.message);setUndoPaid(null);setUndoPaidIds([]);await load(true);}catch(e){setDialogError(e.response?.data?.error||'Could not update these payments.');}finally{busy.current=false;setSaving(false);}};
  const openRollback=rows=>{setRollback(rows.filter(e=>e.status==='PROCESSING'));setDialogError('');};
  const returnToUnpaid=async()=>{if(busy.current)return;busy.current=true;setSaving(true);try{const {data}=await axios.post('/finances/return-to-unpaid',{earningIds:rollback.map(e=>e.id),versions:Object.fromEntries(rollback.map(e=>[e.id,e.updatedAt]))});toast.success(data.message);setRollback(null);setReturnIds([]);setUndoPaidIds([]);await load(true);window.dispatchEvent(new Event('assignments-updated'));}catch(e){setDialogError(e.response?.data?.error||'Could not return payments.');}finally{busy.current=false;setSaving(false);}};
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const exportPaid = async (group = null, format = "pdf") => {
    let reportInstructors = data?.monthly?.instructors || [];
    if (group) {
      const instructors = new Map();
      for (const payment of group.payments.filter(p => ['PAID','PROCESSING'].includes(p.status))) for (const salary of payment.earnings) {
        const row = instructors.get(salary.instructorId) || { name: salary.instructorName, employeeId: salary.employeeId, amountMinor: 0n };
        row.amountMinor += BigInt(salary.amountMinor); instructors.set(salary.instructorId, row);
      }
      reportInstructors = [...instructors.values()].map(row => ({ ...row, totalPaid: Number(row.amountMinor)/100 })).sort((a,b)=>b.totalPaid-a.totalPaid);
    }
    if (exporting || !data?.monthly || data.monthly.month !== month || reportInstructors.length === 0) return;
    setExporting(true);
    try {
      await axios.post('/exports/events',{format,status:'STARTED',month,batchId:group?.id});
      if (format === 'docx') {
        const { createSalaryWordReport } = await import('../utils/salaryWordReport');
        const blob = await createSalaryWordReport(reportInstructors, month);
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = `Payroll_Report_${month.replace(":", "_to_")}${group ? '_Batch_' + group.id : ''}.docx`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        await axios.post('/exports/events',{format,status:'SUCCESS',month,batchId:group?.id});
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
        <h2 class="payroll-report-cell-9">${escapeHTML(salaryReportTitle(month))}</h2>
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
        filename: `Payroll_Report_${month.replace(":", "_to_")}${group ? "_Batch_" + group.id : ""}_${new Date().getTime()}.pdf`,
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
      await axios.post('/exports/events',{format,status:'SUCCESS',month,batchId:group?.id});
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      await axios.post('/exports/events',{format,status:'FAILURE',month,batchId:group?.id,message:'Report generation failed in the browser.'}).catch(()=>{});
      toast.error('Could not export the report. Please try again.');
    } finally {
      setExporting(false);
    }
  };
  return <section className="instructor-payroll">
    <PageHeading eyebrow="INSTRUCTOR SALARY" title="Payroll" description="Monthly paid salary, with unpaid and processing salary ready to manage."><div className="payroll-header-actions"><div className="period-picker"><div className="period-controls">
  {/* All three controls share one fixed spot and cross-fade; the Month / Range / Year buttons never move. */}
  <div className={`period-slot${periodMode === 'month' ? ' on' : ''}`} inert={!(periodMode === 'month')}><label className="month-control"><Calendar size={15} /><input aria-label="Salary report month" type="month" required value={rangeFrom} onChange={e => { if (e.target.value) setPeriod(e.target.value); }} /></label></div>
  <div className={`period-slot${periodMode === 'range' ? ' on' : ''}`} inert={!(periodMode === 'range')}><label className="month-control"><Calendar size={15} />From<input aria-label="First month" type="month" required value={rangeFrom} max={rangeTo} onChange={e => { if (e.target.value) setPeriod(`${e.target.value}:${e.target.value > rangeTo ? e.target.value : rangeTo}`); }} /></label><label className="month-control"><Calendar size={15} />To<input aria-label="Last month" type="month" required value={rangeTo} min={rangeFrom} onChange={e => { if (e.target.value) setPeriod(`${e.target.value < rangeFrom ? e.target.value : rangeFrom}:${e.target.value}`); }} /></label></div>
  <div className={`period-slot${periodMode === 'year' ? ' on' : ''}`} inert={!(periodMode === 'year')}><label className="month-control"><Calendar size={15} /><select aria-label="Salary report year" value={currentYear} onChange={e => setPeriod(e.target.value)}>{[1, 0, -1, -2, -3].map(offset => String(new Date().getFullYear() + offset)).map(yr => <option key={yr} value={yr}>{yr}</option>)}</select></label></div></div><div className="period-modes" role="group" aria-label="Salary period">{[['month', 'Month'], ['range', 'Range'], ['year', 'Year']].map(([value, label]) => <button key={value} type="button" className={periodMode === value ? 'active' : ''} aria-pressed={periodMode === value} onClick={() => setPeriod(value === 'year' ? currentYear : value === 'range' ? `${rangeFrom}:${rangeTo}` : rangeFrom)}>{label}</button>)}</div>
  </div><div className="payroll-exports"><ExcelExportButton key={month} initialMonth={periodMode === 'month' ? month : undefined} salaryMonth={month} /><button className="btn-secondary export-format-pdf" onClick={() => exportPaid()} disabled={exporting || loading || !data?.monthly?.instructors.length || data.monthly.month !== month}><Download size={15} />{exporting ? 'Preparing report…' : 'Export PDF'}</button><button className="btn-secondary export-format-word" onClick={() => exportPaid(null, 'docx')} disabled={exporting || loading || !data?.monthly?.instructors.length || data.monthly.month !== month}><FileText size={15}/>Export Word</button></div></div></PageHeading>
    {/* Changing the period keeps the page in place: only the numbers and rows update. */}
    <MotionRegion transitionKey={error ? 'error' : !data ? 'loading' : 'ready'} className={`salary-month-content${loading && data ? ' is-refreshing' : ''}`}>{error ? <div className="panel empty-state"><h3>{error}</h3><button className="btn-secondary" onClick={() => load()}>Try again</button></div> : !data ? <div className="loading-state"><span className="loading-spinner" />Loading employee salary…</div> : <>
      <div className="metric-grid payroll-summary"><Metric tone="teal" label="Salary paid" value={<><small>EGP</small><AnimatedNumber value={data.monthly?.totalPaid || 0} /></>} detail={shownLabel + ' · actual payment date'} /><Metric label="Employees paid" value={<AnimatedNumber value={data.monthly?.instructorsPaid || 0} />} detail={'Received payment in ' + shownLabel} /><Metric tone="violet" label="Cycles paid" value={<AnimatedNumber value={data.monthly?.cyclesPaid || 0} />} detail="Cycles with salary payments in this period" /><Metric tone="peach" label="Payments completed" value={<AnimatedNumber value={data.monthly?.paymentsCompleted || 0} />} detail="Confirmed batches in the selected period" /></div>
      {!!data.needsAllocation?.length && <div className="payroll-allocation-note"><Clock3 size={19} /><div><strong>{data.needsAllocation.length} completed cycles need teaching details</strong><p>Confirm their employees and taught hours before payroll can be recorded.</p><div>{data.needsAllocation.map(c => <Link key={c.id} to={cyclePath(c)} state={{ search: c.name }}>{c.name}<PrivateBadge record={c}/><ArrowUpRight size={13} /></Link>)}</div></div></div>}
      <div className="section-tabs" aria-label="Payroll views"><MotionTab active={view === 'earnings'} onClick={() => { setView('earnings'); setStatus('UNPAID'); setSelected([]);setReturnIds([]);setUndoPaidIds([]); }}>Employee salary</MotionTab><MotionTab active={view === 'batches'} onClick={() => { setView('batches'); setStatus('PROCESSING'); setSelected([]);setReturnIds([]);setUndoPaidIds([]); }}>Payment batches{(() => { const waiting = new Set(data.batches.filter(b => b.status === 'PROCESSING').map(b => b.runId || day(b.initiatedDate))).size; return waiting > 0 && <span className="payroll-batch-count" title={`${waiting} batch${waiting === 1 ? '' : 'es'} waiting for payment`}>{waiting}</span>; })()}</MotionTab></div>
      <div className="panel payroll-controls"><div className="payroll-status-tabs">{[['', 'All'], ...(view !== 'batches' ? [['UNPAID', 'Unpaid']] : []), ['PROCESSING', 'Processing'], ['PAID', 'Paid']].map(([value, label]) => <button key={value} type="button" className={status === value ? 'active' : ''} aria-pressed={status === value} onClick={() => { setStatus(value); setSelected([]);setReturnIds([]);setUndoPaidIds([]); }}>{label}</button>)}{view === 'batches' && <button type="button" className={`payroll-status-cancelled${status === 'CANCELLED' ? ' active' : ''}`} aria-pressed={status === 'CANCELLED'} onClick={() => { setStatus('CANCELLED'); setSelected([]);setReturnIds([]);setUndoPaidIds([]); }}>Cancelled</button>}</div><div className="filter-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Search payroll" placeholder="Find an employee or cycle…" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="filter-select"><CustomFilterDropdown value={branch} onChange={setBranch} placeholder="All branches" options={[...new Set(earnings.map(e => e.branch))].map(value => ({ value, label: value }))} /></div></div></div>
      <p className="payroll-month-explanation">Paid salary: {shownLabel}, by actual payment date. Unpaid and processing salary: all dates. Legacy payments without a known date are not assigned to a month.</p>
      <CalmRegion transitionKey={`${data.monthly?.month}:${view}:${status}:${branch}`} className="payroll-content">
      {view === 'earnings' ? groups.length ? groups.map((group, index) => <article className="panel payroll-instructor" key={group.id}><button className="payroll-instructor-heading" aria-expanded={expanded[group.id] ?? index === 0} onClick={() => setExpanded(state => ({ ...state, [group.id]: !(state[group.id] ?? index === 0) }))}><span className="payroll-avatar">{initials(group.name)}</span><span className="payroll-instructor-name"><strong dir="auto">{group.name}</strong><small>{group.employeeId || "Employee"} · {group.rows.length} cycle salary items</small></span><span className="payroll-instructor-amount">{money(group.amount)}<small> EGP</small></span><ChevronDown size={18} /></button><InstructorSalarySelection mode={status==='PROCESSING'?'processing':status==='PAID'?'paid':'unpaid'} rows={(status==='PAID'?group.rows:earnings).filter(e => e.instructorId === group.id && e.status === (status==='PROCESSING'?'PROCESSING':status==='PAID'?'PAID':'UNPAID') && e.amount > 0)} selected={status==='PROCESSING'?returnIds:status==='PAID'?undoPaidIds:selected} name={group.name} onToggle={ids => status==='PROCESSING'?toggleReturn(ids):status==='PAID'?toggleUndo(ids):setSelected(current => ids.every(id => current.includes(id)) ? current.filter(id => !ids.includes(id)) : [...new Set([...current, ...ids])])} />{(expanded[group.id] ?? index === 0) && <><div className="table-scroll"><table className="data-table payroll-earnings-table"><thead><tr><th className="select-column">Select</th><th>Cycle / branch</th><th>Hours × rate</th><th className="number">Salary</th><th>Status</th><th>Payment dates</th></tr></thead><tbody>{group.rows.map(e => <tr key={e.id}><td className="select-column"><input type="checkbox" aria-label={`Select ${e.cycleName} for ${e.instructorName}`} checked={e.status==='PROCESSING'?returnIds.includes(e.id):e.status==='PAID'?undoPaidIds.includes(e.id):selected.includes(e.id)} disabled={e.amount <= 0} onChange={() => toggle(e)} /></td><td><strong>{e.cycleName}<PrivateBadge record={e}/></strong><span className="payroll-branch" style={{ '--branch-color': getBranchColor(e.branch) }}>{e.branch}</span>{e.isPrivate && <div className="text-xs text-slate-600 mt-1">{e.startDate && <span>📅 Start: {formatDate(e.startDate)} · </span>}<span>👤 {e.students?.join(', ') || 'Private students'}</span></div>}</td><td>{e.hours} h × {money(e.rate)} EGP</td><td className="number currency">{money(e.amount)} EGP</td><td><span className={`payroll-payment-status status-${e.status.toLowerCase()}`}>{statusLabels[e.status]}</span></td><td>{e.batch ? <div className="payroll-row-dates">{e.batch.run && <strong>{runLabel(e.batch.run)}</strong>}<span>Initiated: {formatDate(e.batch.initiatedDate)}</span><span>Paid: {formatDate(e.batch.actualPaymentDate)}</span>{e.batch.legacy && <small>Payment date not recorded</small>}</div> : <span className="muted">Not initiated</span>}</td></tr>)}</tbody></table></div></>}</article>) : <div className="panel empty-state"><Wallet size={30} /><h3>No matching salary</h3><p>Employee salary appears when a cycle is completed with confirmed teaching hours.</p></div> : visibleRuns.length ? visibleRuns.map(group => {
        const paidInMonth = group.paid.filter(p => isPeriodMatch(p.actualPaymentDate));
        const open = expandedRuns.includes(group.id);
        const sections = group.state === 'CANCELLED' ? [] : status === 'PAID'
          ? [['paid', 'Paid', group.paid], ['processing', 'Still processing', group.processing]]
          : [['processing', 'Waiting for payment', group.processing], ['paid', 'Already paid', group.paid]];
        return <article className={`panel payroll-day-batch payroll-run state-${group.state.toLowerCase()}${open ? ' is-open' : ''}`} key={group.id}>
          <div className="payroll-day-heading payroll-run-toggle" role="button" tabIndex={0} aria-expanded={open} aria-label={`${open ? 'Close' : 'Open'} ${runLabel(group.run)}`} onClick={() => toggleRun(group.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRun(group.id); } }}><div><span className={`payroll-payment-status status-${group.state === 'PARTIAL' ? 'processing' : group.state.toLowerCase()}`}>{runStateLabels[group.state]}</span><h2>{runLabel(group.run)}</h2><p className="payroll-run-dates"><span className="run-date run-date-initiated">Initiation date <b>{formatDate(group.date)}</b></span><span className={`run-date run-date-payment is-${group.state === 'PAID' ? 'paid' : group.state === 'CANCELLED' ? 'cancelled' : 'pending'}`}>Payment date <b>{runPaymentDate(group)}</b></span></p>{group.state !== 'CANCELLED' && <p>{group.active.length} payments · {new Set(group.active.map(p => p.instructorId)).size} employees · {group.processing.length} pending</p>}</div>{group.state !== 'CANCELLED' && <div className="payroll-day-total"><strong>{money(group.amount)} <small>EGP</small></strong><span>{money(paidInMonth.reduce((sum, p) => sum + p.amount, 0))} EGP paid in {monthLabel}</span></div>}<ChevronDown size={20} className="payroll-run-chevron" aria-hidden="true" /></div>
          {open && <>{group.state === 'CANCELLED' ? <p className="payroll-run-cancelled">Every payment in this batch was returned to unpaid. Its number stays reserved so batch numbers keep matching what happened.</p> : <div className="payroll-day-actions"><span>{group.processing.length ? 'Confirm pending payments together, or one by one below.' : 'All payments in this batch are paid.'}</span><button className="btn-secondary export-format-pdf" disabled={exporting} onClick={() => exportPaid(reportGroup(group))}><Download size={15} />Batch PDF</button><button className="btn-secondary export-format-word" disabled={exporting} onClick={() => exportPaid(reportGroup(group), 'docx')}><FileText size={15} />Batch Word</button>{!!group.processing.length && <button className="btn-secondary management-danger" onClick={() => openRollback(group.processing.flatMap(p => p.earnings))}>Return all processing to unpaid</button>}{!!group.processing.length && <button className="btn-primary" onClick={() => confirmRun(group)}><CheckCircle size={16} />Confirm all pending ({group.processing.length})</button>}</div>}
          {sections.filter(([, , payments]) => payments.length).map(([key, title, payments], index) => <section key={key} className={`payroll-run-section section-${key}${index ? ' is-secondary' : ''}`}><h3>{title} <span>{payments.length} · {money(payments.reduce((sum, p) => sum + p.amount, 0))} EGP</span></h3><div className="payroll-day-payments">{payments.map(renderPayment)}</div></section>)}</>}
        </article>;
      }) : <div className="panel empty-state"><Clock3 size={30} /><h3>{status === 'CANCELLED' ? 'No cancelled payment batches' : 'No matching payment batches'}</h3><p>{status === 'CANCELLED' ? 'A batch appears here when every payment in it was returned to unpaid.' : 'Select unpaid cycle salary items to initiate a payment. Each initiation creates a numbered batch for its month.'}</p></div>}
      </CalmRegion>
      {!!chosen.length && view !== 'batches' && <div className="payroll-selection"><div><strong>{new Set(chosen.map(e=>e.instructorId)).size > 1 ? `${new Set(chosen.map(e=>e.instructorId)).size} selected employees` : chosen[0].instructorName}</strong><span>{chosen.length} salary items · {money(chosen.reduce((sum, e) => sum + e.amount, 0))} EGP</span></div><button className="text-button" onClick={() => setSelected([])}>Clear</button><button className="btn-primary" onClick={() => showDialog()}><Plus size={16} />Initiate payment</button></div>}
    </>}</MotionRegion>
    {undoPaidIds.some(id=>earnings.some(e=>e.id===id&&e.status==='PAID'))&&<div className="payroll-selection"><strong>{undoPaidIds.length} paid items selected</strong><button className="text-button" onClick={()=>setUndoPaidIds([])}>Clear</button><button className="btn-secondary management-danger" onClick={()=>openUndoPaid(earnings.filter(e=>undoPaidIds.includes(e.id)))}>Mark selected as not paid</button></div>}
    <AnimatePresence>{undoPaid&&<Dialog title="Mark payments as not paid" onClose={saving?()=>{}:()=>setUndoPaid(null)}><div className="modal-content card enrollment-dialog"><h3>Mark {undoPaid.length} salary items as not paid?</h3><p>Use this when a payment was confirmed by mistake. These items go back to Processing: their initiation date is kept, the actual payment date is cleared, and they leave this month's paid reports. Other items in the same batch stay paid. You can then confirm them again, or return them to unpaid.</p><ul>{undoPaid.map(e=><li key={e.id}>{e.instructorName} · {e.cycleName}<PrivateBadge record={e}/> · {money(e.amount)} EGP</li>)}</ul>{dialogError&&<p className="alert-error" role="alert">{dialogError}</p>}<div className="payment-entry-actions"><button className="btn-secondary" disabled={saving} onClick={()=>setUndoPaid(null)}>Cancel</button><button className="btn-primary" disabled={saving} onClick={returnToProcessing}>{saving?'Saving…':'Mark as not paid'}</button></div></div></Dialog>}</AnimatePresence>
    {returnIds.some(id=>earnings.some(e=>e.id===id&&e.status==='PROCESSING'))&&<div className="payroll-selection"><strong>{returnIds.length} processing items selected</strong><button className="text-button" onClick={()=>setReturnIds([])}>Clear</button><button className="btn-secondary management-danger" onClick={()=>openRollback(earnings.filter(e=>returnIds.includes(e.id)))}>Return selected to unpaid</button></div>}
    <AnimatePresence>{rollback&&<Dialog title="Return payments to unpaid" onClose={saving?()=>{}:()=>setRollback(null)}><div className="modal-content card enrollment-dialog"><h3>Return {rollback.length} salary items to unpaid?</h3><p>Only these items leave Processing. Remaining items keep their current batch. Paid items are not affected.</p><ul>{rollback.map(e=><li key={e.id}>{e.instructorName} · {e.cycleName}<PrivateBadge record={e}/> · {money(e.amount)} EGP</li>)}</ul>{dialogError&&<p className="alert-error" role="alert">{dialogError}</p>}<div className="payment-entry-actions"><button className="btn-secondary" disabled={saving} onClick={()=>setRollback(null)}>Cancel</button><button className="btn-primary" disabled={saving} onClick={returnToUnpaid}>{saving?'Saving…':'Return to unpaid'}</button></div></div></Dialog>}</AnimatePresence>
    <AnimatePresence>{dialog && <Dialog title={dialog.batch ? "Confirm employee payment" : "Initiate employee payment"} onClose={saving ? () => {} : () => setDialog(null)}><div className="modal-content card payroll-payment-dialog"><h2>{dialog.batch ? 'Confirm actual payment' : 'Start payment processing'}</h2><p>{dialog.batch?.instructorName || (new Set(dialog.rows.map(e=>e.instructorId)).size > 1 ? `${new Set(dialog.rows.map(e=>e.instructorId)).size} selected employees` : dialog.rows[0]?.instructorName)}</p><div className="payroll-confirm-total"><span>{(dialog.batch?.earnings || dialog.rows).length} salary items</span><strong>{money(dialog.batch?.amount ?? dialog.rows.reduce((sum, e) => sum + e.amount, 0))} EGP</strong></div><ul>{(dialog.batch?.earnings || dialog.rows).map(e => <li key={e.id}><span>{e.cycleName}<PrivateBadge record={e}/>{(dialog.batch?.dailyPayment || new Set((dialog.batch?.earnings || dialog.rows).map(row=>row.instructorId)).size > 1) && <small> · {e.instructorName}</small>}</span><strong>{money(e.amount)} EGP</strong></li>)}</ul><form onSubmit={save}>{!dialog.batch && openRuns.length > 0 && <fieldset className="payroll-run-choice"><legend>Payment batch</legend><label className="policy-check"><input type="radio" name="payment-run" checked={!joinRunId} onChange={() => setJoinRunId('')} />Start a new payment batch</label><label className="policy-check"><input type="radio" name="payment-run" checked={Boolean(joinRunId)} onChange={() => setJoinRunId(openRuns[0].id)} />Add to a batch that is still processing</label>{joinRunId && <select className="input-field" aria-label="Batch to add to" value={joinRunId} onChange={e => setJoinRunId(e.target.value)}>{openRuns.map(group => <option key={group.id} value={group.id}>{runLabel(group.run)} · initiated {formatDate(group.date)}</option>)}</select>}</fieldset>}{dialog.batch && <p className="payroll-initiation-reference">Initiated {formatDate(dialog.batch.initiatedDate)} · This date will be kept.</p>}{joinRun && !dialog.batch ? <p className="payroll-initiation-reference">These payments join {runLabel(joinRun.run)} and use its initiation date, {formatDate(joinRun.date)}.</p> : <><label htmlFor="instructor-payment-date">{dialog.batch ? 'Actual payment date' : 'Payment initiation date'} <span>*</span></label><DateInput id="instructor-payment-date" className="input-field"  required value={paymentDay} onChange={e => setPaymentDay(e.target.value)} /><button type="button" className="text-button" onClick={()=>setPaymentDay(today())}>Use today</button></>}<p className="policy-note">{dialog.batch ? "Confirm only after the employee has actually received this payment." : 'This salary will move to Processing. The actual payment date stays empty until you confirm payment.'}</p>{dialogError && <div className="alert-error" role="alert">{dialogError}</div>}<div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={saving} onClick={() => setDialog(null)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : dialog.batch ? 'Mark as paid' : 'Start processing'}</button></div></form></div></Dialog>}</AnimatePresence>
  </section>;
}

function InstructorSalarySelection({ rows, selected, name, onToggle, mode='unpaid' }) {
  const ids = rows.map(row => row.id);
  const count = ids.filter(id => selected.includes(id)).length;
  return <div className="payroll-instructor-select-all"><label><input type="checkbox" aria-label={`Select all ${mode} salary for ${name}`} checked={ids.length > 0 && count === ids.length} disabled={!ids.length} ref={node => { if (node) node.indeterminate = count > 0 && count < ids.length; }} onChange={() => onToggle(ids)} /><span><strong>Select all {mode} salary</strong><small>{ids.length ? `${ids.length} cycles · ${money(rows.reduce((sum, row) => sum + row.amount, 0))} EGP · across all branches` : `No ${mode} salary for this employee`}</small></span></label></div>;
}
