import {recordClientFailure} from '../utils/activity';
import {useEffect,useRef,useState} from 'react';
import axios from 'axios';
import {toast} from 'react-hot-toast';
import {Upload,FileSpreadsheet,X,Search,CheckCircle,AlertTriangle} from 'lucide-react';
import Dialog from './Dialog';
import {BRANCHES} from '../Constants';
import '../styles/_employeeImport.scss';
export default function EmployeeImportDialog({onClose,onSaved}){
 const [mappings,setMappings]=useState({}),[previewKey,setPreviewKey]=useState(null),[filter,setFilter]=useState('ALL'),[file,setFile]=useState(null),[preview,setPreview]=useState(null),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState([]),[search,setSearch]=useState(''),[page,setPage]=useState(0),[retry,setRetry]=useState(0);
 const busy=useRef(false);
 const loaded=useRef(null);
 const mappingKey=JSON.stringify(mappings);
 useEffect(()=>{
  setError('');setPage(0);setFilter('ALL');setSelected([]);
  if(!file){loaded.current=null;setPreview(null);setLoading(false);return;}
  if(!file.name.toLowerCase().endsWith('.xlsx') || file.size>2*1024*1024){recordClientFailure('Rejected employee workbook: choose an .xlsx file smaller than 2 MB.',file.name);setPreview(null);setError('Choose an .xlsx workbook smaller than 2 MB.');setLoading(false);return;}
  const controller=new AbortController();setLoading(true);
  const timer=setTimeout(()=>{
   const cached=loaded.current?.file===file?loaded.current:null;
   const request=cached?axios.post('/employees/import/preview',{previewToken:cached.token,branchMappings:mappings},{signal:controller.signal}):axios.post('/employees/import/preview',file,{headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},signal:controller.signal});
   request.then(({data})=>{if(controller.signal.aborted)return;
    loaded.current={file,token:data.previewToken};setPreview(data);
    const resolved=JSON.stringify(data.branchMappings);
    setMappings(data.branchMappings);setPreviewKey(resolved);
    setSelected(data.rows.filter(r=>r.action!=='ERROR').map(r=>r.rowNumber));
   }).catch(e=>{if(!controller.signal.aborted){setPreviewKey(null);setError(e.response?.data?.error||'Workbook could not be read.');}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  },180);
  return()=>{clearTimeout(timer);controller.abort();};
 },[file,mappingKey,retry]);
 function chooseBranch(key,branch,checked){setMappings(old=>({...old,[key]:BRANCHES.filter(b=>b===branch?checked:(old[key]||[]).includes(b))}));}
 async function save(){
  if(busy.current||loading||previewKey!==mappingKey||!preview||!selected.length)return;
  busy.current=true;setSaving(true);setError('');
  try{const {data}=await axios.post('/employees/import/commit',{previewToken:preview.previewToken,rows:selected});toast.success(data.message);await onSaved();onClose();}
  catch(e){setError(e.response?.data?.error||'Employees could not be imported. Nothing was changed.');}
  finally{busy.current=false;setSaving(false);}
 }
 const valid=preview?.rows.filter(r=>r.action!=='ERROR')||[],visible=(preview?.rows||[]).filter(r=>(filter==='ALL'||r.action===filter)&&(!search||`${r.name} ${r.employeeId}`.toLowerCase().includes(search.toLowerCase().trim()))),pages=Math.ceil(visible.length/30);
 return <Dialog title="Import employees" onClose={saving?()=>{}:onClose}><div className="modal-content card employee-import-dialog"><div className="employee-import-heading"><span><FileSpreadsheet size={23}/></span><div><h2>Import employees</h2><p>Add people or extend their branch memberships.</p></div><button type="button" className="icon-button" disabled={saving} aria-label="Close employee import" onClick={onClose}><X size={19}/></button></div>
 <div className="employee-import-inputs employee-import-upload"><div><label htmlFor="employee-import-file">Excel workbook <span>*</span></label><input id="employee-import-file" className="input-field" type="file" accept=".xlsx" disabled={saving} onChange={e=>{loaded.current=null;setPreview(null);setMappings({});setPreviewKey(null);setFile(e.target.files?.[0]||null);}}/></div><p className="employee-import-note">Read all employee sheets automatically. Review and change branch assignments below before importing. Existing employees gain branches; their existing memberships and details stay intact.</p></div>
 {preview&&<section className="employee-import-mapping" aria-label="Branch assignments"><div className="employee-import-mapping-heading"><div><h3>Review branch assignments</h3><p>{preview.sourceRowCount} source rows across {preview.sheetNames.length} employee sheet{preview.sheetNames.length===1?'':'s'} · {preview.sheetNames.join(', ')}</p></div><span>All assignments are editable</span></div>
 {preview.skippedSheets.length>0&&<p className="employee-import-note">Skipped sheets without employee headers: {preview.skippedSheets.join(', ')}</p>}
 {preview.branchGroups.map(group=><fieldset key={group.key} className="employee-import-branches employee-import-branch-group"><legend><span dir="auto">{group.label}</span><small>{group.count} source rows</small></legend><p>{group.suggestedBranches.length===3?'Alexandria suggested: Miami, Fouad and Abu-Qeer. Change this if needed.':group.suggestedBranches.length?'Recognized from the workbook. You can change the assignment.':group.key?'Unrecognized branch: choose where these employees work.':'No branch supplied: choose one or more branches for this group.'} <strong>Required *</strong></p><div>{BRANCHES.map(branch=><label key={branch} className={(mappings[group.key]||[]).includes(branch)?'is-selected':''}><input type="checkbox" checked={(mappings[group.key]||[]).includes(branch)} disabled={saving} onChange={e=>chooseBranch(group.key,branch,e.target.checked)}/>{branch}</label>)}</div></fieldset>)}
 </section>}
 {loading&&<div className="loading-state" role="status"><span className="loading-spinner"/>Reading employees…</div>}
 {error&&<div role="alert" className="alert-error">{error}{file&&<button type="button" className="text-button" disabled={loading} onClick={()=>{loaded.current=null;setRetry(n=>n+1);}}>Read again</button>}</div>}
 {preview&&!loading&&<><div className="employee-import-summary" aria-label="Filter import results">{[['ALL','All rows'],['CREATE','New'],['ADD_BRANCH','Branch additions'],['ERROR','Errors']].map(([value,label])=><button type="button" key={value} aria-pressed={filter===value} className={`${filter===value?'is-active ':''}${value==='ERROR'?'import-errors':''}`} onClick={()=>{setFilter(value);setPage(0);}}>{value==='ERROR'?<AlertTriangle size={16}/>:value==='CREATE'?<CheckCircle size={16}/>:null}{value==='ALL'?preview.rows.length:preview.rows.filter(r=>r.action===value).length} {label}</button>)}</div>
 {valid.length<preview.rows.length&&<p className="employee-import-note">Rows with errors cannot be selected. You can import the valid rows now, or correct the workbook and upload it again.</p>}
 <div className="employee-import-toolbar"><label><input type="checkbox" disabled={saving||!valid.length} checked={!!valid.length&&selected.length===valid.length} onChange={e=>setSelected(e.target.checked?valid.map(r=>r.rowNumber):[])}/>Select all valid rows</label><div className="search-field"><Search size={15}/><input aria-label="Search imported employees" placeholder="Search this file…" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></div></div>
 <div className="table-scroll employee-import-table"><table className="data-table"><thead><tr><th>Select</th><th>Source</th><th>Employee</th><th>Employee ID</th><th>Result</th></tr></thead><tbody>{visible.slice(page*30,page*30+30).map(row=><tr key={row.rowNumber}><td><input type="checkbox" aria-label={`Import row ${row.rowNumber}`} disabled={saving||row.action==='ERROR'} checked={selected.includes(row.rowNumber)} onChange={e=>setSelected(old=>e.target.checked?[...old,row.rowNumber]:old.filter(n=>n!==row.rowNumber))}/></td><td>{row.sources.map(source=><small key={`${source.sheetName}:${source.rowNumber}`}><span dir="auto">{source.sheetName}</span> · row {source.rowNumber}</small>)}</td><td dir="auto"><strong>{row.name||'Missing name'}</strong>{row.existing&&<small>Current branches: {row.existing.branches}</small>}</td><td>{row.employeeId||'Missing ID'}</td><td><span className={`employee-import-status status-${row.action.toLowerCase()}`}>{row.action==='CREATE'?'New employee':row.action==='ADD_BRANCH'?'Add branch':'Error'}</span>{row.action!=='ERROR'&&<small>Branches to add: {row.missingBranches.join(', ')}</small>}{row.issues.map(issue=><small className="employee-import-error" key={issue}>{issue}</small>)}</td></tr>)}{!visible.length&&<tr><td colSpan={5} className="employee-import-empty">{filter==='ERROR'&&!search?'No errors in this file.':'No rows match this filter.'}</td></tr>}</tbody></table></div>
 <div className="employee-import-pagination"><span>{selected.length} selected · {visible.length} shown / {preview.rows.length} rows · selection includes hidden rows</span>{pages>1&&<div><button type="button" className="text-button" disabled={page===0} onClick={()=>setPage(n=>n-1)}>Previous</button><span>{page+1} / {pages}</span><button type="button" className="text-button" disabled={page+1>=pages} onClick={()=>setPage(n=>n+1)}>Next</button></div>}</div></>}
 <div className="payment-entry-actions"><button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="button" className="btn-primary" disabled={saving||loading||!preview||previewKey!==mappingKey||!selected.length} onClick={save}><Upload size={16}/>{saving?'Importing…':`Import ${selected.length||''} employees`}</button></div>
 </div></Dialog>;
}
