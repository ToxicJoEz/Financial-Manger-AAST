import ExcelExportButton from '../components/ExcelExportButton';
import payrollReportStyles from '../styles/_payrollReport.scss?inline';
import { MotionRegion, MotionTab } from '../components/WorkspaceMotion';
import { useState, useEffect, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { DollarSign, Building2, UserCircle, Download, FileSpreadsheet, Calendar, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import CustomFilterDropdown from '../components/CustomFilterDropdown';
import { PageHeading, Metric, money, localMonth } from '../components/WorkspaceUI';
import { Check, ArrowRight, RotateCcw } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
const Finances = () => {
  const {
    user
  } = useContext(AuthContext);
  if (user && user.role === 'user') {
    return <Navigate to="/courses" replace />;
  }
  const [month, setMonth] = useState(localMonth()); // 'YYYY-MM'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [updating, setUpdating] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('instructors'); // 'instructors', 'branches', 'courses'
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('All');
  const [filterInstructor, setFilterInstructor] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  useEffect(() => {
    fetchFinances();
  }, [month]);
  const fetchFinances = async (isBackground = false) => {
    if (!month) return;
    if (!isBackground) setLoading(true);
    setLoadError(false);
    try {
      const res = await axios.get(`/finances?month=${month}`);
      setData(res.data);
    } catch (error) {
      setLoadError(true);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
  const formatCurrency = amount => {
    return new Intl.NumberFormat('en-EG', {
      style: 'currency',
      currency: 'EGP'
    }).format(amount);
  };
  const handleTogglePaid = async (courseId, currentStatus) => {
    setUpdating(courseId);
    try {
      await axios.put(`/courses/${courseId}/payment`, {
        isPaid: !currentStatus
      });
      toast.success(currentStatus ? 'Marked as unpaid' : 'Marked as paid');
      await fetchFinances(true);
    } catch (error) {
      toast.error('Failed to update payment status');
    } finally {
      setUpdating(null);
    }
  };
  const handleExportPDF = async () => {
    if (exporting || !data || data.instructors.length === 0) return;
    setExporting(true);
    try {
      // Load the report renderer only when requested, keeping normal navigation light.
      const {
        default: html2pdf
      } = await import('html2pdf.js');
      const element = document.createElement('div');

      // Filter and map instructors
      const rowsHtml = data.instructors.filter(inst => (inst.totalPaid || 0) > 0).map((inst, idx) => `
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
        filename: `Payroll_Report_${month}_${new Date().getTime()}.pdf`,
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
      await html2pdf().set(opt).from(element).save();
    } catch {
      toast.error('Could not export the report. Please try again.');
    } finally {
      setExporting(false);
    }
  };
  const filteredCourses = data?.courses?.filter(c => {
    if (filterPaymentStatus === 'Paid' && !c.isPaid) return false;
    if (filterPaymentStatus === 'Pending' && c.isPaid) return false;
    if (filterInstructor && !c.instructorNames.includes(filterInstructor)) return false;
    if (filterCourse && !c.name.toLowerCase().includes(filterCourse.toLowerCase())) return false;
    if (filterBranch && c.branch !== filterBranch) return false;
    return true;
  }) || [];
  const uniqueInstructors = [...new Set(data?.courses?.flatMap(c => c.instructorNames.split(', ')) || [])];
  const uniqueBranches = [...new Set(data?.courses?.map(c => c.branch) || [])];
  return <div className="payroll-page">
      <PageHeading eyebrow="FINANCE & SETTLEMENT" title="Monthly payroll" description="Every teaching hour, brought into balance.">
        <div className="payroll-toolbar"><label className="month-control"><Calendar size={15} /><input aria-label="Payroll month" type="month" required value={month} onChange={e => {
            if (e.target.value) setMonth(e.target.value);
          }} /></label>
        <ExcelExportButton initialMonth={month} /><button className="btn-primary" onClick={handleExportPDF} disabled={exporting || loading || !data?.instructors?.some(i => i.totalPaid > 0)}><Download size={15} />{exporting ? 'Preparing report…' : 'Export paid report'}</button></div>
      </PageHeading>
      {loadError ? <div className="panel empty-state"><h3>Payroll couldn't be loaded</h3><p>Please check your connection and try again.</p><button className="btn-secondary" onClick={() => fetchFinances()}>Try again</button></div> : loading ? <div className="loading-state"><span className="loading-spinner" />Loading this month's payroll…</div> : !data?.courses?.length ? <div className="panel empty-state"><FileSpreadsheet size={32} /><h3>No payroll for this month yet</h3><p>Complete a course and assign it to this payroll month to see its hours and payouts here.</p></div> : <>
        <div className="metric-grid">
          <Metric label="Total payroll" value={<><small>EGP</small>{money(data.summary.totalPayroll)}</>} detail={data.courses.length + ' completed courses this month'} />
          <Metric tone="teal" label="Paid to date" value={<><small>EGP</small>{money(data.summary.totalPaid)}</>} detail={data.courses.filter(c => c.isPaid).length + ' courses settled'} />
          <Metric tone="peach" label="Awaiting payment" value={<><small>EGP</small>{money(data.summary.totalUnpaid)}</>} detail={data.courses.filter(c => !c.isPaid).length + ' courses outstanding'} />
          <Metric tone="violet" label="Teaching team" value={String(data.instructors.length).padStart(2, '0')} detail={data.branches.length + ' branches represented'} />
        </div>
        <div className="section-tabs" aria-label="Payroll breakdown">
          {[['instructors', 'Instructor payroll', data.instructors.length], ['branches', 'Branch expenses', data.branches.length], ['courses', 'Course breakdown', data.courses.length]].map(([value, label, count]) => <MotionTab key={value} active={activeTab === value} onClick={() => setActiveTab(value)}>{label}<span>{count}</span></MotionTab>)}
        </div>
        <MotionRegion transitionKey={activeTab} className="panel">
          {activeTab === 'courses' ? <div className="filter-toolbar"><div className="search-field"><Search size={16} /><input aria-label="Filter payroll courses" placeholder="Search courses…" value={filterCourse} onChange={e => setFilterCourse(e.target.value)} /></div><div className="filter-select"><CustomFilterDropdown value={filterPaymentStatus} onChange={val => setFilterPaymentStatus(val || 'All')} placeholder="All payment statuses" options={[{
              value: 'Paid',
              label: 'Paid'
            }, {
              value: 'Pending',
              label: 'Awaiting payment'
            }]} /></div><div className="filter-select"><CustomFilterDropdown value={filterInstructor} onChange={setFilterInstructor} placeholder="All instructors" options={uniqueInstructors.map(i => ({
              value: i,
              label: i
            }))} /></div><div className="filter-select"><CustomFilterDropdown value={filterBranch} onChange={setFilterBranch} placeholder="All branches" options={uniqueBranches.map(b => ({
              value: b,
              label: b
            }))} /></div></div> : <div className="payroll-caption"><h2>{activeTab === 'instructors' ? 'Instructor earnings' : 'Expenses by branch'}</h2><span>All amounts in Egyptian pounds · EGP</span></div>}
          <div className="table-scroll"><table className="data-table payroll-table">
            <thead>{activeTab === 'instructors' ? <tr><th>Instructor</th><th>Courses</th><th>Hours</th><th className="number">Outstanding</th><th className="number">Paid</th><th className="number">Total earnings</th></tr> : activeTab === 'branches' ? <tr><th>Branch</th><th>Share of payroll</th><th className="number">Outstanding</th><th className="number">Paid</th><th className="number">Total expense</th></tr> : <tr><th>Course / branch</th><th>Teaching hours</th><th className="number">Course payout</th><th>Payment</th></tr>}</thead>
            <tbody>
              {activeTab === 'instructors' && data.instructors.map(i => <tr key={i.id}><td><div className="instructor-name"><span className="mini-avatar">{i.name.slice(0, 1)}</span><span><strong>{i.name}</strong><small>{i.employeeId || 'No employee ID'}</small></span></div></td><td>{i.coursesTaught}</td><td className="tabular">{i.totalHours}<span className="muted"> h</span></td><td className="number">{i.totalUnpaid ? money(i.totalUnpaid) : <span className="muted-number">—</span>}</td><td className="number">{i.totalPaid ? money(i.totalPaid) : <span className="muted-number">—</span>}</td><td className="number currency">{money(i.totalPayout)}</td></tr>)}
              {activeTab === 'branches' && data.branches.map(b => <tr key={b.name}><td><strong className="table-title">{b.name}</strong></td><td><span className="muted">{data.summary.totalPayroll ? Math.round(b.totalPayout / data.summary.totalPayroll * 100) : 0}%</span><div className="branch-share"><span style={{
                      "--runtime-width": (data.summary.totalPayroll ? b.totalPayout / data.summary.totalPayroll * 100 : 0) + '%'
                    }} className="finances-presentation-11" /></div></td><td className="number">{b.totalUnpaid ? money(b.totalUnpaid) : <span className="muted-number">—</span>}</td><td className="number">{b.totalPaid ? money(b.totalPaid) : <span className="muted-number">—</span>}</td><td className="number currency">{money(b.totalPayout)}</td></tr>)}
              {activeTab === 'courses' && filteredCourses.map(c => <tr key={c.id}><td><strong className="table-title">{c.name}</strong><small>{c.branch}</small></td><td>{c.instructors.map((i, index) => <div key={index}>{i.name}<small>{i.hoursTaught || 0} h × {money(i.hourlyRate)} EGP</small></div>)}</td><td className="number currency">{money(c.totalPayout)}</td><td><button className={'payment-toggle ' + (c.isPaid ? 'paid' : '')} disabled={updating !== null} onClick={() => handleTogglePaid(c.id, c.isPaid)} title={c.isPaid ? 'Mark this course as unpaid' : 'Mark this course as paid'}>{updating === c.id ? 'Updating…' : c.isPaid ? 'Paid · Undo' : 'Mark as paid'}</button></td></tr>)}
            </tbody>
          </table></div>
          {activeTab === 'courses' && !filteredCourses.length && <div className="empty-state"><h3>No matching courses</h3><p>Adjust the filters to find the courses you're looking for.</p><button className="btn-secondary" onClick={() => {
            setFilterCourse('');
            setFilterInstructor('');
            setFilterBranch('');
            setFilterPaymentStatus('All');
          }}>Reset filters</button></div>}
          <div className="panel-footnote"><span className="status-dot" />Based on completed courses assigned to this payroll month.<span>Paid reports include settled amounts only.</span></div>
        </MotionRegion>
      </>}
    </div>;
};
export default Finances;
