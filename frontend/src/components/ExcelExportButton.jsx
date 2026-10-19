import { useContext, useEffect, useRef, useState, useId } from 'react';
import axios from 'axios';
import { FileSpreadsheet, ChevronDown } from 'lucide-react';
import Dialog from './Dialog';
import { AuthContext } from '../context/AuthContext';
import '../styles/_excelExport.scss';
const titles = {
  courses: 'Cycles',
  tuition: 'Student tuition',
  payroll: 'Instructor payroll'
};
function ExportSelect({
  label,
  value,
  onChange,
  options
}) {
  const [open, setOpen] = useState(false),
    id = useId(),
    ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return <div className="export-select" ref={ref}><span id={id}>{label}</span><button type="button" className="input-field" aria-labelledby={id} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    }}>{options.find(o => o.value === value)?.label || 'All'}<ChevronDown size={14} /></button>
    {open && <div className="export-select-menu" role="menu" aria-labelledby={id} onKeyDown={e => {
      const items = [...e.currentTarget.querySelectorAll('[role=menuitemradio]')];
      const index = items.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus();
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        ref.current.querySelector('button').focus();
      }
    }}>{options.map(o => <button key={o.value} type="button" role="menuitemradio" aria-checked={o.value === value} onClick={() => {
        onChange(o.value);
        setOpen(false);
        ref.current.querySelector('button').focus();
      }}>{o.label}</button>)}</div>}
  </div>;
}
function ExportDialog({
  onClose,
  initialMonth, parentCourseId
}) {
  const {
      user
    } = useContext(AuthContext),
    manager = ['admin', 'mod'].includes(user.role);
  const [options, setOptions] = useState(null),
    [selected, setSelected] = useState({}),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({
    parentCourseId: parentCourseId || '',
    branch: '',
    courseId: '',
    from: initialMonth ? `${initialMonth}-01` : '',
    to: initialMonth ? new Date(Date.UTC(Number(initialMonth.slice(0, 4)), Number(initialMonth.slice(5, 7)), 0)).toISOString().slice(0, 10) : '',
    tuitionStatus: '',
    payrollStatus: '',
    includeArchived: false
  });
  useEffect(() => {
    const controller = new AbortController();
    axios.get('/exports/options', {
      signal: controller.signal
    }).then(({
      data
    }) => {
      setOptions(data);
      setSelected(Object.fromEntries(Object.entries(data.sheets).map(([key, cols]) => [key, Object.keys(cols)])));
    }).catch(e => {
      if (!controller.signal.aborted) setError(e.response?.data?.error || 'Export options could not be loaded. Close and try again.');
    });
    return () => controller.abort();
  }, []);
  const change = (key, value) => setFilters(previous => ({
    ...previous,
    [key]: value,
    ...(key === 'branch' || key === 'includeArchived' ? {
      courseId: ''
    } : {})
  }));
  const submit = async e => {
    e.preventDefault();
    setError('');
    const sheets = Object.fromEntries(Object.entries(selected).filter(([, cols]) => cols.length));
    if (!Object.keys(sheets).length) return setError('Select at least one column in a worksheet.');
    if (filters.from && filters.to && filters.from > filters.to) return setError('The end date must be on or after the start date.');
    setBusy(true);
    try {
      const {
        data
      } = await axios.post('/exports', {
        sheets,
        filters
      });
      if (!data.sheets.some(sheet => sheet.rows.length)) {
        setError('No records match these filters. Try a wider date range or another course.');
        return;
      }
      const {
        createExcelBuffer,
        downloadExcel
      } = await import('../utils/excelExport');
      downloadExcel(await createExcelBuffer(data));
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'The export could not be prepared. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const all = [{
    value: '',
    label: 'All'
  }];
  return <Dialog title="Export Excel workbook" onClose={busy ? () => {} : onClose}><div className="modal-content card excel-export-dialog"><h3>Make the report yours.</h3><p className="muted">Choose worksheets, columns, and the records you need.</p>
    <form onSubmit={submit} aria-busy={busy}>
      {!options ? <p role="status">{error || 'Loading export options…'}</p> : <fieldset disabled={busy} className="export-controls">
        <div className="export-filter-grid">
          <ExportSelect label="Branch" value={filters.branch} onChange={v => change('branch', v)} options={[...all, ...options.branches.map(value => ({
              value,
              label: value
            }))]} />
          <ExportSelect label="Cycle" value={filters.courseId} onChange={v => change('courseId', v)} options={[...all, ...options.courses.filter(c => (!parentCourseId || c.parentCourseId === parentCourseId) && (!filters.branch || c.branch === filters.branch) && (filters.includeArchived || !c.archivedAt)).map(c => ({
              value: c.id,
              label: `${c.name} · ${c.branch}${c.archivedAt ? ' (archived)' : ''}`
            }))]} />
          <label>From date<input className="input-field" type="date" value={filters.from} onChange={e => change('from', e.target.value)} /></label>
          <label>Through date<input className="input-field" type="date" value={filters.to} onChange={e => change('to', e.target.value)} /></label>
          <ExportSelect label="Student payment status" value={filters.tuitionStatus} onChange={v => change('tuitionStatus', v)} options={[...all, ...['PAID', 'PARTIAL', 'UNPAID', 'EXEMPT'].map(value => ({
              value,
              label: value
            }))]} />
          {manager && <ExportSelect label="Instructor payment status" value={filters.payrollStatus} onChange={v => change('payrollStatus', v)} options={[...all, ...['PAID', 'UNPAID'].map(value => ({
              value,
              label: value
            }))]} />}
        </div>
        <p className="export-help">Dates use course start date (creation date when unset), enrollment date, or payroll month for each worksheet. Payroll includes the entire selected months. Payment filters apply to their corresponding data; course totals always show the full course.</p>
        {manager && <label className="export-check"><input type="checkbox" checked={filters.includeArchived} onChange={e => change('includeArchived', e.target.checked)} />Include archived courses and financial records</label>}
        <div className="export-worksheets">{Object.entries(options.sheets).map(([sheet, columns]) => <fieldset key={sheet} className="export-sheet"><legend>{titles[sheet]}</legend><button type="button" className="btn-secondary" onClick={() => setSelected(prev => ({
                ...prev,
                [sheet]: prev[sheet]?.length ? [] : Object.keys(columns)
              }))}>{selected[sheet]?.length ? 'Clear worksheet' : 'Select all columns'}</button><div className="export-column-grid">{Object.entries(columns).map(([key, label]) => <label className="export-check" key={key}><input type="checkbox" checked={selected[sheet]?.includes(key) || false} onChange={e => setSelected(prev => ({
                    ...prev,
                    [sheet]: e.target.checked ? [...(prev[sheet] || []), key] : prev[sheet].filter(c => c !== key)
                  }))} />{label}</label>)}</div></fieldset>)}</div>
      </fieldset>}
      {error && options && <p role="alert" className="alert-error">{error}</p>}
      <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="btn-primary" type="submit" disabled={busy || !options}>{busy ? 'Preparing workbook…' : 'Download Excel'}</button></div>
    </form></div></Dialog>;
}
export default function ExcelExportButton({
  initialMonth, parentCourseId
}) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="btn-secondary" onClick={() => setOpen(true)}><FileSpreadsheet size={16} />Export Excel</button>{open && <ExportDialog parentCourseId={parentCourseId} initialMonth={initialMonth} onClose={() => setOpen(false)} />}</>;
}
